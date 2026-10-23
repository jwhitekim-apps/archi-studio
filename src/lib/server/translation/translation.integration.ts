// 로컬 Supabase가 떠 있어야 하는 통합 테스트. 실행: npm run test:auth
// 가드와 번역 라우트를 실제로 거치고, 실제 DB 행과 SQL 함수(archi_find_translation)를 쓴다. AI는 가짜 제공자다.
import { createClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createFakeProvider, type AiProvider } from '../ai';
import { Browser } from '../auth-harness';
import { supabaseClientOptions as options } from '../supabase-options';
import { testHooks } from './deps';
import { supabaseTranslationRepository } from './repository';

const env = import.meta.env;
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);

const runId = Date.now();
const prefix = `translate-it-${runId}`;
const password = 'password-ok-1';
const MISSING = '00000000-0000-4000-8000-000000000000';

let n = 0;
const ips: string[] = [];
const freshIp = () => {
	const ip = `tit-${runId}-${n++}`;
	ips.push(ip);
	return ip;
};

async function loggedIn(name: string): Promise<{ b: Browser; id: string }> {
	const email = `${prefix}-${name}@example.test`;
	const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
	if (error || !data.user) throw error ?? new Error('테스트 계정 생성 실패');
	const profile = await admin.from('archi_profiles').insert({ user_id: data.user.id, approved: true });
	if (profile.error) throw profile.error;
	const b = new Browser(freshIp());
	expect((await b.request('POST', '/api/auth/login', { email, password })).status).toBe(200);
	return { b, id: data.user.id };
}

async function addPaper(userId: string, key: string): Promise<string> {
	const { data, error } = await admin
		.from('papers')
		.insert({ user_id: userId, item_key: key, item_version: 1, title: key, authors: [], synced_at: new Date().toISOString() })
		.select('id')
		.single();
	if (error) throw error;
	return data.id as string;
}

async function rows(userId: string) {
	const { data, error } = await admin
		.from('archi_translations')
		.select('source_text, translated_text, type, paper_id')
		.eq('user_id', userId)
		.order('created_at');
	if (error) throw error;
	return data;
}

// 호출 횟수를 세는 가짜 제공자
function counting(chunks: string[]): AiProvider & { calls: number } {
	const fake = createFakeProvider({ chunks });
	const counted = {
		name: 'fake' as const,
		calls: 0,
		complete: fake.complete,
		stream(req: Parameters<AiProvider['stream']>[0]) {
			counted.calls++;
			return fake.stream(req);
		}
	};
	return counted;
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

afterEach(() => {
	delete testHooks.provider;
});

afterAll(async () => {
	if (ips.length) await admin.from('archi_login_attempts').delete().in('ip', ips);
	const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
	for (const u of data?.users ?? []) {
		if (u.email?.startsWith(prefix)) await admin.auth.admin.deleteUser(u.id);
	}
});

describe('2.2 저장소', () => {
	let user: { b: Browser; id: string };
	beforeAll(async () => {
		user = await loggedIn('repo');
	});

	it('저장 후 조회하고, 논문 행을 지우면 연결된 이력이 함께 지워진다', async () => {
		const repo = supabaseTranslationRepository(admin);
		const paper = await addPaper(user.id, 'R1');
		expect(await repo.ownsPaper(user.id, paper)).toBe(true);
		expect(await repo.findTranslation(user.id, 'repo text', paper)).toBeNull();

		await repo.saveTranslation({ userId: user.id, paperId: paper, sourceText: 'repo text', translatedText: '저장소 번역', type: 'sentence' });
		expect(await repo.findTranslation(user.id, 'repo text', paper)).toEqual({ translatedText: '저장소 번역', paperLinked: true });
		expect(await repo.findTranslation(user.id, 'repo text', null)).toEqual({ translatedText: '저장소 번역', paperLinked: false });
		expect(await repo.listHistory(user.id, { paperId: paper, limit: 10 })).toMatchObject([
			{ sourceText: 'repo text', translatedText: '저장소 번역', type: 'sentence', paperId: paper }
		]);

		const del = await admin.from('papers').delete().eq('id', paper);
		expect(del.error).toBeNull();
		expect(await repo.listHistory(user.id, { paperId: paper, limit: 10 })).toEqual([]);
		expect(await repo.findTranslation(user.id, 'repo text', null)).toBeNull();
	});
});

describe('4.1 POST /api/translate', () => {
	let user: { b: Browser; id: string };
	let mine: string;
	let other: { b: Browser; id: string };
	let theirs: string;
	beforeAll(async () => {
		user = await loggedIn('post');
		other = await loggedIn('post-other');
		mine = await addPaper(user.id, 'P1');
		theirs = await addPaper(other.id, 'P2');
	});

	it('200으로 조각을 보내고 이력 1행을 저장하며, 같은 문장 재요청은 모델을 부르지 않는다', async () => {
		const fake = counting(['주의', '(attention)']);
		testHooks.provider = fake;
		const res = await user.b.request('POST', '/api/translate', { text: '  attention  ', paperId: mine });
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
		expect(res.headers.get('x-cache')).toBe('MISS');
		expect(text(res.bytes)).toBe('주의(attention)');
		expect(await rows(user.id)).toEqual([{ source_text: 'attention', translated_text: '주의(attention)', type: 'word', paper_id: mine }]);

		const again = await user.b.request('POST', '/api/translate', { text: 'attention' });
		expect(again.status).toBe(200);
		expect(again.headers.get('x-cache')).toBe('HIT');
		expect(text(again.bytes)).toBe('주의(attention)');
		expect(fake.calls).toBe(1);
		expect(await rows(user.id)).toHaveLength(1);
	});

	it('attention 다음 attention is all you need를 번역하면 이력 type이 word, sentence 순이다', async () => {
		const typed = await loggedIn('types');
		testHooks.provider = createFakeProvider({ chunks: ['번역'] });
		expect((await typed.b.request('POST', '/api/translate', { text: 'attention' })).status).toBe(200);
		expect((await typed.b.request('POST', '/api/translate', { text: 'attention is all you need' })).status).toBe(200);
		const { items } = (await typed.b.request('GET', '/api/translate/history')).body as { items: { sourceText: string; type: string; paperId: string | null }[] };
		expect(items.map((i) => [i.sourceText, i.type, i.paperId])).toEqual([
			['attention is all you need', 'sentence', null],
			['attention', 'word', null]
		]);
	});

	it.each<[string, unknown, string | undefined]>([
		['빈 값', { text: '   ' }, undefined],
		['text 없음', {}, undefined],
		['paperId 형식', { text: 'x', paperId: 'abc' }, undefined],
		['JSON 아님', undefined, '{not json']
	])('400 %s', async (_, body, raw) => {
		const fake = counting(['x']);
		testHooks.provider = fake;
		const res = await user.b.request('POST', '/api/translate', body, raw);
		expect(res.status).toBe(400);
		expect(res.body).toMatchObject({ error: { code: 'invalid_request' } });
		expect(fake.calls).toBe(0);
	});

	it('413 5001자, 모델을 부르지 않는다', async () => {
		const fake = counting(['x']);
		testHooks.provider = fake;
		const res = await user.b.request('POST', '/api/translate', { text: 'a'.repeat(5001) });
		expect(res.status).toBe(413);
		expect(res.body).toMatchObject({ error: { code: 'payload_too_large' } });
		expect(fake.calls).toBe(0);
	});

	it('404 없는 id와 남의 id가 같은 본문이고 모델을 부르지 않으며 저장하지 않는다', async () => {
		const fake = counting(['x']);
		testHooks.provider = fake;
		const missing = await user.b.request('POST', '/api/translate', { text: 'not saved', paperId: MISSING });
		const foreign = await user.b.request('POST', '/api/translate', { text: 'not saved', paperId: theirs });
		expect(missing.status).toBe(404);
		expect(foreign.status).toBe(404);
		expect(foreign.body).toEqual(missing.body);
		expect(missing.body).toMatchObject({ error: { code: 'paper_not_found' } });
		expect(fake.calls).toBe(0);
		expect((await rows(user.id)).filter((r) => r.source_text === 'not saved')).toEqual([]);
	});

	it('502 ai_unavailable, 503 ai_not_configured', async () => {
		testHooks.provider = createFakeProvider({ error: 'ai_rate_limited' });
		const unavailable = await user.b.request('POST', '/api/translate', { text: 'fails here' });
		expect(unavailable.status).toBe(502);
		expect(unavailable.body).toMatchObject({ error: { code: 'ai_unavailable' } });

		testHooks.provider = createFakeProvider({ error: 'ai_not_configured' });
		const unconfigured = await user.b.request('POST', '/api/translate', { text: 'fails here' });
		expect(unconfigured.status).toBe(503);
		expect(unconfigured.body).toMatchObject({ error: { code: 'ai_not_configured' } });
		expect((await rows(user.id)).filter((r) => r.source_text === 'fails here')).toEqual([]);
	});

	it('401 쿠키 없음, 미승인 계정', async () => {
		testHooks.provider = createFakeProvider({ chunks: ['x'] });
		expect((await new Browser(freshIp()).request('POST', '/api/translate', { text: 'x' })).status).toBe(401);

		const late = await loggedIn('unapproved');
		const revoke = await admin.from('archi_profiles').update({ approved: false }).eq('user_id', late.id);
		expect(revoke.error).toBeNull();
		expect((await late.b.request('POST', '/api/translate', { text: 'x' })).status).toBe(401);
	});
});

describe('4.3 GET /api/translate/history', () => {
	let user: { b: Browser; id: string };
	let paper: string;
	let theirs: string;
	beforeAll(async () => {
		user = await loggedIn('history');
		const stranger = await loggedIn('history-other');
		paper = await addPaper(user.id, 'H1');
		theirs = await addPaper(stranger.id, 'H2');
		const base = Date.UTC(2026, 0, 1);
		const inserted = await admin.from('archi_translations').insert(
			Array.from({ length: 60 }, (_, i) => ({
				user_id: user.id,
				paper_id: i < 3 ? paper : null,
				source_text: `source ${i}`,
				translated_text: `번역 ${i}`,
				type: 'sentence',
				created_at: new Date(base + i * 1000).toISOString()
			}))
		);
		expect(inserted.error).toBeNull();
	});

	type Items = { items: { id: string; sourceText: string; translatedText: string; type: string; paperId: string | null; createdAt: string }[] };

	it('limit 없이 최근 50개를 최신순으로, 필드는 {id, sourceText, translatedText, type, paperId, createdAt}', async () => {
		const res = await user.b.request('GET', '/api/translate/history');
		expect(res.status).toBe(200);
		const { items } = res.body as Items;
		expect(items).toHaveLength(50);
		expect(items[0].sourceText).toBe('source 59');
		expect(items[49].sourceText).toBe('source 10');
		expect(Object.keys(items[0]).sort()).toEqual(['createdAt', 'id', 'paperId', 'sourceText', 'translatedText', 'type']);
	});

	it('limit=5는 5개', async () => {
		const { items } = (await user.b.request('GET', '/api/translate/history?limit=5')).body as Items;
		expect(items.map((i) => i.sourceText)).toEqual(['source 59', 'source 58', 'source 57', 'source 56', 'source 55']);
	});

	it.each(['limit=0', 'limit=201', 'limit=abc', 'paperId=abc'])('%s는 400 invalid_request', async (query) => {
		const res = await user.b.request('GET', `/api/translate/history?${query}`);
		expect(res.status).toBe(400);
		expect(res.body).toMatchObject({ error: { code: 'invalid_request' } });
	});

	it('paperId를 주면 그 논문의 이력만, 남의 논문 id는 빈 목록', async () => {
		const mine = (await user.b.request('GET', `/api/translate/history?paperId=${paper}`)).body as Items;
		expect(mine.items.map((i) => i.sourceText)).toEqual(['source 2', 'source 1', 'source 0']);
		expect(mine.items.every((i) => i.paperId === paper)).toBe(true);

		const foreign = await user.b.request('GET', `/api/translate/history?paperId=${theirs}`);
		expect(foreign.status).toBe(200);
		expect(foreign.body).toEqual({ items: [] });
	});

	it('쿠키 없음은 401', async () => {
		expect((await new Browser(freshIp()).request('GET', '/api/translate/history')).status).toBe(401);
	});
});

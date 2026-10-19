// 로컬 Supabase가 떠 있어야 하는 통합 테스트. 실행: npm run test:auth
// 가드와 papers·collections 라우트를 실제로 거친다. papers 행은 서비스 키로 직접 채운다.
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Browser } from './auth-harness';
import { supabaseClientOptions as options } from './supabase-options';

const env = import.meta.env;
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);

const runId = Date.now();
const prefix = `papers-it-${runId}`;
const password = 'password-ok-1';

let n = 0;
const ips: string[] = [];
const freshIp = () => {
	const ip = `pit-${runId}-${n++}`;
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

// 연결 정보 없이 논문만 채운다. papers.user_id는 auth.users를 가리키므로 folio_users 행이 없어도 된다.
async function addPaper(userId: string, i: number, extra: Record<string, unknown> = {}) {
	const { data, error } = await admin
		.from('papers')
		.insert({
			user_id: userId,
			item_key: `K${i}`,
			item_version: 1,
			title: `Paper ${i}`,
			authors: ['Some Author'],
			year: '2020',
			synced_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
			...extra
		})
		.select('id')
		.single();
	if (error) throw error;
	return data.id as string;
}

afterAll(async () => {
	if (ips.length) await admin.from('archi_login_attempts').delete().in('ip', ips);
	const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
	for (const u of data?.users ?? []) {
		if (u.email?.startsWith(prefix)) await admin.auth.admin.deleteUser(u.id);
	}
});

type ListBody = { items: { id: string; title: string }[]; nextCursor: string | null };

describe('2.2 GET /api/papers', () => {
	let user: { b: Browser; id: string };
	const ids: string[] = [];
	beforeAll(async () => {
		user = await loggedIn('list');
	});

	it('빈 서재는 200 { items: [], nextCursor: null }', async () => {
		const res = await user.b.request('GET', '/api/papers');
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ items: [], nextCursor: null });
	});

	it('제목 검색, 저자 검색, 컬렉션 필터, 최근 동기화 순', async () => {
		ids.push(await addPaper(user.id, 1, { title: 'Attention Is All You Need', collections: ['COLA'] }));
		ids.push(await addPaper(user.id, 2, { title: 'Other', authors: ['Jane Attention'], collections: ['COLA', 'COLB'] }));
		ids.push(await addPaper(user.id, 3, { title: 'Gain of 50% more', year: 'n.d.' }));
		ids.push(await addPaper(user.id, 4, { title: null, attachment_key: 'AT', attachment_type: 'pdf', has_memo: true }));

		const all = (await user.b.request('GET', '/api/papers')).body as ListBody;
		expect(all.items.map((i) => i.id)).toEqual([...ids].reverse());
		expect(all.items[0]).toMatchObject({ title: '', hasPdf: true, hasMemo: true, year: 2020 });
		expect(all.items[1]).toMatchObject({ year: null, hasPdf: false });

		const byTitleOrAuthor = (await user.b.request('GET', '/api/papers?query=attention')).body as ListBody;
		expect(byTitleOrAuthor.items.map((i) => i.id).sort()).toEqual([ids[0], ids[1]].sort());
		const literal = (await user.b.request('GET', `/api/papers?query=${encodeURIComponent('50%')}`)).body as ListBody;
		expect(literal.items.map((i) => i.id)).toEqual([ids[2]]);
		const byCollection = (await user.b.request('GET', '/api/papers?collection=COLB')).body as ListBody;
		expect(byCollection.items.map((i) => i.id)).toEqual([ids[1]]);
	});

	it('limit=2로 끝까지 따라가면 중복과 누락이 없다', async () => {
		const seen: string[] = [];
		let cursor: string | null = null;
		let pages = 0;
		do {
			const res = await user.b.request('GET', `/api/papers?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
			const body = res.body as ListBody;
			seen.push(...body.items.map((i) => i.id));
			cursor = body.nextCursor;
			pages++;
		} while (cursor);
		expect(pages).toBe(2);
		expect(seen).toHaveLength(4);
		expect(new Set(seen).size).toBe(4);
		expect(seen.sort()).toEqual([...ids].sort());
	});

	it('limit=0, limit=201, 숫자가 아닌 limit, 깨진 cursor는 400 invalid_request', async () => {
		for (const q of ['limit=0', 'limit=201', 'limit=abc', 'limit=1.5', 'cursor=garbage']) {
			const res = await user.b.request('GET', `/api/papers?${q}`);
			expect(res.status, q).toBe(400);
			expect(res.body).toMatchObject({ error: { code: 'invalid_request' } });
		}
		expect((await user.b.request('GET', '/api/papers?limit=200')).status).toBe(200);
	});

	it('쿠키가 없으면 401', async () => {
		const res = await new Browser(freshIp()).request('GET', '/api/papers');
		expect(res.status).toBe(401);
		expect(res.body).toMatchObject({ error: { code: 'unauthenticated' } });
	});

	it('다른 사용자의 논문은 목록에 나오지 않는다', async () => {
		const other = await loggedIn('list-other');
		const res = await other.b.request('GET', '/api/papers');
		expect(res.body).toEqual({ items: [], nextCursor: null });
	});
});

describe('2.3 GET /api/papers/{id}', () => {
	it('모든 상세 필드와 번역·분석 개수를 돌려준다', async () => {
		const { b, id } = await loggedIn('detail');
		const paperId = await addPaper(id, 1, { s2_paper_id: 'S2ABC', attachment_key: 'AT', attachment_type: 'html' });
		await admin.from('archi_translations').insert([
			{ user_id: id, paper_id: paperId, source_text: 'a', translated_text: 'ㄱ', type: 'word' },
			{ user_id: id, paper_id: paperId, source_text: 'b', translated_text: 'ㄴ', type: 'word' }
		]);
		await admin.from('archi_analyses').insert({ user_id: id, paper_id: paperId, result: {} });

		const res = await b.request('GET', `/api/papers/${paperId}`);
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			id: paperId,
			title: 'Paper 1',
			authors: ['Some Author'],
			year: 2020,
			collections: [],
			hasPdf: false,
			hasMemo: false,
			itemKey: 'K1',
			s2PaperId: 'S2ABC',
			attachment: { type: 'html' },
			translationCount: 2,
			analysisCount: 1
		});
	});

	it('없는 id와 UUID가 아닌 id는 404 paper_not_found', async () => {
		const { b } = await loggedIn('detail-404');
		for (const id of ['00000000-0000-4000-8000-000000000000', 'not-a-uuid', '123']) {
			const res = await b.request('GET', `/api/papers/${id}`);
			expect(res.status, id).toBe(404);
			expect(res.body).toMatchObject({ error: { code: 'paper_not_found' } });
		}
	});
});

describe('2.4 GET /api/collections', () => {
	it('key, name, parentKey, paperCount를 돌려주고 개수가 실제와 같다', async () => {
		const { b, id } = await loggedIn('collections');
		expect((await b.request('GET', '/api/collections')).body).toEqual([]);

		await admin.from('folio_users').insert({ id, zotero_user_id: `pit-${runId}`, zotero_username: 'x' });
		await admin.from('archi_collections').insert([
			{ user_id: id, key: 'AAA', name: 'Alpha', parent_key: null },
			{ user_id: id, key: 'BBB', name: 'Beta', parent_key: 'AAA' },
			{ user_id: id, key: 'CCC', name: 'Empty', parent_key: null }
		]);
		await addPaper(id, 1, { collections: ['AAA'] });
		await addPaper(id, 2, { collections: ['AAA', 'BBB'] });
		await addPaper(id, 3, { collections: [] });

		const res = await b.request('GET', '/api/collections');
		expect(res.status).toBe(200);
		expect(res.body).toEqual([
			{ key: 'AAA', name: 'Alpha', parentKey: null, paperCount: 2 },
			{ key: 'BBB', name: 'Beta', parentKey: 'AAA', paperCount: 1 },
			{ key: 'CCC', name: 'Empty', parentKey: null, paperCount: 0 }
		]);
	});
});

// 로컬 Supabase(npm run db:start)와 가짜 Zotero 서버가 필요한 통합 테스트. 실행: npm run test:auth
// 가드와 zotero 라우트를 실제로 거치고, Zotero는 테스트 안에서 띄운 가짜 서버가 대신한다.
import { createClient } from '@supabase/supabase-js';
import { env as privateEnv } from '$env/dynamic/private';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Browser } from '../auth-harness';
import { supabaseClientOptions as options } from '../supabase-options';
import { startFakeZotero, type FakeZotero } from './fake-zotero';

const env = import.meta.env;
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);

const runId = Date.now();
const prefix = `zotero-it-${runId}`;
const password = 'password-ok-1';
const ENC_SECRET = Buffer.alloc(32, 5).toString('base64');

let zotero: FakeZotero;
let n = 0;
const ips: string[] = [];
const freshIp = () => {
	const ip = `zit-${runId}-${n++}`;
	ips.push(ip);
	return ip;
};

// 승인된 계정을 만들고 로그인한 브라우저를 돌려준다.
async function loggedIn(name: string): Promise<{ b: Browser; id: string }> {
	const email = `${prefix}-${name}@example.test`;
	const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
	if (error || !data.user) throw error ?? new Error('테스트 계정 생성 실패');
	const profile = await admin.from('archi_profiles').insert({ user_id: data.user.id, approved: true });
	if (profile.error) throw profile.error;
	const b = new Browser(freshIp());
	const res = await b.request('POST', '/api/auth/login', { email, password });
	expect(res.status).toBe(200);
	return { b, id: data.user.id };
}

// connect → (가짜 Zotero 승인) → callback 까지 진행한다.
async function connectFlow(b: Browser, opts: { verifier?: string | null; problem?: boolean; tokenOverride?: string } = {}) {
	const start = await b.request('GET', '/api/zotero/connect');
	expect(start.status).toBe(302);
	const token = new URL(start.headers.get('location')!).searchParams.get('oauth_token')!;
	const qs = new URLSearchParams({ oauth_token: opts.tokenOverride ?? token });
	if (opts.verifier !== null) qs.set('oauth_verifier', opts.verifier ?? 'verifier-1');
	if (opts.problem) qs.set('oauth_problem', 'user_refused');
	return b.request('GET', `/api/zotero/callback?${qs}`);
}

beforeAll(async () => {
	zotero = await startFakeZotero();
	// $env/dynamic/private는 시작 때의 사본이라 process.env를 바꿔도 보이지 않는다. 같은 객체에 직접 쓴다.
	privateEnv.ZOTERO_CLIENT_KEY = 'client-key';
	privateEnv.ZOTERO_CLIENT_SECRET = 'client-secret';
	privateEnv.APP_BASE_URL = 'http://localhost';
	privateEnv.ZOTERO_KEY_ENCRYPTION_SECRET = ENC_SECRET;
	privateEnv.ZOTERO_API_BASE_URL = zotero.url;
	privateEnv.ZOTERO_OAUTH_BASE_URL = zotero.url;
});

afterAll(async () => {
	await zotero.close();
	if (ips.length) await admin.from('archi_login_attempts').delete().in('ip', ips);
	const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
	for (const u of data?.users ?? []) {
		if (u.email?.startsWith(prefix)) await admin.auth.admin.deleteUser(u.id);
	}
});

describe('3.1 GET /api/zotero/connect', () => {
	it('로그인한 사용자는 302로 인가 주소와 암호화된 대기 쿠키를 받는다', async () => {
		const { b } = await loggedIn('connect');
		const res = await b.request('GET', '/api/zotero/connect');
		expect(res.status).toBe(302);
		const location = new URL(res.headers.get('location')!);
		expect(location.origin).toBe(zotero.url);
		expect(location.pathname).toBe('/oauth/authorize');
		expect(location.searchParams.get('oauth_token')).toMatch(/^req-/);

		const cookie = res.setCookies.find((c) => c.name === 'archi_zotero_oauth')!;
		expect(cookie.options.httpOnly).toBe(true);
		expect(cookie.options.sameSite).toBe('lax');
		expect(cookie.options.maxAge).toBe(600);
		expect(cookie.value.startsWith('v1.')).toBe(true);
		expect(cookie.value).not.toContain('reqsecret');
	});

	it('로그인하지 않으면 401 unauthenticated', async () => {
		const res = await new Browser(freshIp()).request('GET', '/api/zotero/connect');
		expect(res.status).toBe(401);
		expect(res.body).toMatchObject({ error: { code: 'unauthenticated' } });
	});
});

describe('3.2 GET /api/zotero/callback', () => {
	it('정상 승인: /library로 이동하고 키는 암호문으로만 저장되며 me.zoteroConnected가 true', async () => {
		const { b, id } = await loggedIn('cb-ok');
		const res = await connectFlow(b);
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe('/library');
		expect(res.deleted).toContain('archi_zotero_oauth');

		const { data } = await admin.from('folio_users').select('*').eq('id', id).single();
		expect(data.zotero_user_id).toBe(zotero.userId);
		expect(data.zotero_username).toBe(zotero.username);
		expect(data.zotero_api_key.startsWith('v1.')).toBe(true);
		expect(data.zotero_api_key).not.toContain(zotero.apiKey);
		expect(JSON.stringify(res.body)).not.toContain(zotero.apiKey);

		const me = await b.request('GET', '/api/auth/me');
		expect(me.body).toMatchObject({ zoteroConnected: true });
		await admin.from('folio_users').delete().eq('id', id); // zotero_user_id unique라 다음 시험을 위해 비운다
	});

	it('승인 거부(verifier 없음, oauth_problem)는 행을 만들지 않고 /settings?zotero=denied', async () => {
		const a = await loggedIn('cb-deny-a');
		const noVerifier = await connectFlow(a.b, { verifier: null });
		expect(noVerifier.status).toBe(302);
		expect(noVerifier.headers.get('location')).toBe('/settings?zotero=denied');

		const c = await loggedIn('cb-deny-b');
		const problem = await connectFlow(c.b, { problem: true });
		expect(problem.headers.get('location')).toBe('/settings?zotero=denied');

		const rows = await admin.from('folio_users').select('id').in('id', [a.id, c.id]);
		expect(rows.data).toEqual([]);
	});

	it('쿠키의 token과 다른 oauth_token은 /settings?zotero=error', async () => {
		const { b, id } = await loggedIn('cb-mismatch');
		const res = await connectFlow(b, { tokenOverride: 'someone-elses-token' });
		expect(res.headers.get('location')).toBe('/settings?zotero=error');
		const rows = await admin.from('folio_users').select('id').eq('id', id);
		expect(rows.data).toEqual([]);
	});

	it('대기 쿠키 없이 부르면 /settings?zotero=error', async () => {
		const { b } = await loggedIn('cb-nocookie');
		const res = await b.request('GET', '/api/zotero/callback?oauth_token=x&oauth_verifier=y');
		expect(res.headers.get('location')).toBe('/settings?zotero=error');
	});

	it('다른 Zotero 계정으로 다시 연결하면 동기화 상태가 지워지고 같은 계정이면 유지된다', async () => {
		const { b, id } = await loggedIn('cb-switch');
		await connectFlow(b);
		await admin.from('folio_sync_state').insert([
			{ user_id: id, key: 'lastVersion', value: '55' },
			{ user_id: id, key: 'failedItemKeys', value: '["X"]' },
			{ user_id: id, key: 'lastSyncedAt', value: '2026-01-01T00:00:00.000Z' }
		]);
		const keys = async () =>
			((await admin.from('folio_sync_state').select('key').eq('user_id', id)).data ?? []).map((r) => r.key).sort();

		await connectFlow(b); // 같은 계정
		expect(await keys()).toEqual(['failedItemKeys', 'lastSyncedAt', 'lastVersion']);

		const original = zotero.userId;
		zotero.userId = '777';
		try {
			await connectFlow(b); // 다른 계정
		} finally {
			zotero.userId = original;
		}
		expect(await keys()).toEqual(['lastSyncedAt']);
		await admin.from('folio_users').delete().eq('id', id);
	});

	it('같은 Zotero 계정을 다른 사용자가 연결하려 하면 /settings?zotero=in_use이고 첫 사용자는 그대로다', async () => {
		const first = await loggedIn('cb-use-a');
		await connectFlow(first.b);
		const second = await loggedIn('cb-use-b');
		const res = await connectFlow(second.b);
		expect(res.headers.get('location')).toBe('/settings?zotero=in_use');
		const rows = await admin.from('folio_users').select('id').in('id', [first.id, second.id]);
		expect(rows.data).toEqual([{ id: first.id }]);
		await admin.from('folio_users').delete().eq('id', first.id);
	});
});

describe('3.3 GET /api/zotero/status, DELETE /api/zotero/connection', () => {
	it('연결 전 false, 연결 후 사용자 이름과 마지막 동기화 시각, 해제는 키만 지운다', async () => {
		const { b, id } = await loggedIn('status');
		expect((await b.request('GET', '/api/zotero/status')).body).toEqual({ connected: false });

		await connectFlow(b);
		const status = await b.request('GET', '/api/zotero/status');
		expect(status.body).toEqual({ connected: true, zoteroUsername: zotero.username, lastSyncedAt: null });

		await admin.from('folio_papers').insert({ user_id: id, item_key: 'P1', item_version: 1, title: 't' });
		const del = await b.request('DELETE', '/api/zotero/connection');
		expect(del.status).toBe(204);

		const row = await admin.from('folio_users').select('zotero_user_id, zotero_api_key').eq('id', id).single();
		expect(row.data).toEqual({ zotero_user_id: zotero.userId, zotero_api_key: null });
		const papers = await admin.from('folio_papers').select('item_key').eq('user_id', id);
		expect(papers.data).toEqual([{ item_key: 'P1' }]);
		expect((await b.request('GET', '/api/zotero/status')).body).toEqual({ connected: false });
		await admin.from('folio_users').delete().eq('id', id);
	});

	it('세션 없는 요청은 모두 401', async () => {
		const b = new Browser(freshIp());
		for (const [method, path] of [
			['GET', '/api/zotero/status'],
			['DELETE', '/api/zotero/connection'],
			['GET', '/api/zotero/callback?oauth_token=x']
		] as const) {
			expect((await b.request(method, path)).status).toBe(401);
		}
	});
});

// 연결된 사용자를 새로 만들어 동기화를 부른다. 가짜 Zotero는 시험마다 새로 띄운다.
async function connectedUser(name: string) {
	const user = await loggedIn(name);
	const res = await connectFlow(user.b);
	expect(res.headers.get('location')).toBe('/library');
	return user;
}

const papersOf = async (id: string) =>
	((await admin.from('papers').select('*').eq('user_id', id).order('item_key')).data ?? []) as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
const folioPapersOf = async (id: string) =>
	((await admin.from('folio_papers').select('*').eq('user_id', id).order('item_key')).data ?? []) as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any

let freshZoteroCount = 0;
// Zotero 계정 번호는 시험마다 달라야 한다(zotero_user_id가 unique라 이전 시험의 연결과 겹치면 안 된다).
async function withFreshZotero<T>(run: () => Promise<T>): Promise<T> {
	const previous = zotero;
	zotero = await startFakeZotero({ userId: String(9000 + runId % 1000 * 100 + freshZoteroCount++) });
	privateEnv.ZOTERO_API_BASE_URL = zotero.url;
	privateEnv.ZOTERO_OAUTH_BASE_URL = zotero.url;
	try {
		return await run();
	} finally {
		await zotero.close();
		zotero = previous;
		privateEnv.ZOTERO_API_BASE_URL = zotero.url;
		privateEnv.ZOTERO_OAUTH_BASE_URL = zotero.url;
	}
}

describe('4.2 동기화 알고리즘', () => {
	it('첫 동기화는 전체, 항목 하나만 바꾼 두 번째는 updated 1, 지운 항목은 두 표에서 사라진다', () =>
		withFreshZotero(async () => {
			const a = zotero.addItem({ title: 'Paper A', creators: [{ firstName: 'Ada', lastName: 'Lovelace' }, { name: 'Org Inc' }], date: '2021-05-03' });
			const b = zotero.addItem({ title: 'Page B | Some Site | Pub', itemType: 'webpage', date: 'n.d.' });
			zotero.addItem({ title: 'Paper C' });
			zotero.addCollection('COL1', 'Design');
			zotero.addCollection('COL2', 'Sub', 'COL1');
			zotero.addChild(a.key, { itemType: 'attachment', contentType: 'text/html' });
			zotero.addChild(a.key, { itemType: 'attachment', contentType: 'application/pdf' });
			zotero.addChild(a.key, { itemType: 'note', tags: [{ tag: 'zotero-insight:memo' }] });
			const { b: browser, id } = await connectedUser('sync-basic');

			const first = await browser.request('POST', '/api/zotero/sync');
			expect(first.status).toBe(200);
			expect(first.body).toMatchObject({ added: 3, updated: 0, removed: 0 });
			expect(typeof (first.body as { syncedAt: string }).syncedAt).toBe('string');

			const rows = await papersOf(id);
			expect(rows.map((r) => r.title)).toEqual(['Paper A', 'Page B', 'Paper C']);
			const rowA = rows.find((r) => r.item_key === a.key)!;
			expect(rowA).toMatchObject({ authors: ['Ada Lovelace', 'Org Inc'], year: '2021', attachment_type: 'pdf', has_memo: true });
			expect(rows.find((r) => r.item_key === b.key)).toMatchObject({ year: 'n.d.', attachment_key: null, has_memo: false });
			expect((await folioPapersOf(id)).map((r) => r.title)).toEqual(['Paper A', 'Page B', 'Paper C']);

			const cols = await admin.from('archi_collections').select('key, name, parent_key').eq('user_id', id).order('key');
			expect(cols.data).toEqual([
				{ key: 'COL1', name: 'Design', parent_key: null },
				{ key: 'COL2', name: 'Sub', parent_key: 'COL1' }
			]);
			const status = await browser.request('GET', '/api/zotero/status');
			expect((status.body as { lastSyncedAt: string }).lastSyncedAt).toBe((first.body as { syncedAt: string }).syncedAt);

			// s2_paper_id는 동기화가 건드리지 않는다.
			await admin.from('papers').update({ s2_paper_id: 'S2-KEEP' }).eq('id', rowA.id);
			zotero.bumpItem(a.key, { title: 'Paper A v2' });
			const second = await browser.request('POST', '/api/zotero/sync');
			expect(second.body).toMatchObject({ added: 0, updated: 1, removed: 0 });
			expect((await papersOf(id)).find((r) => r.item_key === a.key)).toMatchObject({ title: 'Paper A v2', s2_paper_id: 'S2-KEEP', id: rowA.id });

			zotero.removeItem(b.key);
			const third = await browser.request('POST', '/api/zotero/sync');
			expect(third.body).toMatchObject({ added: 0, updated: 0, removed: 1 });
			expect((await papersOf(id)).map((r) => r.item_key)).not.toContain(b.key);
			expect((await folioPapersOf(id)).map((r) => r.item_key)).not.toContain(b.key);

			const quiet = await browser.request('POST', '/api/zotero/sync');
			expect(quiet.body).toMatchObject({ added: 0, updated: 0, removed: 0 });
		}));

	it('첨부만 새로 붙은 부모(부모 버전은 그대로)도 갱신된다', () =>
		withFreshZotero(async () => {
			const a = zotero.addItem({ title: 'No attachment yet' });
			const { b: browser, id } = await connectedUser('sync-attach');
			await browser.request('POST', '/api/zotero/sync');
			expect((await papersOf(id))[0].attachment_key).toBeNull();

			const att = zotero.addChild(a.key, { itemType: 'attachment', contentType: 'application/pdf' });
			const res = await browser.request('POST', '/api/zotero/sync');
			expect(res.body).toMatchObject({ added: 0, updated: 1 });
			expect((await papersOf(id))[0]).toMatchObject({ attachment_key: att.key, attachment_type: 'pdf' });
		}));

	it('자식 조회가 실패한 항목은 건너뛰고 나머지는 반영되며 다음 동기화에서 복구된다', () =>
		withFreshZotero(async () => {
			zotero.addItem({ title: 'Good' });
			const bad = zotero.addItem({ title: 'Flaky' });
			zotero.failChildrenFor.add(bad.key);
			const { b: browser, id } = await connectedUser('sync-retry');

			const first = await browser.request('POST', '/api/zotero/sync');
			expect(first.body).toMatchObject({ added: 1 });
			expect((await papersOf(id)).map((r) => r.title)).toEqual(['Good']);
			const state = await admin.from('folio_sync_state').select('value').eq('user_id', id).eq('key', 'failedItemKeys').single();
			expect(JSON.parse(state.data!.value)).toEqual([bad.key]);

			zotero.failChildrenFor.clear();
			const second = await browser.request('POST', '/api/zotero/sync');
			expect(second.body).toMatchObject({ added: 1, updated: 0 });
			expect((await papersOf(id)).map((r) => r.title)).toEqual(['Good', 'Flaky']);
			const after = await admin.from('folio_sync_state').select('value').eq('user_id', id).eq('key', 'failedItemKeys').single();
			expect(JSON.parse(after.data!.value)).toEqual([]);
		}));
});

describe('4.3 POST /api/zotero/sync', () => {
	it('연결하지 않은 사용자는 409 zotero_not_connected, 해제 뒤에도 같다', () =>
		withFreshZotero(async () => {
			const { b } = await loggedIn('sync-noconn');
			const res = await b.request('POST', '/api/zotero/sync');
			expect(res.status).toBe(409);
			expect(res.body).toMatchObject({ error: { code: 'zotero_not_connected' } });
		}));

	it('Zotero가 500이면 502 zotero_unavailable, 본문에 키와 응답 원문이 없고 이전 목록은 그대로', () =>
		withFreshZotero(async () => {
			zotero.addItem({ title: 'Stays' });
			const { b: browser, id } = await connectedUser('sync-502');
			await browser.request('POST', '/api/zotero/sync');

			zotero.failStatus = 500;
			const res = await browser.request('POST', '/api/zotero/sync');
			expect(res.status).toBe(502);
			expect(res.body).toMatchObject({ error: { code: 'zotero_unavailable' } });
			const text = JSON.stringify(res.body);
			expect(text).not.toContain(zotero.apiKey);
			expect(text).not.toContain('upstream failure body');
			expect((await papersOf(id)).map((r) => r.title)).toEqual(['Stays']);
		}));

	it('같은 사용자의 동기화 두 건을 동시에 보내면 순서대로 처리되어 둘 다 성공하고 중복이 없다', () =>
		withFreshZotero(async () => {
			for (let i = 0; i < 6; i++) zotero.addItem({ title: `P${i}` });
			const { b: browser, id } = await connectedUser('sync-concurrent');
			const [r1, r2] = await Promise.all([
				browser.request('POST', '/api/zotero/sync'),
				browser.request('POST', '/api/zotero/sync')
			]);
			expect([r1.status, r2.status]).toEqual([200, 200]);
			const added = [r1, r2].map((r) => (r.body as { added: number }).added).sort();
			expect(added).toEqual([0, 6]);
			expect(await papersOf(id)).toHaveLength(6);
			expect(await folioPapersOf(id)).toHaveLength(6);
		}));
});

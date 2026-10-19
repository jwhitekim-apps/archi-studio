// 로컬 Supabase와 가짜 Zotero·가짜 웹 서버가 필요한 통합 테스트. 실행: npm run test:auth
// 원문 파일, 웹페이지 추가, 삭제, 그리고 모든 papers 경로의 접근 제어를 확인한다.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { env as privateEnv } from '$env/dynamic/private';
import { zipSync, strToU8 } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Browser } from './auth-harness';
import { testHooks } from './papers-http';
import { isBlockedIp } from './ssrf';
import { supabaseClientOptions as options } from './supabase-options';
import { encryptSecret } from './zotero/crypto';
import { startFakeZotero, type FakeZotero } from './zotero/fake-zotero';

const env = import.meta.env;
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);

const runId = Date.now();
const prefix = `pz-it-${runId}`;
const password = 'password-ok-1';
const ENC_SECRET = Buffer.alloc(32, 6).toString('base64');

let zotero: FakeZotero;
let web: Server;
let webPort: number;
let n = 0;
const zoteroIds = new Map<string, string>();
const ips: string[] = [];
const freshIp = () => {
	const ip = `pzit-${runId}-${n++}`;
	ips.push(ip);
	return ip;
};

interface User {
	b: Browser;
	id: string;
}

async function loggedIn(name: string, connected: boolean): Promise<User> {
	const email = `${prefix}-${name}@example.test`;
	const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
	if (error || !data.user) throw error ?? new Error('테스트 계정 생성 실패');
	const profile = await admin.from('archi_profiles').insert({ user_id: data.user.id, approved: true });
	if (profile.error) throw profile.error;
	if (connected) {
		// 연결 흐름은 zotero.integration.ts가 시험한다. 여기서는 저장된 상태만 만든다.
		// zotero_user_id는 사용자마다 달라야 한다(unique). 가짜 서버는 이 번호들을 같은 라이브러리로 받는다.
		const zoteroUserId = `${zotero.userId}${++n}`;
		zotero.acceptUser(zoteroUserId);
		zoteroIds.set(data.user.id, zoteroUserId);
		const row = await admin.from('folio_users').insert({
			id: data.user.id,
			zotero_user_id: zoteroUserId,
			zotero_username: 'fake',
			zotero_api_key: encryptSecret(zotero.apiKey, ENC_SECRET)
		});
		if (row.error) throw row.error;
	}
	const b = new Browser(freshIp());
	expect((await b.request('POST', '/api/auth/login', { email, password })).status).toBe(200);
	return { b, id: data.user.id };
}

async function addPaper(userId: string, extra: Record<string, unknown> = {}) {
	const item = zotero.addItem({ title: 'Zotero side' });
	const { data, error } = await admin
		.from('papers')
		.insert({ user_id: userId, item_key: item.key, item_version: item.version, title: 'Mine', ...extra })
		.select('id')
		.single();
	if (error) throw error;
	return { id: data.id as string, itemKey: item.key };
}

const zoteroUserIdOf = (userId: string) => zoteroIds.get(userId)!;
const paperIds = async (userId: string) =>
	((await admin.from('papers').select('id, item_key').eq('user_id', userId)).data ?? []) as { id: string; item_key: string }[];

beforeAll(async () => {
	zotero = await startFakeZotero({ userId: String(7000 + (runId % 1000)) });
	privateEnv.ZOTERO_API_BASE_URL = zotero.url;
	privateEnv.ZOTERO_OAUTH_BASE_URL = zotero.url;
	privateEnv.ZOTERO_KEY_ENCRYPTION_SECRET = ENC_SECRET;

	web = createServer((req, res) => {
		if (req.url === '/with-title') res.end('<html><head><title>Hello Page | Some Site</title></head></html>');
		else res.end('<html><body>no title here</body></html>');
	});
	await new Promise<void>((r) => web.listen(0, '127.0.0.1', r));
	webPort = (web.address() as AddressInfo).port;
	// 가짜 웹 서버는 루프백에 있다. 이름을 풀어 그 주소만 공개로 보고 나머지 사설 주소는 그대로 막는다.
	testHooks.ssrf = {
		resolve: async (host) => (host === 'private.test' ? [{ address: '10.0.0.5', family: 4 }] : [{ address: '127.0.0.1', family: 4 }]),
		isBlocked: (ip) => ip !== '127.0.0.1' && isBlockedIp(ip)
	};
});

afterAll(async () => {
	testHooks.ssrf = undefined;
	await zotero.close();
	await new Promise<void>((r) => web.close(() => r()));
	if (ips.length) await admin.from('archi_login_attempts').delete().in('ip', ips);
	const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
	for (const u of data?.users ?? []) {
		if (u.email?.startsWith(prefix)) await admin.auth.admin.deleteUser(u.id);
	}
});

describe('3.1 GET /api/papers/{id}/file', () => {
	it('PDF는 200 application/pdf, inline, 본문이 Zotero의 바이트와 같다', async () => {
		const { b, id } = await loggedIn('file-pdf', true);
		const pdf = Buffer.from('%PDF-1.4 fake pdf bytes \u0000\u0001\u0002 end');
		const paper = await addPaper(id, { attachment_key: 'PDFATT1', attachment_type: 'pdf' });
		zotero.setFile('PDFATT1', pdf, 'application/pdf');

		const res = await b.request('GET', `/api/papers/${paper.id}/file`);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('application/pdf');
		expect(res.headers.get('content-disposition')).toBe('inline');
		expect(Buffer.from(res.bytes).equals(pdf)).toBe(true);
	});

	it('zip으로 묶인 HTML 스냅샷은 풀린 HTML이 text/html과 CSP 헤더로 온다', async () => {
		const { b, id } = await loggedIn('file-html', true);
		const html = '<html><body><script>alert(1)</script><p>snapshot</p></body></html>';
		const paper = await addPaper(id, { attachment_key: 'HTMLATT1', attachment_type: 'html' });
		zotero.setFile('HTMLATT1', Buffer.from(zipSync({ 'readme.txt': strToU8('x'), 'index.html': strToU8(html) })), 'application/zip');

		const res = await b.request('GET', `/api/papers/${paper.id}/file`);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('text/html');
		expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
		expect(new TextDecoder().decode(res.bytes)).toBe(html);

		// zip이 아닌 평범한 HTML도 그대로 온다.
		const plain = await addPaper(id, { attachment_key: 'HTMLATT2', attachment_type: 'html' });
		zotero.setFile('HTMLATT2', Buffer.from('<p>plain</p>'), 'text/html');
		const res2 = await b.request('GET', `/api/papers/${plain.id}/file`);
		expect(new TextDecoder().decode(res2.bytes)).toBe('<p>plain</p>');
	});

	it('첨부가 없거나 Zotero에 파일이 없으면 404 attachment_not_found', async () => {
		const { b, id } = await loggedIn('file-noatt', true);
		const none = await addPaper(id);
		const res = await b.request('GET', `/api/papers/${none.id}/file`);
		expect(res.status).toBe(404);
		expect(res.body).toMatchObject({ error: { code: 'attachment_not_found' } });

		const missing = await addPaper(id, { attachment_key: 'GONEATT', attachment_type: 'pdf' });
		const res2 = await b.request('GET', `/api/papers/${missing.id}/file`);
		expect(res2.status).toBe(404);
		expect(res2.body).toMatchObject({ error: { code: 'attachment_not_found' } });
	});

	it('Zotero를 연결하지 않았으면 409, Zotero가 실패하면 502이고 키나 응답 원문이 없다', async () => {
		const unconnected = await loggedIn('file-unconn', false);
		const p1 = await addPaper(unconnected.id, { attachment_key: 'X', attachment_type: 'pdf' });
		const r1 = await unconnected.b.request('GET', `/api/papers/${p1.id}/file`);
		expect(r1.status).toBe(409);
		expect(r1.body).toMatchObject({ error: { code: 'zotero_not_connected' } });

		const { b, id } = await loggedIn('file-502', true);
		const p2 = await addPaper(id, { attachment_key: 'Y', attachment_type: 'pdf' });
		zotero.failStatus = 500;
		try {
			const r2 = await b.request('GET', `/api/papers/${p2.id}/file`);
			expect(r2.status).toBe(502);
			expect(r2.body).toMatchObject({ error: { code: 'zotero_unavailable' } });
			const text = JSON.stringify(r2.body);
			expect(text).not.toContain(zotero.apiKey);
			expect(text).not.toContain('upstream failure body');
		} finally {
			zotero.failStatus = null;
		}
	});
});

describe('3.3 POST /api/papers/webpage', () => {
	const url = (path: string) => `http://public.test:${webPort}${path}`;

	it('유효한 URL은 201과 새 논문 상세이고 제목은 | 꼬리를 뗀 페이지 <title>', async () => {
		const { b, id } = await loggedIn('web-ok', true);
		const res = await b.request('POST', '/api/papers/webpage', { url: url('/with-title') });
		expect(res.status).toBe(201);
		expect(res.body).toMatchObject({
			title: 'Hello Page',
			authors: [],
			hasPdf: false,
			attachment: { type: null },
			translationCount: 0,
			analysisCount: 0
		});
		const body = res.body as { id: string; itemKey: string };
		expect(zotero.items.find((i) => i.key === body.itemKey)?.data).toMatchObject({ itemType: 'webpage', url: url('/with-title') });
		expect((await paperIds(id)).map((p) => p.id)).toEqual([body.id]);
		expect((await b.request('GET', `/api/papers/${body.id}`)).status).toBe(200);
	});

	it('제목을 못 읽으면 URL이 제목이 되고, 같은 URL을 두 번 보내도 (user_id, item_key) 중복이 없다', async () => {
		const { b, id } = await loggedIn('web-notitle', true);
		const first = await b.request('POST', '/api/papers/webpage', { url: url('/no-title') });
		const second = await b.request('POST', '/api/papers/webpage', { url: url('/no-title') });
		expect([first.status, second.status]).toEqual([201, 201]);
		expect(first.body).toMatchObject({ title: url('/no-title') });
		const rows = await paperIds(id);
		expect(rows).toHaveLength(2);
		expect(new Set(rows.map((r) => r.item_key)).size).toBe(2);
	});

	it('ftp, 빈 값, 본문 없음, 사설 주소는 400 invalid_request이고 Zotero에 항목을 만들지 않는다', async () => {
		const { b, id } = await loggedIn('web-bad', true);
		const itemsBefore = zotero.items.length;
		for (const body of [{ url: 'ftp://example.com/x' }, { url: '' }, {}, { url: 123 }, { url: 'http://10.0.0.1/' }, { url: 'http://169.254.169.254/latest' }, { url: 'http://private.test/x' }]) {
			const res = await b.request('POST', '/api/papers/webpage', body);
			expect(res.status, JSON.stringify(body)).toBe(400);
			expect(res.body).toMatchObject({ error: { code: 'invalid_request' } });
		}
		expect(zotero.items.length).toBe(itemsBefore);
		expect(await paperIds(id)).toEqual([]);
	});

	it('Zotero 미연결은 409, Zotero 장애는 502이고 목록은 바뀌지 않는다', async () => {
		const unconnected = await loggedIn('web-unconn', false);
		const r1 = await unconnected.b.request('POST', '/api/papers/webpage', { url: url('/with-title') });
		expect(r1.status).toBe(409);
		expect(r1.body).toMatchObject({ error: { code: 'zotero_not_connected' } });

		const { b, id } = await loggedIn('web-502', true);
		zotero.failStatus = 500;
		try {
			const r2 = await b.request('POST', '/api/papers/webpage', { url: url('/with-title') });
			expect(r2.status).toBe(502);
			expect(r2.body).toMatchObject({ error: { code: 'zotero_unavailable' } });
		} finally {
			zotero.failStatus = null;
		}
		expect(await paperIds(id)).toEqual([]);
	});
});

describe('3.4 DELETE /api/papers/{id}', () => {
	it('버전 조회 → Zotero 삭제 → 앱 행 삭제 순서이고 번역·분석 이력도 사라진다', async () => {
		const { b, id } = await loggedIn('del-ok', true);
		const paper = await addPaper(id);
		await admin.from('archi_translations').insert([
			{ user_id: id, paper_id: paper.id, source_text: 'a', translated_text: 'ㄱ', type: 'word' },
			{ user_id: id, paper_id: paper.id, source_text: 'b', translated_text: 'ㄴ', type: 'word' }
		]);
		await admin.from('archi_analyses').insert({ user_id: id, paper_id: paper.id, result: {} });
		zotero.calls.length = 0;

		const res = await b.request('DELETE', `/api/papers/${paper.id}`);
		expect(res.status).toBe(204);
		const item = `/users/${zoteroUserIdOf(id)}/items/${paper.itemKey}`;
		expect(zotero.calls.filter((c) => c.includes(paper.itemKey))).toEqual([`GET ${item}`, `DELETE ${item}`]);
		expect(zotero.deleted.map((d) => d.key)).toContain(paper.itemKey);

		expect((await b.request('GET', `/api/papers/${paper.id}`)).status).toBe(404);
		for (const table of ['archi_translations', 'archi_analyses']) {
			const rows = await admin.from(table).select('id').eq('paper_id', paper.id);
			expect(rows.data, table).toEqual([]);
		}
	});

	it('Zotero가 412를 한 번 돌려주면 다시 조회해 재시도하고, 계속 412면 502이며 앱 행은 남는다', async () => {
		const { b, id } = await loggedIn('del-412', true);
		const retry = await addPaper(id);
		zotero.deleteConflicts = 1;
		zotero.calls.length = 0;
		expect((await b.request('DELETE', `/api/papers/${retry.id}`)).status).toBe(204);
		expect(zotero.calls.filter((c) => c.startsWith('DELETE'))).toHaveLength(2);

		const stuck = await addPaper(id);
		zotero.deleteConflicts = 2;
		const res = await b.request('DELETE', `/api/papers/${stuck.id}`);
		expect(res.status).toBe(502);
		expect(res.body).toMatchObject({ error: { code: 'zotero_unavailable' } });
		expect((await paperIds(id)).map((p) => p.id)).toEqual([stuck.id]);
		zotero.deleteConflicts = 0;
	});

	it('Zotero에 이미 없는 항목(404)이면 204로 끝나고 앱 행도 지운다', async () => {
		const { b, id } = await loggedIn('del-gone', true);
		const { data } = await admin
			.from('papers')
			.insert({ user_id: id, item_key: 'NOTINZOTERO', item_version: 1, title: 'ghost' })
			.select('id')
			.single();
		expect((await b.request('DELETE', `/api/papers/${data!.id}`)).status).toBe(204);
		expect(await paperIds(id)).toEqual([]);
	});

	it('Zotero 단계가 실패하거나 연결이 없으면 앱 행이 그대로 남는다', async () => {
		const { b, id } = await loggedIn('del-fail', true);
		const paper = await addPaper(id);
		zotero.failStatus = 500;
		try {
			const res = await b.request('DELETE', `/api/papers/${paper.id}`);
			expect(res.status).toBe(502);
			expect(res.body).toMatchObject({ error: { code: 'zotero_unavailable' } });
		} finally {
			zotero.failStatus = null;
		}
		expect((await paperIds(id)).map((p) => p.id)).toEqual([paper.id]);

		const unconnected = await loggedIn('del-unconn', false);
		const mine = await addPaper(unconnected.id);
		const res = await unconnected.b.request('DELETE', `/api/papers/${mine.id}`);
		expect(res.status).toBe(409);
		expect(res.body).toMatchObject({ error: { code: 'zotero_not_connected' } });
		expect((await paperIds(unconnected.id)).map((p) => p.id)).toEqual([mine.id]);
	});
});

describe('2.5 다른 사용자의 논문은 없는 논문과 똑같이 404', () => {
	it('B가 A의 논문 id로 상세·파일·삭제를 요청하면 없는 id와 같은 응답이고 A의 데이터는 그대로다', async () => {
		const a = await loggedIn('own-a', true);
		const b = await loggedIn('own-b', true);
		const paper = await addPaper(a.id, { attachment_key: 'OWNATT', attachment_type: 'pdf' });
		zotero.setFile('OWNATT', Buffer.from('%PDF-secret'), 'application/pdf');
		const missing = '00000000-0000-4000-8000-0000000000aa';
		zotero.calls.length = 0;

		for (const [method, suffix] of [['GET', ''], ['GET', '/file'], ['DELETE', '']] as const) {
			const theirs = await b.b.request(method, `/api/papers/${paper.id}${suffix}`);
			const none = await b.b.request(method, `/api/papers/${missing}${suffix}`);
			expect(theirs.status, `${method}${suffix}`).toBe(404);
			expect(theirs.body).toEqual(none.body);
			expect(theirs.body).toMatchObject({ error: { code: 'paper_not_found' } });
		}
		// 남의 논문 요청이 Zotero 호출을 일으키지 않았고, A의 논문은 그대로 읽힌다.
		expect(zotero.calls.filter((c) => c.includes(paper.itemKey) || c.includes('OWNATT'))).toEqual([]);
		expect((await a.b.request('GET', `/api/papers/${paper.id}`)).status).toBe(200);
		expect((await paperIds(a.id)).map((p) => p.id)).toEqual([paper.id]);
	});
});

describe('4.1 모든 papers 경로의 접근과 오류 형식', () => {
	const routes = [
		['GET', '/api/papers'],
		['GET', '/api/papers/00000000-0000-4000-8000-000000000001'],
		['GET', '/api/papers/00000000-0000-4000-8000-000000000001/file'],
		['POST', '/api/papers/webpage'],
		['DELETE', '/api/papers/00000000-0000-4000-8000-000000000001'],
		['GET', '/api/collections']
	] as const;

	it('쿠키가 없으면 전부 401 unauthenticated이고 인코딩한 경로도 같다', async () => {
		const b = new Browser(freshIp());
		for (const [method, path] of routes) {
			for (const p of [path, path.replace('/api/', '/%61pi/')]) {
				const res = await b.request(method, p, method === 'POST' ? { url: 'http://x.test' } : undefined);
				expect(res.status, `${method} ${p}`).toBe(401);
				expect(res.body, `${method} ${p}`).toMatchObject({ error: { code: 'unauthenticated', message: expect.any(String) } });
			}
		}
	});

	it('로그인했을 때 오류 응답은 { error: { code, message } } 형식이다', async () => {
		const { b } = await loggedIn('format', true);
		const cases = [
			b.request('GET', '/api/papers?limit=0'),
			b.request('GET', '/api/papers/not-a-uuid'),
			b.request('GET', '/api/papers/not-a-uuid/file'),
			b.request('DELETE', '/api/papers/not-a-uuid'),
			b.request('POST', '/api/papers/webpage', { url: 'ftp://x' })
		];
		for (const res of await Promise.all(cases)) {
			expect(res.status).toBeGreaterThanOrEqual(400);
			expect(res.body).toEqual({ error: { code: expect.any(String), message: expect.any(String) } });
		}
	});
});

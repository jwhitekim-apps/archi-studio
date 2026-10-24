// 로컬 Supabase와 가짜 Zotero가 필요한 메모 API 통합 테스트. 실행: npm run test:auth
import { createClient } from '@supabase/supabase-js';
import { env as privateEnv } from '$env/dynamic/private';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Browser } from './auth-harness';
import { MEMO_TAG } from './memo/notes';
import { supabaseClientOptions as options } from './supabase-options';
import { encryptSecret } from './zotero/crypto';
import { startFakeZotero, type FakeZotero } from './zotero/fake-zotero';

const env = import.meta.env;
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);

const runId = Date.now();
const prefix = `memo-it-${runId}`;
const password = 'password-ok-1';
const ENC_SECRET = Buffer.alloc(32, 7).toString('base64');
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

let zotero: FakeZotero;
let n = 0;
const ips: string[] = [];

async function loggedIn(name: string, connected: boolean) {
	const email = `${prefix}-${name}@example.test`;
	const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
	if (error || !data.user) throw error ?? new Error('테스트 계정 생성 실패');
	const profile = await admin.from('archi_profiles').insert({ user_id: data.user.id, approved: true });
	if (profile.error) throw profile.error;
	if (connected) {
		const zoteroUserId = `${zotero.userId}${++n}`;
		zotero.acceptUser(zoteroUserId);
		const row = await admin.from('folio_users').insert({
			id: data.user.id,
			zotero_user_id: zoteroUserId,
			zotero_username: 'fake',
			zotero_api_key: encryptSecret(zotero.apiKey, ENC_SECRET)
		});
		if (row.error) throw row.error;
	}
	const ip = `memoit-${runId}-${n++}`;
	ips.push(ip);
	const b = new Browser(ip);
	expect((await b.request('POST', '/api/auth/login', { email, password })).status).toBe(200);
	return { b, id: data.user.id };
}

async function addPaper(userId: string) {
	const item = zotero.addItem({ title: 'Zotero side' });
	const { data, error } = await admin
		.from('papers')
		.insert({ user_id: userId, item_key: item.key, item_version: item.version, title: 'Mine' })
		.select('id')
		.single();
	if (error) throw error;
	return { id: data.id as string, itemKey: item.key };
}

const memoNotes = (itemKey: string) =>
	(zotero.children.get(itemKey) ?? []).filter(
		(c) => c.data.itemType === 'note' && (c.data.tags as { tag: string }[] | undefined)?.some((t) => t.tag === MEMO_TAG)
	);
const hasMemo = async (id: string) => (await admin.from('papers').select('has_memo').eq('id', id).single()).data?.has_memo;

beforeAll(async () => {
	zotero = await startFakeZotero({ userId: String(8000 + (runId % 1000)) });
	privateEnv.ZOTERO_API_BASE_URL = zotero.url;
	privateEnv.ZOTERO_OAUTH_BASE_URL = zotero.url;
	privateEnv.ZOTERO_KEY_ENCRYPTION_SECRET = ENC_SECRET;
});

afterAll(async () => {
	await zotero.close();
	if (ips.length) await admin.from('archi_login_attempts').delete().in('ip', ips);
	const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
	for (const u of data?.users ?? []) {
		if (u.email?.startsWith(prefix)) await admin.auth.admin.deleteUser(u.id);
	}
});

describe('3.1 GET /api/papers/{id}/memo', () => {
	it('메모가 있는 논문은 200과 마크다운 본문', async () => {
		const { b, id } = await loggedIn('get-has', true);
		const paper = await addPaper(id);
		zotero.addChild(paper.itemKey, { itemType: 'note', note: '<h1>요약</h1>\n<p>본문</p>', tags: [{ tag: MEMO_TAG }] });
		zotero.addChild(paper.itemKey, { itemType: 'note', note: '<p>다른 노트</p>', tags: [] });
		const res = await b.request('GET', `/api/papers/${paper.id}/memo`);
		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({ markdown: '# 요약\n\n본문' });
		expect((res.body as { updatedAt: string }).updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it('메모가 없는 논문은 200과 { markdown: "", updatedAt: null }', async () => {
		const { b, id } = await loggedIn('get-none', true);
		const paper = await addPaper(id);
		const res = await b.request('GET', `/api/papers/${paper.id}/memo`);
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ markdown: '', updatedAt: null });
	});

	it('남의 논문 id와 없는 id는 둘 다 404 paper_not_found, 쿠키 없음은 401', async () => {
		const owner = await loggedIn('get-owner', true);
		const other = await loggedIn('get-other', true);
		const paper = await addPaper(owner.id);
		for (const path of [`/api/papers/${paper.id}/memo`, `/api/papers/${MISSING_ID}/memo`, '/api/papers/not-a-uuid/memo']) {
			for (const res of [await other.b.request('GET', path), await other.b.request('PUT', path, { markdown: 'x' })]) {
				expect(res.status).toBe(404);
				expect(res.body).toEqual({ error: { code: 'paper_not_found', message: expect.any(String) } });
			}
		}
		const anon = new Browser(`memoit-${runId}-anon`);
		expect((await anon.request('GET', `/api/papers/${paper.id}/memo`)).status).toBe(401);
		const put = await anon.request('PUT', `/api/papers/${paper.id}/memo`, { markdown: 'x' });
		expect(put.status).toBe(401);
		expect(put.body).toMatchObject({ error: { code: 'unauthenticated' } });
		expect(memoNotes(paper.itemKey)).toHaveLength(0);
	});
});

describe('3.2 PUT /api/papers/{id}/memo', () => {
	it('새 메모 저장은 200과 updatedAt이고 이후 조회가 같은 본문이며 Zotero 노트에 태그가 붙는다', async () => {
		const { b, id } = await loggedIn('put-new', true);
		const paper = await addPaper(id);
		const markdown = '# 연구 질문\n\n- 첫째\n- 둘째\n\n```\ncode\n```\n\n[링크](https://example.com) 한글';
		const res = await b.request('PUT', `/api/papers/${paper.id}/memo`, { markdown });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ markdown, updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) });
		expect((await b.request('GET', `/api/papers/${paper.id}/memo`)).body).toEqual(res.body);
		const notes = memoNotes(paper.itemKey);
		expect(notes).toHaveLength(1);
		expect(notes[0].data.parentItem).toBe(paper.itemKey);
	});

	it('자동 저장 반복: 같은 요청 5번과 다른 본문 뒤에도 Zotero 노트는 1개이고 마지막 본문이다', async () => {
		const { b, id } = await loggedIn('put-repeat', true);
		const paper = await addPaper(id);
		for (let i = 0; i < 5; i++) {
			expect((await b.request('PUT', `/api/papers/${paper.id}/memo`, { markdown: '같은 본문' })).status).toBe(200);
		}
		await b.request('PUT', `/api/papers/${paper.id}/memo`, { markdown: '마지막 본문' });
		expect(memoNotes(paper.itemKey)).toHaveLength(1);
		expect((await b.request('GET', `/api/papers/${paper.id}/memo`)).body).toMatchObject({ markdown: '마지막 본문' });
	});

	it('빈 본문 저장은 200이고 노트를 지우며 이후 조회는 빈 문자열이다', async () => {
		const { b, id } = await loggedIn('put-empty', true);
		const paper = await addPaper(id);
		await b.request('PUT', `/api/papers/${paper.id}/memo`, { markdown: '지울 메모' });
		const res = await b.request('PUT', `/api/papers/${paper.id}/memo`, { markdown: '' });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ markdown: '', updatedAt: null });
		expect(memoNotes(paper.itemKey)).toHaveLength(0);
		expect((await b.request('GET', `/api/papers/${paper.id}/memo`)).body).toEqual({ markdown: '', updatedAt: null });
	});

	it('markdown이 숫자이거나 본문이 JSON이 아니면 400 invalid_request', async () => {
		const { b, id } = await loggedIn('put-invalid', true);
		const paper = await addPaper(id);
		for (const res of [
			await b.request('PUT', `/api/papers/${paper.id}/memo`, { markdown: 42 }),
			await b.request('PUT', `/api/papers/${paper.id}/memo`, undefined, '{not json')
		]) {
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: { code: 'invalid_request', message: expect.any(String) } });
		}
		expect(memoNotes(paper.itemKey)).toHaveLength(0);
	});

	it('Zotero 미연결: 저장은 409 zotero_not_connected', async () => {
		const { b, id } = await loggedIn('put-unconnected', false);
		const paper = await addPaper(id);
		const res = await b.request('PUT', `/api/papers/${paper.id}/memo`, { markdown: '메모' });
		expect(res.status).toBe(409);
		expect(res.body).toEqual({ error: { code: 'zotero_not_connected', message: expect.any(String) } });
		expect((await b.request('GET', `/api/papers/${paper.id}/memo`)).status).toBe(409);
	});

	it('Zotero 쪽에서 노트가 그새 바뀌면(412) 한 번 다시 읽어 저장한다', async () => {
		const { b, id } = await loggedIn('put-conflict', true);
		const paper = await addPaper(id);
		await b.request('PUT', `/api/papers/${paper.id}/memo`, { markdown: '처음' });
		zotero.noteConflicts = 1;
		expect((await b.request('PUT', `/api/papers/${paper.id}/memo`, { markdown: '두 번째' })).status).toBe(200);
		expect((await b.request('GET', `/api/papers/${paper.id}/memo`)).body).toMatchObject({ markdown: '두 번째' });
	});
});

describe('3.3 papers.has_memo 갱신', () => {
	it('저장 뒤 true, 빈 문자열 저장 뒤 false, Zotero 쓰기가 실패하면 그대로이고 응답은 502', async () => {
		const { b, id } = await loggedIn('has-memo', true);
		const paper = await addPaper(id);
		expect(await hasMemo(paper.id)).toBe(false);
		await b.request('PUT', `/api/papers/${paper.id}/memo`, { markdown: '메모' });
		expect(await hasMemo(paper.id)).toBe(true);
		await b.request('PUT', `/api/papers/${paper.id}/memo`, { markdown: '' });
		expect(await hasMemo(paper.id)).toBe(false);

		zotero.failWriteStatus = 500;
		try {
			const res = await b.request('PUT', `/api/papers/${paper.id}/memo`, { markdown: '실패할 메모' });
			expect(res.status).toBe(502);
			expect(res.body).toMatchObject({ error: { code: 'zotero_unavailable' } });
			expect(JSON.stringify(res.body)).not.toContain('실패할 메모');
		} finally {
			zotero.failWriteStatus = null;
		}
		expect(await hasMemo(paper.id)).toBe(false);
		expect(memoNotes(paper.itemKey)).toHaveLength(0);
	});
});

describe('3.4 메모 크기 제한', () => {
	it('UTF-8 1,048,576바이트는 통과, 1,048,577바이트는 413 payload_too_large, 한글 1 MB 근처도 같다', async () => {
		const { b, id } = await loggedIn('size', true);
		const paper = await addPaper(id);
		const put = (markdown: string) => b.request('PUT', `/api/papers/${paper.id}/memo`, { markdown });

		expect((await put('a'.repeat(1048576))).status).toBe(200);
		const over = await put('a'.repeat(1048577));
		expect(over.status).toBe(413);
		expect(over.body).toEqual({ error: { code: 'payload_too_large', message: expect.any(String) } });

		// 한글은 3바이트: 349,525자 = 1,048,575바이트, 349,526자 = 1,048,578바이트
		expect((await put('가'.repeat(349525))).status).toBe(200);
		expect((await put('가'.repeat(349526))).status).toBe(413);
		expect((await put('가'.repeat(400000))).status).toBe(413);
		expect(memoNotes(paper.itemKey)).toHaveLength(1);
	});
});

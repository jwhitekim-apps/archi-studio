// 로컬 Supabase가 필요한 브리핑 API 통합 테스트. 비서 없이 서비스 키로 시험 데이터를 직접 넣는다. 실행: npm run test:auth
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Browser } from './auth-harness';
import { supabaseClientOptions as options } from './supabase-options';

const env = import.meta.env;
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);

const runId = Date.now();
const prefix = `ui-check-briefing-${runId}`;
const password = 'password-ok-1';
const ips: string[] = [];
let n = 0;

const day = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);

async function loggedIn(name: string) {
	const email = `${prefix}-${name}@example.com`;
	const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
	if (error || !data.user) throw error ?? new Error('테스트 계정 생성 실패');
	const profile = await admin.from('archi_profiles').insert({ user_id: data.user.id, approved: true });
	if (profile.error) throw profile.error;
	const ip = `briefit-${runId}-${n++}`;
	ips.push(ip);
	const b = new Browser(ip);
	expect((await b.request('POST', '/api/auth/login', { email, password })).status).toBe(200);
	return { b, id: data.user.id };
}

let me: { b: Browser; id: string };
let other: { b: Browser; id: string };
let mineIds: string[] = []; // date 오름차순
let otherBriefingId = '';
let paperIds: string[] = [];

beforeAll(async () => {
	me = await loggedIn('a');
	other = await loggedIn('b');

	const rows = Array.from({ length: 35 }, (_, i) => ({
		user_id: me.id,
		date: day(i),
		summary: `시험 요약 ${i}`,
		body: `시험 본문 ${i}\n\n둘째 조각`
	}));
	const ins = await admin.from('archi_briefings').insert(rows).select('id, date').order('date');
	if (ins.error) throw ins.error;
	mineIds = ins.data.map((r) => r.id as string);

	const theirs = await admin
		.from('archi_briefings')
		.insert({ user_id: other.id, date: day(0), summary: '남의 요약', body: '남의 본문' })
		.select('id')
		.single();
	if (theirs.error) throw theirs.error;
	otherBriefingId = theirs.data.id;

	const papers = await admin
		.from('papers')
		.insert([1, 2, 3].map((k) => ({ user_id: me.id, item_key: `BRIEF${runId % 100000}${k}`, item_version: 1, title: `시험 논문 ${k}` })))
		.select('id');
	if (papers.error) throw papers.error;
	paperIds = papers.data.map((p) => p.id as string).sort();

	const latest = mineIds[mineIds.length - 1];
	const links = await admin.from('archi_briefing_papers').insert(paperIds.map((paper_id) => ({ briefing_id: latest, paper_id })));
	if (links.error) throw links.error;
});

afterAll(async () => {
	if (ips.length) await admin.from('archi_login_attempts').delete().in('ip', ips);
	const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
	for (const u of data?.users ?? []) {
		if (u.email?.startsWith(prefix)) await admin.auth.admin.deleteUser(u.id);
	}
});

type ListBody = { items: { id: string; date: string; summary: string }[]; nextCursor: string | null };

describe('4.1 브리핑 목록 페이지', () => {
	it('첫 페이지 30건과 nextCursor, 두 번째 페이지 5건과 null, 날짜 내림차순', async () => {
		const first = await me.b.request('GET', '/api/briefings');
		expect(first.status).toBe(200);
		const p1 = first.body as ListBody;
		expect(p1.items).toHaveLength(30);
		expect(p1.nextCursor).toEqual(expect.any(String));
		expect(p1.items[0]).toEqual({ id: mineIds[34], date: day(34), summary: '시험 요약 34' });

		const second = await me.b.request('GET', `/api/briefings?cursor=${encodeURIComponent(p1.nextCursor!)}`);
		expect(second.status).toBe(200);
		const p2 = second.body as ListBody;
		expect(p2.items).toHaveLength(5);
		expect(p2.nextCursor).toBeNull();

		const dates = [...p1.items, ...p2.items].map((i) => i.date);
		expect(dates).toEqual(Array.from({ length: 35 }, (_, i) => day(34 - i)));
	});

	it('잘못된 limit과 cursor는 400 invalid_request', async () => {
		for (const q of ['limit=0', 'limit=101', 'limit=abc', 'cursor=%25%25']) {
			const res = await me.b.request('GET', `/api/briefings?${q}`);
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: { code: 'invalid_request', message: expect.any(String) } });
		}
	});
});

describe('4.2 브리핑 상세', () => {
	it('본문과 paperIds(id 오름차순)를 돌려준다', async () => {
		const res = await me.b.request('GET', `/api/briefings/${mineIds[34]}`);
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			id: mineIds[34],
			date: day(34),
			summary: '시험 요약 34',
			body: '시험 본문 34\n\n둘째 조각',
			paperIds
		});
	});

	it('다른 사용자 브리핑은 목록에 없고 상세는 404 briefing_not_found', async () => {
		const list = (await me.b.request('GET', '/api/briefings?limit=100')).body as ListBody;
		expect(list.items.map((i) => i.id)).not.toContain(otherBriefingId);
		const res = await me.b.request('GET', `/api/briefings/${otherBriefingId}`);
		expect(res.status).toBe(404);
		expect(res.body).toEqual({ error: { code: 'briefing_not_found', message: expect.any(String) } });
		const theirs = await other.b.request('GET', `/api/briefings/${otherBriefingId}`);
		expect(theirs.status).toBe(200);
	});

	it('없는 id와 UUID가 아닌 id도 같은 404', async () => {
		for (const id of ['00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
			const res = await me.b.request('GET', `/api/briefings/${id}`);
			expect(res.status).toBe(404);
			expect((res.body as { error: { code: string } }).error.code).toBe('briefing_not_found');
		}
	});

	it('논문 행을 삭제하면 paperIds에서 빠진다', async () => {
		const del = await admin.from('papers').delete().eq('id', paperIds[0]);
		expect(del.error).toBeNull();
		const res = await me.b.request('GET', `/api/briefings/${mineIds[34]}`);
		expect((res.body as { paperIds: string[] }).paperIds).toEqual(paperIds.slice(1));
	});

	it('같은 사용자 같은 날짜의 두 번째 삽입은 23505로 거부된다', async () => {
		const dup = await admin.from('archi_briefings').insert({ user_id: me.id, date: day(0), summary: 'x', body: 'x' });
		expect(dup.error?.code).toBe('23505');
	});
});

describe('4.3 인증과 읽기 전용', () => {
	it('쿠키 없이 부르면 401 unauthenticated', async () => {
		const anon = new Browser(`briefit-${runId}-anon`);
		for (const path of ['/api/briefings', `/api/briefings/${mineIds[0]}`]) {
			const res = await anon.request('GET', path);
			expect(res.status).toBe(401);
			expect(res.body).toEqual({ error: { code: 'unauthenticated', message: expect.any(String) } });
		}
	});

	it('POST, PUT, PATCH, DELETE는 405 method_not_allowed와 Allow: GET', async () => {
		for (const path of ['/api/briefings', `/api/briefings/${mineIds[0]}`]) {
			for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
				const res = await me.b.request(method, path, method === 'DELETE' ? undefined : {});
				expect(res.status, `${method} ${path}`).toBe(405);
				expect(res.headers.get('allow')).toBe('GET');
				expect(res.body).toEqual({ error: { code: 'method_not_allowed', message: expect.any(String) } });
			}
		}
		expect((await admin.from('archi_briefings').select('id').eq('user_id', me.id)).data).toHaveLength(35);
	});
});

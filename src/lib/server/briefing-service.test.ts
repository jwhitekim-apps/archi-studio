// 브리핑 읽기 서비스와 라우트 단위 테스트. 가짜 Supabase 클라이언트(메모리 표)로 돈다.
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	decodeBriefingCursor,
	encodeBriefingCursor,
	getBriefing,
	listBriefings,
	type BriefingListResult
} from './briefing-service';

type Row = Record<string, unknown>;

// select/eq/lt/order/limit/maybeSingle만 흉내 내는 가짜 클라이언트.
function fakeClient(tables: Record<string, Row[]>): SupabaseClient {
	const builder = (rows: Row[]) => {
		let current = rows;
		let cols: string[] | null = null;
		const pick = (r: Row) => (cols ? Object.fromEntries(cols.map((c) => [c, r[c]])) : r);
		const b = {
			select(spec: string) {
				cols = spec.split(',').map((s) => s.trim());
				return b;
			},
			eq(col: string, v: unknown) {
				current = current.filter((r) => r[col] === v);
				return b;
			},
			lt(col: string, v: string) {
				current = current.filter((r) => String(r[col]) < v);
				return b;
			},
			order(col: string, opts?: { ascending?: boolean }) {
				const dir = opts?.ascending === false ? -1 : 1;
				current = [...current].sort((x, y) => (String(x[col]) < String(y[col]) ? -dir : String(x[col]) > String(y[col]) ? dir : 0));
				return b;
			},
			limit(n: number) {
				current = current.slice(0, n);
				return b;
			},
			async maybeSingle() {
				return { data: current[0] ? pick(current[0]) : null, error: null };
			},
			then(resolve: (v: { data: Row[]; error: null }) => unknown) {
				return Promise.resolve({ data: current.map(pick), error: null }).then(resolve);
			}
		};
		return b;
	};
	return { from: (t: string) => builder(tables[t] ?? []) } as unknown as SupabaseClient;
}

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const day = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);

function briefings(count: number, userId = ME, offset = 0): Row[] {
	return Array.from({ length: count }, (_, i) => ({
		id: uuid(offset + i + 1),
		user_id: userId,
		date: day(offset + i),
		summary: `요약 ${i}`,
		body: `본문 ${i}`
	}));
}

const ok = (r: BriefingListResult) => {
	if (!r.ok) throw new Error(r.message);
	return r;
};

describe('2.1 브리핑 목록', () => {
	it('limit이 없으면 기본 30건이고 날짜 내림차순이며 다음 커서가 있다', async () => {
		const r = ok(await listBriefings(fakeClient({ archi_briefings: briefings(35) }), ME, {}));
		expect(r.items).toHaveLength(30);
		expect(r.items[0].date).toBe(day(34));
		expect(r.items.map((i) => i.date)).toEqual([...r.items.map((i) => i.date)].sort().reverse());
		expect(Object.keys(r.items[0]).sort()).toEqual(['date', 'id', 'summary']);
		expect(r.nextCursor).not.toBeNull();
		const next = ok(await listBriefings(fakeClient({ archi_briefings: briefings(35) }), ME, { cursor: r.nextCursor }));
		expect(next.items).toHaveLength(5);
		expect(next.nextCursor).toBeNull();
	});

	it('limit=1과 limit=100 경계를 받는다', async () => {
		const client = fakeClient({ archi_briefings: briefings(120) });
		expect(ok(await listBriefings(client, ME, { limit: '1' })).items).toHaveLength(1);
		expect(ok(await listBriefings(client, ME, { limit: '100' })).items).toHaveLength(100);
	});

	it.each(['0', '101', 'abc', '-1', '1.5', ''])('limit=%j는 invalid_request', async (limit) => {
		const r = await listBriefings(fakeClient({}), ME, { limit });
		expect(r).toMatchObject({ ok: false, code: 'invalid_request' });
	});

	it.each(['%%%', 'bm90LWpzb24', encodeURIComponent(Buffer.from('["x"]').toString('base64url'))])(
		'읽을 수 없는 cursor %j는 invalid_request',
		async (cursor) => {
			expect(await listBriefings(fakeClient({}), ME, { cursor })).toMatchObject({ ok: false, code: 'invalid_request' });
		}
	);

	it('정확히 limit개만 있으면 nextCursor가 null이다', async () => {
		const r = ok(await listBriefings(fakeClient({ archi_briefings: briefings(5) }), ME, { limit: '5' }));
		expect(r.items).toHaveLength(5);
		expect(r.nextCursor).toBeNull();
	});

	it('다른 사용자의 브리핑은 목록에 없다', async () => {
		const r = ok(await listBriefings(fakeClient({ archi_briefings: [...briefings(2), ...briefings(3, OTHER, 10)] }), ME, {}));
		expect(r.items).toHaveLength(2);
	});

	it('커서는 날짜를 왕복한다', () => {
		expect(decodeBriefingCursor(encodeBriefingCursor('2026-01-02'))).toBe('2026-01-02');
	});
});

describe('2.2 브리핑 상세', () => {
	const rows = [...briefings(1), ...briefings(1, OTHER, 5)];
	const links = [
		{ briefing_id: uuid(1), paper_id: uuid(903) },
		{ briefing_id: uuid(1), paper_id: uuid(901) },
		{ briefing_id: uuid(6), paper_id: uuid(902) }
	];
	const client = () => fakeClient({ archi_briefings: rows, archi_briefing_papers: links });

	it('본문과 paperIds(id 오름차순)를 돌려준다', async () => {
		expect(await getBriefing(client(), ME, uuid(1))).toEqual({
			id: uuid(1),
			date: day(0),
			summary: '요약 0',
			body: '본문 0',
			paperIds: [uuid(901), uuid(903)]
		});
	});

	it('없는 id, 다른 사용자의 id, UUID가 아닌 id는 모두 null이다', async () => {
		expect(await getBriefing(client(), ME, uuid(999))).toBeNull();
		expect(await getBriefing(client(), ME, uuid(6))).toBeNull();
		expect(await getBriefing(client(), ME, 'not-a-uuid')).toBeNull();
	});
});

// 라우트 단위 테스트: 서비스 키 클라이언트를 가짜로 바꾼다.
const supabaseMock = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('$lib/server/supabase', () => ({ createServiceClient: () => supabaseMock.client }));

describe('3.1, 3.2 브리핑 라우트', () => {
	beforeEach(() => {
		supabaseMock.client = fakeClient({ archi_briefings: [...briefings(3), ...briefings(2, OTHER, 10)], archi_briefing_papers: [] });
	});

	const event = (path: string, user: { id: string } | null, params: Record<string, string> = {}) =>
		({ locals: { user }, url: new URL(path, 'http://localhost'), params }) as never;

	it('목록은 locals.user.id의 브리핑만 돌려준다', async () => {
		const { GET } = await import('../../routes/api/briefings/+server');
		const res = await GET(event('/api/briefings', { id: ME }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.items).toHaveLength(3);
		expect(body.nextCursor).toBeNull();
	});

	it('잘못된 limit은 400 invalid_request 공통 형식이다', async () => {
		const { GET } = await import('../../routes/api/briefings/+server');
		const res = await GET(event('/api/briefings?limit=0', { id: ME }));
		expect(res.status).toBe(400);
		expect((await res.json()).error.code).toBe('invalid_request');
	});

	it('로그인하지 않으면 401 unauthenticated', async () => {
		const { GET } = await import('../../routes/api/briefings/+server');
		const res = await GET(event('/api/briefings', null));
		expect(res.status).toBe(401);
		expect((await res.json()).error.code).toBe('unauthenticated');
	});

	it('상세는 내 브리핑을 돌려주고 남의 것은 404 briefing_not_found', async () => {
		const { GET } = await import('../../routes/api/briefings/[id]/+server');
		const mine = await GET(event('/api/briefings/x', { id: ME }, { id: uuid(1) }));
		expect(mine.status).toBe(200);
		expect((await mine.json()).paperIds).toEqual([]);
		const other = await GET(event('/api/briefings/x', { id: ME }, { id: uuid(11) }));
		expect(other.status).toBe(404);
		expect(await other.json()).toEqual({ error: { code: 'briefing_not_found', message: expect.any(String) } });
	});
});

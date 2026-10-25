import { describe, expect, it } from 'vitest';
import { appendUnique, formatBriefingDate, loadBriefingList, loadBriefingView, paperLabel } from './briefing';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// 경로별 가짜 응답
function fakeFetch(routes: Record<string, () => Response>) {
	const calls: string[] = [];
	const fn = (async (input: RequestInfo | URL) => {
		const path = String(input);
		calls.push(path);
		const route = routes[path];
		return route ? route() : json(404, { error: { code: 'not_found', message: '' } });
	}) as typeof fetch;
	return { fn, calls };
}

describe('formatBriefingDate', () => {
	it('문자열 날짜를 한국어 날짜와 요일로 바꾼다(시간대와 무관)', () => {
		// 아래 값은 TZ=UTC와 TZ=America/Los_Angeles 양쪽에서 같아야 한다
		expect(formatBriefingDate('2026-10-18')).toBe('2026년 10월 18일 일요일');
		expect(formatBriefingDate('2026-01-01')).toBe('2026년 1월 1일 목요일');
	});
	it('형식이 다르면 그대로 둔다', () => {
		expect(formatBriefingDate('어제')).toBe('어제');
	});
});

describe('appendUnique', () => {
	it('같은 id는 다시 붙이지 않는다', () => {
		const a = { id: id(1), date: '2026-10-18', summary: 'a' };
		const b = { id: id(2), date: '2026-10-17', summary: 'b' };
		expect(appendUnique([a], [a, b, b]).map((x) => x.id)).toEqual([id(1), id(2)]);
	});
});

describe('loadBriefingList', () => {
	it('정상 응답과 nextCursor를 돌려준다', async () => {
		const items = [{ id: id(1), date: '2026-10-18', summary: '요약' }];
		const { fn } = fakeFetch({ '/api/briefings': () => json(200, { items, nextCursor: 'c2' }) });
		expect(await loadBriefingList(fn)).toEqual({ items, nextCursor: 'c2' });
	});
	it('빈 목록', async () => {
		const { fn } = fakeFetch({ '/api/briefings': () => json(200, { items: [], nextCursor: null }) });
		expect(await loadBriefingList(fn)).toEqual({ items: [], nextCursor: null });
	});
	it('500이면 ApiError로 실패한다', async () => {
		const { fn } = fakeFetch({ '/api/briefings': () => json(500, { error: { code: 'internal_error', message: 'x' } }) });
		await expect(loadBriefingList(fn)).rejects.toMatchObject({ status: 500, code: 'internal_error' });
	});
	it('401이면 돌아올 주소를 붙여 로그인으로 보낸다', async () => {
		const { fn } = fakeFetch({ '/api/briefings': () => json(401, { error: { code: 'unauthenticated', message: '' } }) });
		await expect(loadBriefingList(fn, new URL('http://x/log'))).rejects.toMatchObject({
			status: 303,
			location: '/login?redirect=%2Flog&expired=1'
		});
	});
});

describe('loadBriefingView', () => {
	const detail = (paperIds: string[]) => () =>
		json(200, { id: id(9), date: '2026-10-18', summary: '요약', body: '본문', paperIds });

	it('제목 정상, 실패, 404, 빈 제목을 구분한다', async () => {
		const { fn } = fakeFetch({
			[`/api/briefings/${id(9)}`]: detail([id(1), id(2), id(3), id(4)]),
			[`/api/papers/${id(1)}`]: () => json(200, { id: id(1), title: 'Attention' }),
			[`/api/papers/${id(2)}`]: () => json(500, { error: { code: 'internal_error', message: '' } }),
			// id(3)은 404
			[`/api/papers/${id(4)}`]: () => json(200, { id: id(4), title: '' })
		});
		const view = await loadBriefingView(fn, id(9));
		expect(view.papers.map(paperLabel)).toEqual(['Attention', '제목을 불러오지 못한 논문', '제목 없는 논문']);
		expect(view.papers.map((p) => p.id)).toEqual([id(1), id(2), id(4)]);
		expect(view.hiddenPapers).toBe(0);
	});

	it('25편이면 20편만 요청하고 나머지 5편은 "외 N편"으로 센다', async () => {
		const ids = Array.from({ length: 25 }, (_, i) => id(i + 1));
		const routes: Record<string, () => Response> = { [`/api/briefings/${id(99)}`]: detail(ids) };
		for (const p of ids) routes[`/api/papers/${p}`] = () => json(200, { id: p, title: `논문 ${p}` });
		const { fn, calls } = fakeFetch(routes);
		const view = await loadBriefingView(fn, id(99));
		expect(view.papers).toHaveLength(20);
		expect(view.hiddenPapers).toBe(5);
		expect(calls.filter((c) => c.startsWith('/api/papers/'))).toHaveLength(20);
	});

	it('없는 브리핑은 404로 실패한다', async () => {
		const { fn } = fakeFetch({});
		await expect(loadBriefingView(fn, id(9))).rejects.toMatchObject({ status: 404 });
	});
});

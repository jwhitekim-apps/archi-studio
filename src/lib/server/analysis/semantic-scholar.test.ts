import { describe, expect, it } from 'vitest';
import {
	createS2Client,
	FIELDS_PAPER,
	RateLimitError,
	S2_TIMEOUT_MS,
	S2AuthError,
	S2TimeoutError,
	type S2Paper
} from './semantic-scholar';

type Reply = Response | (() => Response | Promise<Response>);

// 요청을 기록하고 정해진 응답을 차례로 돌려주는 가짜 fetch
function fakeFetch(replies: Reply[] | ((url: URL) => Reply)) {
	const calls: { url: URL; headers: Record<string, string> }[] = [];
	let inFlight = 0;
	let maxInFlight = 0;
	const fn = (async (input: string, init: RequestInit) => {
		const url = new URL(input);
		calls.push({ url, headers: (init.headers ?? {}) as Record<string, string> });
		inFlight++;
		maxInFlight = Math.max(maxInFlight, inFlight);
		try {
			await new Promise((r) => setTimeout(r, 5));
			const reply = Array.isArray(replies) ? replies[calls.length - 1] : replies(url);
			return typeof reply === 'function' ? await reply() : reply;
		} finally {
			inFlight--;
		}
	}) as unknown as typeof fetch;
	return { fn, calls, maxInFlight: () => maxInFlight };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const status = (code: number) => () => new Response('', { status: code });

function sleeps() {
	const waits: number[] = [];
	return { waits, sleep: async (s: number) => void waits.push(s) };
}

const PAPER: S2Paper = { paperId: 'p1', title: 'T', authors: [{ authorId: 'a1', name: 'A' }, { authorId: 'a2', name: 'B' }, { authorId: 'a3', name: 'C' }, { authorId: 'a4', name: 'D' }] };

describe('재시도와 오류', () => {
	it('429 두 번 뒤 200이면 성공하고 대기는 [1, 2]', async () => {
		const { fn } = fakeFetch([status(429), status(429), () => json({ paperId: 'p1' })]);
		const { waits, sleep } = sleeps();
		expect(await createS2Client({ apiKey: 'k', fetch: fn, sleep }).getPaper('p1')).toEqual({ paperId: 'p1' });
		expect(waits).toEqual([1, 2]);
	});

	it('429가 네 번 계속되면 RateLimitError이고 대기는 [1, 2, 4](마지막 시도 뒤에는 기다리지 않는다)', async () => {
		const { fn, calls } = fakeFetch([status(429), status(429), status(429), status(429)]);
		const { waits, sleep } = sleeps();
		await expect(createS2Client({ apiKey: 'k', fetch: fn, sleep }).getPaper('p1')).rejects.toBeInstanceOf(RateLimitError);
		expect(waits).toEqual([1, 2, 4]);
		expect(calls).toHaveLength(4);
	});

	it.each([401, 403])('%i는 S2AuthError', async (code) => {
		const { fn } = fakeFetch([status(code)]);
		await expect(createS2Client({ apiKey: 'k', fetch: fn, sleep: sleeps().sleep }).getPaper('p1')).rejects.toBeInstanceOf(S2AuthError);
	});

	it('시간 초과는 S2TimeoutError, 기본 시간은 15초', async () => {
		expect(S2_TIMEOUT_MS).toBe(15_000);
		const hang = (async (_: string, init: RequestInit) =>
			new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))) as unknown as typeof fetch;
		await expect(createS2Client({ apiKey: 'k', fetch: hang, sleep: sleeps().sleep, timeoutMs: 20 }).getPaper('p1')).rejects.toBeInstanceOf(
			S2TimeoutError
		);
	});

	it('404는 못 찾음(null)', async () => {
		const { fn } = fakeFetch([status(404)]);
		expect(await createS2Client({ apiKey: 'k', fetch: fn, sleep: sleeps().sleep }).getPaper('p1')).toBeNull();
	});
});

describe('요청 형식과 간격', () => {
	it('키가 없으면 요청마다 sleep(1), 있으면 호출하지 않고 x-api-key를 보낸다', async () => {
		const anon = fakeFetch([() => json({ paperId: 'p1' })]);
		const a = sleeps();
		await createS2Client({ fetch: anon.fn, sleep: a.sleep }).getPaper('p1');
		expect(a.waits).toEqual([1]);
		expect(anon.calls[0].headers).toEqual({});

		const keyed = fakeFetch([() => json({ paperId: 'p1' })]);
		const k = sleeps();
		await createS2Client({ apiKey: 'secret', fetch: keyed.fn, sleep: k.sleep }).getPaper('p1');
		expect(k.waits).toEqual([]);
		expect(keyed.calls[0].headers).toEqual({ 'x-api-key': 'secret' });
	});

	it('요청 필드 목록', async () => {
		const { fn, calls } = fakeFetch([() => json({ paperId: 'p1' })]);
		await createS2Client({ apiKey: 'k', fetch: fn, sleep: sleeps().sleep }).getPaper('ArXiv:2601.01234');
		expect(FIELDS_PAPER).toBe('title,year,venue,externalIds,abstract,authors,citationCount');
		expect(calls[0].url.pathname).toBe('/graph/v1/paper/ArXiv:2601.01234');
		expect(calls[0].url.searchParams.get('fields')).toBe(FIELDS_PAPER);
	});

	it('저자 보강: 상위 3명, 키가 있으면 동시에', async () => {
		const f = fakeFetch((url) => () => json({ name: url.pathname.split('/').pop(), hIndex: 10, citationCount: 100 }));
		const authors = await createS2Client({ apiKey: 'k', fetch: f.fn, sleep: sleeps().sleep }).enrichAuthors(PAPER);
		expect(authors).toEqual([
			{ name: 'a1', hIndex: 10, citationCount: 100 },
			{ name: 'a2', hIndex: 10, citationCount: 100 },
			{ name: 'a3', hIndex: 10, citationCount: 100 }
		]);
		expect(f.calls).toHaveLength(3);
		expect(f.maxInFlight()).toBe(3);
	});

	it('저자 보강: 키가 없으면 차례로, 실패한 저자는 이름만 남긴다', async () => {
		const f = fakeFetch((url) => (url.pathname.endsWith('a2') ? status(500) : () => json({ name: 'N', hIndex: 1, citationCount: 2 })));
		const s = sleeps();
		const authors = await createS2Client({ fetch: f.fn, sleep: s.sleep }).enrichAuthors(PAPER);
		expect(authors[1]).toEqual({ name: 'B', hIndex: null, citationCount: null });
		expect(f.maxInFlight()).toBe(1);
		expect(s.waits).toEqual([1, 1, 1]);
	});
});

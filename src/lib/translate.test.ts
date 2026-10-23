import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '$lib/api/client';
import { isAbortError, startTranslation, StreamInterrupted } from './translate';

const enc = new TextEncoder();

function streamResponse(parts: (string | Uint8Array | Error)[], headers: Record<string, string> = {}) {
	const queue = [...parts];
	return new Response(
		new ReadableStream<Uint8Array>({
			pull(controller) {
				const next = queue.shift();
				if (next === undefined) controller.close();
				else if (next instanceof Error) controller.error(next);
				else controller.enqueue(typeof next === 'string' ? enc.encode(next) : next);
			}
		}),
		{ status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', ...headers } }
	);
}

const fetcherOf = (response: Response | (() => Response)) =>
	vi.fn(async () => (typeof response === 'function' ? response() : response)) as unknown as typeof fetch;

describe('startTranslation', () => {
	it('조각을 이어 붙이고 X-Cache를 읽는다', async () => {
		const chunks: string[] = [];
		const result = await startTranslation(
			{ text: 'hi' },
			new AbortController().signal,
			(c) => chunks.push(c),
			fetcherOf(streamResponse(['안녕', '하세요'], { 'x-cache': 'HIT' }))
		);
		expect(chunks).toEqual(['안녕', '하세요']);
		expect(result).toEqual({ text: '안녕하세요', cache: 'HIT' });
	});

	it('paperId는 있을 때만 본문에 싣는다', async () => {
		const fetcher = fetcherOf(() => streamResponse(['a']));
		await startTranslation({ text: 'x', paperId: 'p1' }, new AbortController().signal, () => {}, fetcher);
		await startTranslation({ text: 'x', paperId: null }, new AbortController().signal, () => {}, fetcher);
		const bodies = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
		expect(bodies).toEqual([{ text: 'x', paperId: 'p1' }, { text: 'x' }]);
	});

	it.each([
		[400, 'invalid_request'],
		[401, 'unauthenticated'],
		[404, 'paper_not_found'],
		[413, 'payload_too_large'],
		[500, 'internal_error'],
		[502, 'ai_unavailable'],
		[503, 'ai_not_configured']
	])('%i 응답은 ApiError(%s)', async (status, code) => {
		const response = new Response(JSON.stringify({ error: { code, message: '' } }), { status });
		const error = await startTranslation({ text: 'x' }, new AbortController().signal, () => {}, fetcherOf(response)).catch((e) => e);
		expect(error).toBeInstanceOf(ApiError);
		expect(error).toMatchObject({ status, code });
	});

	it('읽는 도중 끊기면 받은 글자를 담은 StreamInterrupted', async () => {
		const error = await startTranslation(
			{ text: 'x' },
			new AbortController().signal,
			() => {},
			fetcherOf(streamResponse(['부분 ', '번역', new Error('reset')]))
		).catch((e) => e);
		expect(error).toBeInstanceOf(StreamInterrupted);
		expect((error as StreamInterrupted).partial).toBe('부분 번역');
	});

	it('취소하면 AbortError이고 그때까지 받은 글자는 이미 넘어가 있다', async () => {
		const controller = new AbortController();
		const chunks: string[] = [];
		let pulls = 0;
		const response = new Response(
			new ReadableStream<Uint8Array>({
				async pull(c) {
					pulls++;
					if (pulls === 1) return c.enqueue(enc.encode('첫 조각'));
					controller.abort();
					await new Promise((r) => setTimeout(r, 5));
					c.error(new DOMException('aborted', 'AbortError'));
				}
			})
		);
		const error = await startTranslation({ text: 'x' }, controller.signal, (c) => chunks.push(c), fetcherOf(response)).catch((e) => e);
		expect(isAbortError(error)).toBe(true);
		expect(chunks).toEqual(['첫 조각']);
	});

	it('응답 전 네트워크 실패는 network_error', async () => {
		const fetcher = vi.fn(async () => {
			throw new TypeError('fetch failed');
		}) as unknown as typeof fetch;
		await expect(startTranslation({ text: 'x' }, new AbortController().signal, () => {}, fetcher)).rejects.toMatchObject({
			code: 'network_error'
		});
	});
});

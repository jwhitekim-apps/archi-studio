import { describe, expect, it } from 'vitest';
import { LocalProvider } from './local';
import { collect, testDeps } from './test-helpers';

const BASE = 'https://llm.school.test/v1';
const MODELS = { fast: 'school-model', smart: 'school-model' };

function sse(pieces: string[]): Response {
	const encoder = new TextEncoder();
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const piece of pieces) controller.enqueue(encoder.encode(piece));
			controller.close();
		}
	});
	return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

const event = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

function fakeFetch(respond: () => Response | Promise<Response>) {
	const calls: { url: string; init: RequestInit }[] = [];
	const fn = (async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		return respond();
	}) as unknown as typeof fetch;
	return { fn, calls };
}

describe('LocalProvider', () => {
	it('평문 http 주소는 요청 없이 ai_not_configured', () => {
		const { fn, calls } = fakeFetch(() => new Response('{}'));
		expect(() => new LocalProvider({ baseUrl: 'http://llm.school.test/v1', apiKey: 'k', models: MODELS, fetch: fn })).toThrow(
			expect.objectContaining({ code: 'ai_not_configured' })
		);
		expect(calls).toHaveLength(0);
	});

	it('complete는 chat/completions로 보내고 공백을 지운다', async () => {
		const { fn, calls } = fakeFetch(() => Response.json({ choices: [{ message: { content: '  안녕  ' }, finish_reason: 'stop' }] }));
		const provider = new LocalProvider({ baseUrl: `${BASE}/`, apiKey: 'local-key', models: MODELS, fetch: fn }, testDeps());
		expect(await provider.complete({ system: '지시', user: '질문', maxTokens: 50 })).toBe('안녕');
		expect(calls[0].url).toBe(`${BASE}/chat/completions`);
		expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer local-key');
		expect(JSON.parse(calls[0].init.body as string)).toEqual({
			model: 'school-model',
			max_tokens: 50,
			stream: false,
			reasoning_effort: 'none',
			messages: [
				{ role: 'system', content: '지시' },
				{ role: 'user', content: '질문' }
			]
		});
	});

	it('키가 없으면 인증 헤더를 보내지 않는다', async () => {
		const { fn, calls } = fakeFetch(() => Response.json({ choices: [{ message: { content: 'x' } }] }));
		await new LocalProvider({ baseUrl: BASE, apiKey: undefined, models: MODELS, fetch: fn }, testDeps()).complete({ user: 'q', maxTokens: 1 });
		expect(calls[0].init.headers).not.toHaveProperty('authorization');
	});

	it('쪼개져 오는 이벤트 줄을 이어 붙여 읽고 [DONE]에서 끝난다', async () => {
		const whole = event('안') + ': keep-alive\n\n' + event('') + event('녕') + 'data: [DONE]\n\n' + event('무시');
		const pieces = [whole.slice(0, 7), whole.slice(7, 30), whole.slice(30, 31), whole.slice(31)];
		const { fn, calls } = fakeFetch(() => sse(pieces));
		const provider = new LocalProvider({ baseUrl: BASE, apiKey: 'k', models: MODELS, fetch: fn }, testDeps());
		expect(await collect(provider.stream({ user: 'q', maxTokens: 10 }))).toEqual(['안', '녕']);
		expect(JSON.parse(calls[0].init.body as string).stream).toBe(true);
	});

	it('생각만 하다 한도에 걸려 글자 없이 끝나면 ai_empty_response', async () => {
		const thinking = `data: ${JSON.stringify({ choices: [{ delta: { content: '', reasoning: '생각 중' } }] })}\n\n`;
		const cutoff = `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }] })}\n\n`;
		const { fn } = fakeFetch(() => sse([thinking, cutoff, 'data: [DONE]\n\n']));
		const deps = testDeps();
		const err = await collect(new LocalProvider({ baseUrl: BASE, apiKey: 'k', models: MODELS, fetch: fn }, deps).stream({ user: 'q', maxTokens: 16 })).catch((e) => e);
		expect(err.code).toBe('ai_empty_response');
		expect(deps.logs[0]).toMatchObject({ provider: 'local', ok: false, code: 'ai_empty_response', finishReason: 'length' });
	});

	it('\\r\\n 줄바꿈도 읽는다', async () => {
		const { fn } = fakeFetch(() => sse([event('가').replace(/\n/g, '\r\n'), 'data: [DONE]\r\n\r\n']));
		expect(await collect(new LocalProvider({ baseUrl: BASE, apiKey: 'k', models: MODELS, fetch: fn }, testDeps()).stream({ user: 'q', maxTokens: 1 }))).toEqual(['가']);
	});

	it.each<[number, string, number]>([
		[429, 'ai_rate_limited', 3],
		[503, 'ai_unavailable', 3],
		[400, 'ai_unavailable', 1]
	])('HTTP %i → %s', async (status, code, attempts) => {
		const { fn, calls } = fakeFetch(() => new Response('오류 본문', { status }));
		const err = await new LocalProvider({ baseUrl: BASE, apiKey: 'k', models: MODELS, fetch: fn }, testDeps())
			.complete({ user: 'q', maxTokens: 1 })
			.catch((e) => e);
		expect(err.code).toBe(code);
		expect(calls).toHaveLength(attempts);
	});

	it('연결 실패(인증서 오류 포함)는 ai_unavailable', async () => {
		const { fn } = fakeFetch(() => {
			throw new TypeError('fetch failed');
		});
		const err = await new LocalProvider({ baseUrl: BASE, apiKey: 'k', models: MODELS, fetch: fn }, testDeps())
			.complete({ user: 'q', maxTokens: 1 })
			.catch((e) => e);
		expect(err.code).toBe('ai_unavailable');
	});
});

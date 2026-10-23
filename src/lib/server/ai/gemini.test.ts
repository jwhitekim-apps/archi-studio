import { ApiError } from '@google/genai';
import { describe, expect, it } from 'vitest';
import { GeminiProvider, type GeminiClient } from './gemini';
import { collect, testDeps } from './test-helpers';

const MODELS = { fast: 'gemini-fast-test', smart: 'gemini-smart-test' };

type Params = Parameters<GeminiClient['models']['generateContent']>[0];

function fakeClient(options: { complete?: (p: Params) => unknown; stream?: (p: Params) => unknown }) {
	const calls: Params[] = [];
	const client: GeminiClient = {
		models: {
			async generateContent(params) {
				calls.push(params);
				return options.complete!(params) as never;
			},
			async generateContentStream(params) {
				calls.push(params);
				return options.stream!(params) as never;
			}
		}
	};
	return { client, calls };
}

const apiError = (status: number) => new ApiError({ message: 'sdk 원문 메시지', status });

describe('GeminiProvider.complete', () => {
	it('등급에 따라 모델을 고르고 시스템 지시문을 넘기며 공백을 지운다', async () => {
		const { client, calls } = fakeClient({ complete: () => ({ text: '  안녕  ' }) });
		const provider = new GeminiProvider(client, MODELS, testDeps());
		expect(await provider.complete({ system: '지시', user: '질문', maxTokens: 100 })).toBe('안녕');
		await provider.complete({ user: '질문', maxTokens: 100, tier: 'smart' });
		expect(calls[0]).toEqual({ model: 'gemini-fast-test', contents: '질문', config: { maxOutputTokens: 100, systemInstruction: '지시' } });
		expect(calls[1].model).toBe('gemini-smart-test');
		expect(calls[1].config.systemInstruction).toBeUndefined();
	});

	it('빈 응답은 ai_empty_response이고 종료 이유가 로그와 메시지에 남는다', async () => {
		const deps = testDeps();
		const { client } = fakeClient({ complete: () => ({ text: undefined, candidates: [{ finishReason: 'SAFETY' }] }) });
		const err = await new GeminiProvider(client, MODELS, deps).complete({ user: 'q', maxTokens: 1 }).catch((e) => e);
		expect(err.code).toBe('ai_empty_response');
		expect(err.message).toContain('SAFETY');
		expect(deps.logs[0]).toMatchObject({ provider: 'gemini', ok: false, code: 'ai_empty_response', finishReason: 'SAFETY' });
	});

	it.each<[string, () => unknown, string, number]>([
		['429', () => apiError(429), 'ai_rate_limited', 3],
		['5xx', () => apiError(503), 'ai_unavailable', 3],
		['400', () => apiError(400), 'ai_unavailable', 1],
		['연결 실패', () => new TypeError('fetch failed'), 'ai_unavailable', 3]
	])('SDK 오류 %s → %s', async (_, make, code, attempts) => {
		const { client, calls } = fakeClient({
			complete: () => {
				throw make();
			}
		});
		const err = await new GeminiProvider(client, MODELS, testDeps()).complete({ user: 'q', maxTokens: 1 }).catch((e) => e);
		expect(err.code).toBe(code);
		expect(err.message).not.toContain('sdk 원문');
		expect(calls).toHaveLength(attempts);
	});
});

describe('GeminiProvider.stream', () => {
	it('조각을 순서대로 내보내고 빈 조각은 건너뛴다', async () => {
		const { client, calls } = fakeClient({
			stream: () =>
				(async function* () {
					yield { text: '안' };
					yield { text: '' };
					yield { text: undefined };
					yield { text: '녕' };
				})()
		});
		expect(await collect(new GeminiProvider(client, MODELS, testDeps()).stream({ user: 'q', maxTokens: 10 }))).toEqual(['안', '녕']);
		expect(calls[0].model).toBe('gemini-smart-test');
	});

	it('취소 신호를 SDK에 넘기고, 취소하면 더 내보내지 않고 스트림을 닫는다', async () => {
		let closed = false;
		const controller = new AbortController();
		const { client, calls } = fakeClient({
			stream: () =>
				(async function* () {
					try {
						yield { text: '하나' };
						yield { text: '둘' };
					} finally {
						closed = true;
					}
				})()
		});
		const out: string[] = [];
		for await (const c of new GeminiProvider(client, MODELS, testDeps()).stream({ user: 'q', maxTokens: 10, signal: controller.signal })) {
			out.push(c);
			controller.abort();
		}
		expect(out).toEqual(['하나']);
		expect(closed).toBe(true);
		expect(calls[0].config.abortSignal).toBe(controller.signal);
	});
});

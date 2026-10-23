import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { ClaudeProvider, type ClaudeClient } from './claude';
import { collect, testDeps } from './test-helpers';

const MODELS = { fast: 'claude-fast-test', smart: 'claude-smart-test' };

type Params = Parameters<ClaudeClient['messages']['create']>[0];

function fakeClient(handler: (params: Params, signal?: AbortSignal) => unknown) {
	const calls: { params: Params; signal?: AbortSignal }[] = [];
	const client: ClaudeClient = {
		messages: {
			async create(params, options) {
				calls.push({ params, signal: options?.signal });
				return handler(params, options?.signal);
			}
		}
	};
	return { client, calls };
}

const message = (text: string) => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });

function deltas(chunks: string[]) {
	return (async function* () {
		yield { type: 'message_start' };
		for (const text of chunks) yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
		yield { type: 'message_stop' };
	})();
}

const sdkError = (status: number) =>
	Anthropic.APIError.generate(status, { type: 'error' }, 'sdk 원문 메시지', new Headers());

describe('ClaudeProvider.complete', () => {
	it('등급에 따라 모델을 고르고 시스템 지시문을 넘기며 공백을 지운다', async () => {
		const { client, calls } = fakeClient(() => message('  안녕  '));
		const provider = new ClaudeProvider(client, MODELS, testDeps());
		expect(await provider.complete({ system: '지시', user: '질문', maxTokens: 100 })).toBe('안녕');
		await provider.complete({ user: '질문', maxTokens: 100, tier: 'smart' });
		expect(calls[0].params).toEqual({
			model: 'claude-fast-test',
			max_tokens: 100,
			system: '지시',
			messages: [{ role: 'user', content: '질문' }]
		});
		expect(calls[1].params.model).toBe('claude-smart-test');
		expect(calls[1].params.system).toBeUndefined();
	});

	it('빈 응답은 ai_empty_response이고 종료 이유가 로그에 남는다', async () => {
		const deps = testDeps();
		const { client } = fakeClient(() => ({ content: [], stop_reason: 'max_tokens' }));
		await expect(new ClaudeProvider(client, MODELS, deps).complete({ user: 'q', maxTokens: 1 })).rejects.toMatchObject({
			code: 'ai_empty_response'
		});
		expect(deps.logs[0]).toMatchObject({ ok: false, code: 'ai_empty_response', finishReason: 'max_tokens' });
	});

	it.each<[string, () => unknown, string, number]>([
		['429', () => sdkError(429), 'ai_rate_limited', 3],
		['5xx', () => sdkError(529), 'ai_unavailable', 3],
		['400', () => sdkError(400), 'ai_unavailable', 1],
		['연결 실패', () => new Anthropic.APIConnectionError({ message: 'connect ECONNREFUSED' }), 'ai_unavailable', 3]
	])('SDK 오류 %s → %s', async (_, make, code, attempts) => {
		const { client, calls } = fakeClient(() => {
			throw make();
		});
		const err = await new ClaudeProvider(client, MODELS, testDeps()).complete({ user: 'q', maxTokens: 1 }).catch((e) => e);
		expect(err.code).toBe(code);
		expect(err.message).not.toContain('sdk 원문');
		expect(calls).toHaveLength(attempts);
	});

	it('Retry-After 헤더를 대기 시간으로 쓴다', async () => {
		const deps = testDeps();
		let n = 0;
		const { client } = fakeClient(() => {
			if (n++ === 0) throw Anthropic.APIError.generate(429, {}, 'x', new Headers({ 'retry-after': '2' }));
			return message('ok');
		});
		expect(await new ClaudeProvider(client, MODELS, deps).complete({ user: 'q', maxTokens: 1 })).toBe('ok');
		expect(deps.waits).toEqual([2000]);
	});
});

describe('ClaudeProvider.stream', () => {
	it('조각을 순서대로 내보내고 기본 등급은 smart다', async () => {
		const { client, calls } = fakeClient(() => deltas(['안', '', '녕']));
		const provider = new ClaudeProvider(client, MODELS, testDeps());
		expect(await collect(provider.stream({ user: 'q', maxTokens: 10 }))).toEqual(['안', '녕']);
		expect(calls[0].params).toMatchObject({ model: 'claude-smart-test', stream: true });
	});

	it('취소하면 더 내보내지 않고 모델 쪽 스트림을 닫는다', async () => {
		let closed = false;
		const controller = new AbortController();
		const { client, calls } = fakeClient(() =>
			(async function* () {
				try {
					for (const text of ['하나', '둘', '셋']) yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
				} finally {
					closed = true;
				}
			})()
		);
		const out: string[] = [];
		for await (const chunk of new ClaudeProvider(client, MODELS, testDeps()).stream({ user: 'q', maxTokens: 10, signal: controller.signal })) {
			out.push(chunk);
			controller.abort();
		}
		expect(out).toEqual(['하나']);
		expect(closed).toBe(true);
		expect(calls[0].signal).toBe(controller.signal);
	});

	it('조각이 나간 뒤 끊기면 다시 시도하지 않고 ai_unavailable', async () => {
		const { client, calls } = fakeClient(() =>
			(async function* () {
				yield { type: 'content_block_delta', delta: { type: 'text_delta', text: '안' } };
				throw new Anthropic.APIConnectionError({ message: 'socket hang up' });
			})()
		);
		const out: string[] = [];
		const err = await (async () => {
			for await (const c of new ClaudeProvider(client, MODELS, testDeps()).stream({ user: 'q', maxTokens: 10 })) out.push(c);
		})().catch((e) => e);
		expect(err.code).toBe('ai_unavailable');
		expect(out).toEqual(['안']);
		expect(calls).toHaveLength(1);
	});
});

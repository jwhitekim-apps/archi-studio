import { describe, expect, it } from 'vitest';
import { ClaudeProvider, type ClaudeClient } from './claude';
import { collect, testDeps } from './test-helpers';

const API_KEY = 'test-secret-key-value';
const PROMPT = '미발표 원고의 본문 문장';
const ANSWER = '모델이 만든 요약 문장';

function client(fail: boolean): ClaudeClient {
	return {
		messages: {
			async create(params) {
				if (fail) throw Object.assign(new Error(`401 invalid x-api-key ${API_KEY}`), { status: 401 });
				if (params.stream) {
					return (async function* () {
						yield { type: 'content_block_delta', delta: { type: 'text_delta', text: ANSWER } };
					})();
				}
				return { content: [{ type: 'text', text: ANSWER }] };
			}
		}
	};
}

const MODELS = { fast: 'f', smart: 's' };

describe('호출 로그', () => {
	it('성공 호출은 제공자, 등급, 시간, 성공 여부만 남긴다', async () => {
		const deps = testDeps();
		const provider = new ClaudeProvider(client(false), MODELS, deps);
		await provider.complete({ system: PROMPT, user: PROMPT, maxTokens: 10 });
		await collect(provider.stream({ user: PROMPT, maxTokens: 10 }));
		expect(deps.logs).toEqual([
			{ provider: 'claude', tier: 'fast', ms: 0, ok: true },
			{ provider: 'claude', tier: 'smart', ms: 0, ok: true }
		]);
	});

	it('실패 호출은 오류 코드를 남기고 키, 프롬프트, 응답은 남기지 않는다', async () => {
		const deps = testDeps();
		const provider = new ClaudeProvider(client(true), MODELS, deps);
		const err = await provider.complete({ user: PROMPT, maxTokens: 10 }).catch((e) => e);
		await collect(provider.stream({ user: PROMPT, maxTokens: 10 })).catch(() => {});
		expect(deps.logs).toEqual([
			{ provider: 'claude', tier: 'fast', ms: 0, ok: false, code: 'ai_unavailable', status: 401 },
			{ provider: 'claude', tier: 'smart', ms: 0, ok: false, code: 'ai_unavailable', status: 401 }
		]);
		const all = JSON.stringify(deps.logs) + err.message;
		for (const secret of [API_KEY, PROMPT, ANSWER]) expect(all).not.toContain(secret);
	});
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiError, createFakeProvider } from './index';
import { collect } from './test-helpers';

describe('createFakeProvider', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('정해진 응답과 조각을 돌려주고 네트워크를 쓰지 않는다', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		const fake = createFakeProvider({ responses: [' 첫째 ', '둘째'], chunks: ['안', '', '녕'] });
		expect(await fake.complete({ user: 'a', maxTokens: 1 })).toBe('첫째');
		expect(await fake.complete({ user: 'b', maxTokens: 1 })).toBe('둘째');
		expect(await fake.complete({ user: 'c', maxTokens: 1 })).toBe('둘째');
		expect(await collect(fake.stream({ user: 'd', maxTokens: 1 }))).toEqual(['안', '녕']);
		expect(fake.calls.map((c) => [c.method, c.request.user])).toEqual([
			['complete', 'a'],
			['complete', 'b'],
			['complete', 'c'],
			['stream', 'd']
		]);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it.each(['ai_rate_limited', 'ai_invalid_json'] as const)('오류 %s를 지정하면 같은 코드의 AiError를 던진다', async (code) => {
		const fake = createFakeProvider({ error: code });
		const err = await fake.complete({ user: 'q', maxTokens: 1 }).catch((e) => e);
		expect(err).toBeInstanceOf(AiError);
		expect(err.code).toBe(code);
		await expect(collect(fake.stream({ user: 'q', maxTokens: 1 }))).rejects.toMatchObject({ code });
	});
});

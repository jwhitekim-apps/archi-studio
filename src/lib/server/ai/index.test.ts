import { describe, expect, it } from 'vitest';
import type { ClaudeClient } from './claude';
import type { AiEnv } from './config';
import type { GeminiClient } from './gemini';
import { AiError, getAiProvider } from './index';

const ENV = {
	ANTHROPIC_API_KEY: 'sk-test',
	GEMINI_API_KEY: 'gm-test',
	LOCAL_LLM_BASE_URL: 'https://llm.school.test/v1',
	LOCAL_LLM_MODEL: 'school-model'
};

describe('getAiProvider', () => {
	it.each([
		['claude', {}],
		['gemini', { AI_PROVIDER: 'gemini' }],
		['local', { AI_PROVIDER: 'local' }]
	])('%s 제공자를 만든다', (name, extra) => {
		expect(getAiProvider('translation', { env: { ...ENV, ...extra } }).name).toBe(name);
	});

	it('주입한 SDK 클라이언트에 설정의 키를 넘긴다', () => {
		const keys: string[] = [];
		const claudeClient = (key: string) => (keys.push(key), {} as ClaudeClient);
		const geminiClient = (key: string) => (keys.push(key), {} as GeminiClient);
		getAiProvider('analysis', { env: ENV, claudeClient, geminiClient });
		getAiProvider('analysis', { env: { ...ENV, AI_PROVIDER: 'gemini' }, claudeClient, geminiClient });
		expect(keys).toEqual(['sk-test', 'gm-test']);
	});

	it('호출할 때마다 환경을 다시 읽는다', () => {
		const env: AiEnv = { ...ENV };
		expect(getAiProvider('translation', { env }).name).toBe('claude');
		env.AI_PROVIDER_TRANSLATION = 'gemini';
		expect(getAiProvider('translation', { env }).name).toBe('gemini');
		expect(getAiProvider('analysis', { env }).name).toBe('claude');
	});

	it('설정 오류는 AiError로 바로 던진다', () => {
		expect(() => getAiProvider('translation', { env: {} })).toThrow(AiError);
	});
});

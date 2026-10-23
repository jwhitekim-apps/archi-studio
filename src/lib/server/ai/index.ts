// 번역·분석이 쓰는 입구: getAiProvider('translation').stream({...}) 처럼 제공자를 모른 채 부른다.
import { ClaudeProvider, createClaudeClient, type ClaudeClient } from './claude';
import { aiEnv, resolveAiConfig, type AiEnv } from './config';
import { createGeminiClient, GeminiProvider, type GeminiClient } from './gemini';
import { LocalProvider } from './local';
import type { ProviderDeps } from './provider';
import type { AiProvider, AiPurpose } from './types';

export interface AiProviderFactoryOptions extends ProviderDeps {
	env?: AiEnv;
	claudeClient?: (apiKey: string) => ClaudeClient;
	geminiClient?: (apiKey: string) => GeminiClient;
	fetch?: typeof fetch;
}

// 호출할 때마다 환경 변수를 다시 읽는다(클라이언트 생성은 가볍다).
export function getAiProvider(purpose: AiPurpose, options: AiProviderFactoryOptions = {}): AiProvider {
	const { env, claudeClient, geminiClient, fetch, ...deps } = options;
	const config = resolveAiConfig(purpose, env ?? aiEnv());
	switch (config.provider) {
		case 'claude':
			return new ClaudeProvider((claudeClient ?? createClaudeClient)(config.apiKey), config.models, deps);
		case 'gemini':
			return new GeminiProvider((geminiClient ?? createGeminiClient)(config.apiKey), config.models, deps);
		case 'local':
			return new LocalProvider({ baseUrl: config.baseUrl, apiKey: config.apiKey, models: config.models, fetch }, deps);
	}
}

export { createFakeProvider, type FakeProvider, type FakeProviderOptions } from './fake';
export { extractJson, JSON_OUTPUT_CONTRACT } from './json';
export { AiError, type AiErrorCode, type AiProvider, type AiPurpose, type AiRequest, type AiTier } from './types';

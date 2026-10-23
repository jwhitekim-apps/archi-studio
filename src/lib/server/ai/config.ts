// AI 제공자 설정 읽기. 환경 변수는 이 파일에서만 읽고, 시험에서는 환경 객체를 넘긴다.
import { env } from '$env/dynamic/private';
import { AI_PROVIDER_NAMES, AI_TIERS, AiError, type AiPurpose, type AiProviderName, type AiTier } from './types';

export type AiEnv = Record<string, string | undefined>;

export type AiModels = Record<AiTier, string>;

export type AiProviderConfig =
	| { provider: 'claude'; apiKey: string; models: AiModels }
	| { provider: 'gemini'; apiKey: string; models: AiModels }
	| { provider: 'local'; baseUrl: string; apiKey: string | undefined; models: AiModels };

export const DEFAULT_MODELS: Record<'claude' | 'gemini', AiModels> = {
	claude: { fast: 'claude-haiku-5-5', smart: 'claude-sonnet-5-5' },
	gemini: { fast: 'gemini-3.1-flash-lite', smart: 'gemini-3.5-flash' }
};

const PURPOSE_VARS: Record<AiPurpose, string> = {
	translation: 'AI_PROVIDER_TRANSLATION',
	analysis: 'AI_PROVIDER_ANALYSIS'
};

export function aiEnv(): AiEnv {
	return env;
}

function value(source: AiEnv, name: string): string | undefined {
	const v = source[name]?.trim();
	return v ? v : undefined;
}

function required(source: AiEnv, name: string): string {
	const v = value(source, name);
	if (!v) throw new AiError('ai_not_configured', `환경 변수 ${name}가 설정되지 않았습니다.`);
	return v;
}

export function providerNameFor(purpose: AiPurpose, source: AiEnv): AiProviderName {
	const name = (value(source, PURPOSE_VARS[purpose]) ?? value(source, 'AI_PROVIDER') ?? 'claude').toLowerCase();
	if (!(AI_PROVIDER_NAMES as readonly string[]).includes(name)) {
		throw new AiError(
			'ai_not_configured',
			`알 수 없는 AI 제공자 '${name}'입니다. 사용할 수 있는 이름: ${AI_PROVIDER_NAMES.join(', ')}`
		);
	}
	return name as AiProviderName;
}

function models(source: AiEnv, prefix: 'CLAUDE' | 'GEMINI', defaults: AiModels): AiModels {
	return {
		fast: value(source, `${prefix}_MODEL_FAST`) ?? defaults.fast,
		smart: value(source, `${prefix}_MODEL_SMART`) ?? defaults.smart
	};
}

// 비서(morning-desk)와 같은 값: https://…/v1 까지 포함한 주소. 평문 http는 거부한다.
function localBaseUrl(source: AiEnv): string {
	const raw = required(source, 'LOCAL_LLM_BASE_URL');
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new AiError('ai_not_configured', 'LOCAL_LLM_BASE_URL이 올바른 주소가 아닙니다.');
	}
	if (url.protocol !== 'https:') {
		throw new AiError('ai_not_configured', 'LOCAL_LLM_BASE_URL은 https:// 주소여야 합니다.');
	}
	return raw.replace(/\/+$/, '');
}

export function resolveAiConfig(purpose: AiPurpose, source: AiEnv = aiEnv()): AiProviderConfig {
	const provider = providerNameFor(purpose, source);
	switch (provider) {
		case 'claude':
			return {
				provider,
				apiKey: required(source, 'ANTHROPIC_API_KEY'),
				models: models(source, 'CLAUDE', DEFAULT_MODELS.claude)
			};
		case 'gemini':
			return {
				provider,
				apiKey: required(source, 'GEMINI_API_KEY'),
				models: models(source, 'GEMINI', DEFAULT_MODELS.gemini)
			};
		case 'local': {
			// 로컬 모델은 등급 구분 없이 모델 하나를 쓴다.
			const model = required(source, 'LOCAL_LLM_MODEL');
			return {
				provider,
				baseUrl: localBaseUrl(source),
				apiKey: value(source, 'LOCAL_LLM_API_KEY'),
				models: { fast: model, smart: model }
			};
		}
	}
}

export function modelForTier(models: AiModels, tier: string): string {
	if (!(AI_TIERS as readonly string[]).includes(tier)) {
		throw new AiError('ai_not_configured', `알 수 없는 모델 등급 '${tier}'입니다. 사용할 수 있는 등급: ${AI_TIERS.join(', ')}`);
	}
	return models[tier as AiTier];
}

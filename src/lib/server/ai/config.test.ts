import { describe, expect, it } from 'vitest';
import { DEFAULT_MODELS, modelForTier, resolveAiConfig, type AiEnv } from './config';
import { AiError } from './types';

const KEYS = { ANTHROPIC_API_KEY: 'sk-test-claude', GEMINI_API_KEY: 'gm-test-gemini' };
const LOCAL = { LOCAL_LLM_BASE_URL: 'https://llm.school.test/v1', LOCAL_LLM_MODEL: 'school-model' };

function thrown(fn: () => unknown): AiError {
	try {
		fn();
	} catch (e) {
		if (e instanceof AiError) return e;
		throw e;
	}
	throw new Error('오류가 나지 않았다');
}

describe('제공자 선택', () => {
	it.each<[string, AiEnv, 'translation' | 'analysis', string]>([
		['기본값은 claude', { ...KEYS }, 'translation', 'claude'],
		['AI_PROVIDER=gemini', { ...KEYS, AI_PROVIDER: 'gemini' }, 'analysis', 'gemini'],
		['대소문자 무시', { ...KEYS, AI_PROVIDER: 'Gemini' }, 'analysis', 'gemini'],
		['빈 값은 없는 것으로 본다', { ...KEYS, AI_PROVIDER: '' }, 'analysis', 'claude'],
		['번역용 덮어쓰기', { ...KEYS, ...LOCAL, AI_PROVIDER: 'claude', AI_PROVIDER_TRANSLATION: 'local' }, 'translation', 'local'],
		['덮어쓰기는 그 용도에만', { ...KEYS, ...LOCAL, AI_PROVIDER: 'claude', AI_PROVIDER_TRANSLATION: 'local' }, 'analysis', 'claude'],
		['분석용 덮어쓰기', { ...KEYS, AI_PROVIDER_ANALYSIS: 'gemini' }, 'analysis', 'gemini']
	])('%s', (_, env, purpose, expected) => {
		expect(resolveAiConfig(purpose, env).provider).toBe(expected);
	});

	it('알 수 없는 이름은 ai_not_configured이고 사용할 수 있는 이름을 알려 준다', () => {
		const err = thrown(() => resolveAiConfig('translation', { ...KEYS, AI_PROVIDER: 'foo' }));
		expect(err.code).toBe('ai_not_configured');
		expect(err.message).toContain('claude, gemini, local');
	});

	it.each<[string, AiEnv, string]>([
		['claude 키 누락', { GEMINI_API_KEY: KEYS.GEMINI_API_KEY }, 'ANTHROPIC_API_KEY'],
		['gemini 키 누락', { ANTHROPIC_API_KEY: KEYS.ANTHROPIC_API_KEY, AI_PROVIDER: 'gemini' }, 'GEMINI_API_KEY'],
		['local 주소 누락', { ...KEYS, AI_PROVIDER: 'local', LOCAL_LLM_MODEL: 'm' }, 'LOCAL_LLM_BASE_URL'],
		['local 모델 누락', { ...KEYS, AI_PROVIDER: 'local', LOCAL_LLM_BASE_URL: LOCAL.LOCAL_LLM_BASE_URL }, 'LOCAL_LLM_MODEL']
	])('%s: 변수 이름만 있고 키 값은 없다', (_, env, variable) => {
		const err = thrown(() => resolveAiConfig('translation', env));
		expect(err.code).toBe('ai_not_configured');
		expect(err.message).toContain(variable);
		expect(err.message).not.toContain(KEYS.ANTHROPIC_API_KEY);
		expect(err.message).not.toContain(KEYS.GEMINI_API_KEY);
	});

	it('local의 평문 http 주소는 거부한다', () => {
		const err = thrown(() =>
			resolveAiConfig('translation', { AI_PROVIDER: 'local', LOCAL_LLM_BASE_URL: 'http://llm.school.test/v1', LOCAL_LLM_MODEL: 'm' })
		);
		expect(err.code).toBe('ai_not_configured');
	});
});

describe('모델 등급', () => {
	it.each<[string, AiEnv, { fast: string; smart: string }]>([
		['claude 기본값', { ...KEYS }, DEFAULT_MODELS.claude],
		['gemini 기본값', { ...KEYS, AI_PROVIDER: 'gemini' }, DEFAULT_MODELS.gemini],
		['claude fast 덮어쓰기', { ...KEYS, CLAUDE_MODEL_FAST: 'my-fast' }, { fast: 'my-fast', smart: DEFAULT_MODELS.claude.smart }],
		['gemini smart 덮어쓰기', { ...KEYS, AI_PROVIDER: 'gemini', GEMINI_MODEL_SMART: 'my-smart' }, { fast: DEFAULT_MODELS.gemini.fast, smart: 'my-smart' }],
		['local은 두 등급이 같은 모델', { ...LOCAL, AI_PROVIDER: 'local' }, { fast: 'school-model', smart: 'school-model' }]
	])('%s', (_, env, expected) => {
		expect(resolveAiConfig('translation', env).models).toEqual(expected);
	});

	it('없는 등급은 ai_not_configured', () => {
		const err = thrown(() => modelForTier(DEFAULT_MODELS.claude, 'ultra'));
		expect(err.code).toBe('ai_not_configured');
	});
});

// 실제 AI 제공자와 DB 저장소를 묶는 곳. 시험은 testHooks로 가짜를 넣는다(서비스 코드는 이 값을 설정하지 않는다).
import { getAiProvider, type AiProvider } from '../ai';
import { createServiceClient } from '../supabase';
import { supabaseTranslationRepository, type TranslationRepository } from './repository';
import type { TranslateDeps } from './service';

export const testHooks: { provider?: AiProvider; repository?: TranslationRepository } = {};

export function translationRepository(): TranslationRepository {
	return testHooks.repository ?? supabaseTranslationRepository(createServiceClient());
}

export function translationDeps(): TranslateDeps {
	return {
		repo: translationRepository(),
		provider: () => testHooks.provider ?? getAiProvider('translation')
	};
}

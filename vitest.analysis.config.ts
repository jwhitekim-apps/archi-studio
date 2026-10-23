import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// 논문 분석 통합 테스트용 설정. 로컬 Supabase가 떠 있어야 한다. 외부 서비스(AI, Semantic Scholar, Zotero)는 가짜를 쓴다.
export default defineConfig({
	plugins: [sveltekit()],
	envPrefix: ['SUPABASE_'],
	test: {
		include: ['src/**/*.analysis.ts'],
		testTimeout: 30000,
		hookTimeout: 30000
	}
});

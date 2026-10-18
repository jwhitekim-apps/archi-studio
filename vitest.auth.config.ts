import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// 로컬 Supabase가 떠 있어야 하는 통합 테스트용 설정. 일반 `npm test`에는 포함되지 않는다.
export default defineConfig({
	plugins: [sveltekit()],
	envPrefix: ['SUPABASE_'],
	test: {
		include: ['src/**/*.integration.ts'],
		testTimeout: 30000,
		hookTimeout: 30000
	}
});

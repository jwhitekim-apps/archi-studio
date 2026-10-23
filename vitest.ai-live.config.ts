import { sveltekit } from '@sveltejs/kit/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// 실제 AI 제공자를 부르는 선택 실행 시험용 설정. AI_LIVE_TEST=1일 때만 돌고 일반 `npm test`에는 포함되지 않는다.
export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.live.ts'],
		// 명령줄에서 준 값(예: AI_PROVIDER=gemini)이 .env보다 우선한다.
		env: { ...loadEnv('', process.cwd(), ''), ...process.env } as Record<string, string>,
		testTimeout: 60000
	}
});

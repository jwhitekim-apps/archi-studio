import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	// Node 어댑터: Docker로 올리는 배포 방식에 맞춘다(design 결정 1).
	kit: {
		adapter: adapter(),
		// 내장 CSRF 검사는 /api의 공통 오류 형식을 지킬 수 없어 끄고, 같은 조건의 검사를 hooks(csrf.ts)에서 한다.
		csrf: { trustedOrigins: ['*'] }
	},
	vitePlugin: {
		// 라이브러리를 제외하고 runes 모드를 강제한다.
		dynamicCompileOptions: ({ filename }) =>
			filename.split(/[/\\]/).includes('node_modules') ? undefined : { runes: true }
	}
};

export default config;

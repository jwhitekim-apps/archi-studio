import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	// Node 어댑터: Docker로 올리는 배포 방식에 맞춘다(design 결정 1).
	kit: { adapter: adapter() },
	vitePlugin: {
		// 라이브러리를 제외하고 runes 모드를 강제한다.
		dynamicCompileOptions: ({ filename }) =>
			filename.split(/[/\\]/).includes('node_modules') ? undefined : { runes: true }
	}
};

export default config;

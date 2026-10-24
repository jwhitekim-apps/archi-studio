import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	// pdf.js 워커 진입점(src/lib/viewer/pdf-worker-entry.ts)이 ES 모듈 import를 쓰므로 ES 형식으로 묶는다
	worker: { format: 'es' }
});

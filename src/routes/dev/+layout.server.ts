// 부품 확인 화면은 개발 서버에서만 연다(design 결정 8). 빌드한 서버에서는 404다.
import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => {
	if (!dev) error(404, 'Not Found');
	return {};
};

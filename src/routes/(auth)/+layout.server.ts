// 로그인·가입 화면: 이미 로그인한 사용자는 서재로 보낸다. 확인에 실패하면 화면은 그대로 연다.
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ fetch }) => {
	const response = await fetch('/api/auth/me');
	if (response.ok) redirect(303, '/library');
	return {};
};

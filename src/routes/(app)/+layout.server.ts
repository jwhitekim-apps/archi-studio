// 셸이 있는 모든 화면의 로그인 확인(design 결정 2). 전체 페이지를 새로 열 때 서버에서 확인하고 곧바로 보낸다.
// 화면을 쓰는 도중의 만료는 apiFetch의 401 처리가 맡는다.
import { error, redirect } from '@sveltejs/kit';
import { loginUrl } from '$lib/api/client';
import type { User } from '$lib/api/types';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ fetch, url }) => {
	const response = await fetch('/api/auth/me');
	if (response.status === 401) redirect(303, loginUrl(url));
	if (!response.ok) error(503, '로그인 상태를 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
	return { user: (await response.json()) as User };
};

import { loadBriefingList } from '$lib/briefing';
import type { PageLoad } from './$types';

// 서재와 같이 브라우저에서만 그린다. 401은 apiFetch가 로그인 화면(돌아올 주소 포함)으로 보낸다.
export const ssr = false;

export const load: PageLoad = ({ fetch, url, depends }) => {
	depends('app:briefings');
	// 읽기 전용 화면이라 오른쪽 설정 패널을 접는다
	return { hasPanel: false, list: loadBriefingList(fetch, url) };
};

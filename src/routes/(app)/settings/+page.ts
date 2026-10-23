import { apiFetch } from '$lib/api/client';
import type { ZoteroStatus } from '$lib/api/types';
import type { PageLoad } from './$types';

// 서재와 같은 이유로 브라우저에서만 그린다(401 처리).
export const ssr = false;

export const load: PageLoad = ({ fetch, url, depends }) => {
	depends('app:settings');
	return {
		// Zotero 콜백이 돌려보낸 이유: denied(승인 거부), error(그 밖의 실패), in_use(다른 사용자가 이미 연결)
		zoteroResult: url.searchParams.get('zotero'),
		zotero: apiFetch<ZoteroStatus>('/api/zotero/status', { fetch })
	};
};

// 서재 데이터는 주소(query, collection)를 기준으로 불러온다(design 결정 4).
// 화면이 바로 그려지고 목록은 불러오는 중으로 보이도록 기다리지 않은 Promise를 넘긴다.
import { apiFetch } from '$lib/api/client';
import type { Collection, PaperList, ZoteroStatus } from '$lib/api/types';
import { papersPath } from '$lib/library';
import type { PageLoad } from './$types';

// 401 처리(로그인 화면 이동)가 브라우저에서 일어나도록 이 화면은 브라우저에서만 그린다.
// 로그인 확인 자체는 (app) 레이아웃이 서버에서 먼저 한다.
export const ssr = false;

export const load: PageLoad = ({ fetch, url, depends }) => {
	depends('app:library');
	const query = url.searchParams.get('query') ?? '';
	const collection = url.searchParams.get('collection') ?? '';
	return {
		query,
		collection,
		papers: apiFetch<PaperList>(papersPath(query, collection), { fetch }),
		collections: apiFetch<Collection[]>('/api/collections', { fetch }).catch(() => [] as Collection[]),
		zotero: apiFetch<ZoteroStatus>('/api/zotero/status', { fetch }).catch(() => null)
	};
};

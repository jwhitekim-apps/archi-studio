import type { PageLoad } from './$types';

// 번역 화면과 같은 이유로 브라우저에서만 그린다(design 결정 1).
export const ssr = false;

export const load: PageLoad = ({ url }) => ({ paperId: url.searchParams.get('paperId') });

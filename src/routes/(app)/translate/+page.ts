import type { PageLoad } from './$types';

// 스트림을 브라우저가 읽고 자동 번역 설정을 브라우저 저장소에서 읽으므로 브라우저에서만 그린다(design 결정 1).
export const ssr = false;

export const load: PageLoad = ({ url }) => ({ paperId: url.searchParams.get('paperId') });

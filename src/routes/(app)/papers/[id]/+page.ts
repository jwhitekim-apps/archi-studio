import type { PageLoad } from './$types';

// 번역·분석 화면과 같이 브라우저에서만 그린다. 작업 영역 폭을 재야 배치가 정해진다.
export const ssr = false;

export const load: PageLoad = ({ params }) => ({ id: params.id });

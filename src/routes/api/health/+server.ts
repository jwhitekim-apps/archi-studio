import { json } from '@sveltejs/kit';

// 공개 경로. 사용자나 DB 정보는 담지 않는다.
export const GET = () => json({ status: 'ok' });

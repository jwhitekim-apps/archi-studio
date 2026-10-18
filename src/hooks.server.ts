import type { HandleServerError } from '@sveltejs/kit';
import { createApiHandle } from '$lib/server/api-guard';
import { verifySession } from '$lib/server/session';

export const handle = createApiHandle({ verify: verifySession });

// 예외 원문과 스택은 응답에 싣지 않는다.
export const handleError: HandleServerError = ({ error }) => {
	console.error('[server] unhandled error', error instanceof Error ? error.name : 'unknown');
	return { message: '서버에서 오류가 발생했습니다.' };
};

// 모든 /api 오류 응답의 공통 형식: { error: { code, message } }
// 라우트가 직접 만든 오류는 헤더로 표시해 두고, 훅이 SvelteKit이 만든 기본 오류와 구분한다.
export const ERROR_MARKER_HEADER = 'x-archi-error';

export const STANDARD_ERRORS = {
	not_found: { status: 404, message: '요청한 경로를 찾을 수 없습니다.' },
	method_not_allowed: { status: 405, message: '이 경로에서 지원하지 않는 메서드입니다.' },
	unauthenticated: { status: 401, message: '로그인이 필요합니다.' },
	internal_error: { status: 500, message: '서버에서 오류가 발생했습니다.' }
} as const;

export type StandardErrorCode = keyof typeof STANDARD_ERRORS;

export function errorResponse(
	status: number,
	code: string,
	message: string,
	headers: HeadersInit = {}
): Response {
	const res = new Response(JSON.stringify({ error: { code, message } }), {
		status,
		headers: { 'content-type': 'application/json', ...headers }
	});
	res.headers.set(ERROR_MARKER_HEADER, '1');
	return res;
}

export function standardError(code: StandardErrorCode, headers: HeadersInit = {}): Response {
	const { status, message } = STANDARD_ERRORS[code];
	return errorResponse(status, code, message, headers);
}

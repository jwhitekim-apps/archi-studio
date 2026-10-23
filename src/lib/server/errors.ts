// 모든 /api 오류 응답의 공통 형식: { error: { code, message } }
// 라우트가 직접 만든 오류는 헤더로 표시해 두고, 훅이 SvelteKit이 만든 기본 오류와 구분한다.
export const ERROR_MARKER_HEADER = 'x-archi-error';

export const STANDARD_ERRORS = {
	not_found: { status: 404, message: '요청한 경로를 찾을 수 없습니다.' },
	method_not_allowed: { status: 405, message: '이 경로에서 지원하지 않는 메서드입니다.' },
	unauthenticated: { status: 401, message: '로그인이 필요합니다.' },
	forbidden_origin: { status: 403, message: '허용되지 않은 출처의 요청입니다.' },
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

// 없는 논문, 남의 논문, UUID가 아닌 id를 구분하지 않는다(존재 여부를 드러내지 않는다).
export function paperNotFound(): Response {
	return errorResponse(404, 'paper_not_found', '논문을 찾을 수 없습니다.');
}

export function payloadTooLarge(message = '요청 본문이 너무 큽니다.'): Response {
	return errorResponse(413, 'payload_too_large', message);
}

// AI 오류의 HTTP 응답(archi-studio-translation 결정 5). 세부 원인은 서버 로그에 코드 이름만 남긴다.
export function aiNotConfigured(): Response {
	return errorResponse(503, 'ai_not_configured', 'AI 모델이 설정되어 있지 않습니다. 관리자에게 문의해 주세요.');
}

export function aiUnavailable(): Response {
	return errorResponse(502, 'ai_unavailable', 'AI 모델이 응답하지 않습니다. 잠시 뒤 다시 시도해 주세요.');
}

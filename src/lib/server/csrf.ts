// SvelteKit 내장 CSRF 검사를 대신하는 Origin 검사. 내장 검사는 handle보다 먼저 일반 텍스트 403을 돌려줘서
// /api의 공통 오류 형식을 지킬 수 없으므로 svelte.config.js에서 끄고(csrf.trustedOrigins: ['*']) 여기서 같은 조건으로 적용한다.
// 조건(@sveltejs/kit respond.js와 같음): 쓰기 메서드 + 폼 형식 본문 + Origin이 서버 출처와 다름(없는 경우 포함).
import type { RequestEvent } from '@sveltejs/kit';
import { ERROR_MARKER_HEADER, standardError } from './errors';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// 브라우저 폼이 보낼 수 있는 본문 형식. 이 형식은 사전 요청(preflight) 없이 다른 출처에서 보낼 수 있어 막는다.
const FORM_CONTENT_TYPES = new Set([
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain',
	'application/x-sveltekit-formdata'
]);

function isFormContentType(request: Request): boolean {
	const type = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? '';
	return FORM_CONTENT_TYPES.has(type);
}

export function isForbiddenOrigin(request: Request, url: URL): boolean {
	return (
		WRITE_METHODS.has(request.method) &&
		isFormContentType(request) &&
		request.headers.get('origin') !== url.origin
	);
}

// 거부해야 하면 응답을 돌려주고 아니면 null. /api는 공통 오류 JSON, 그 밖의 경로는 내장 검사와 같은 응답이다.
export function csrfRejection(
	event: Pick<RequestEvent, 'request' | 'url'>,
	isApi: boolean
): Response | null {
	if (!isForbiddenOrigin(event.request, event.url)) return null;
	if (isApi) {
		// 훅에서 직접 돌려주는 응답이라 normalize를 거치지 않으므로 표시 헤더를 여기서 뗀다.
		const res = standardError('forbidden_origin');
		res.headers.delete(ERROR_MARKER_HEADER);
		return res;
	}

	const message = `Cross-site ${event.request.method} form submissions are forbidden`;
	if (event.request.headers.get('accept') === 'application/json') {
		return Response.json({ message }, { status: 403 });
	}
	return new Response(message, { status: 403, headers: { 'content-type': 'text/plain' } });
}

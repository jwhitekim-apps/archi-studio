import type { Handle } from '@sveltejs/kit';
import { csrfRejection } from './csrf';
import { ERROR_MARKER_HEADER, standardError } from './errors';
import { SESSION_COOKIE, type SessionVerifier } from './session';
import { sessionCookieOptions } from './session-cookie';

// 공개 경로 허용 목록. 여기 없는 /api 경로는 기본적으로 보호된다.
export const PUBLIC_API_ROUTES: ReadonlySet<string> = new Set([
	'GET /api/health',
	'POST /api/auth/signup',
	'POST /api/auth/login'
]);

// 메모 저장만 큰 본문을 받는다(archi-studio-paper-notes 결정 4). 서버 전체 한도(BODY_SIZE_LIMIT)를 올려도
// 나머지 /api 경로는 Node 어댑터 기본 한도와 같은 512 KB를 넘는 본문을 읽지 못하게 한다.
export const DEFAULT_BODY_LIMIT = 512 * 1024;
const LARGE_BODY_ROUTE = /^\/api\/papers\/[^/]+\/memo$/;

// 한도를 넘는 순간 읽기가 실패하는 본문으로 바꾼다. 어댑터가 한도를 넘는 본문에 하는 것과 같다.
export function limitBody(request: Request, limit: number): Request {
	const source = request.body;
	if (!source) return request;
	const tooLarge = () => new Error('body too large');
	const declared = Number(request.headers.get('content-length'));
	let body: ReadableStream<Uint8Array>;
	if (Number.isFinite(declared) && declared > limit) {
		// 선언된 길이가 넘으면 원래 본문은 건드리지 않는다.
		body = new ReadableStream({ start: (controller) => controller.error(tooLarge()) });
	} else {
		// 넘는 순간 읽기를 멈춘다. 원래 본문을 취소하면 연결이 끊겨 응답이 가지 않으므로 취소하지 않는다.
		const reader = source.getReader();
		let size = 0;
		body = new ReadableStream({
			async pull(controller) {
				const { done, value } = await reader.read();
				if (done) return controller.close();
				size += value.byteLength;
				if (size > limit) controller.error(tooLarge());
				else controller.enqueue(value);
			},
			cancel: (reason) => reader.cancel(reason)
		});
	}
	return new Request(request.url, {
		method: request.method,
		headers: request.headers,
		signal: request.signal,
		body,
		duplex: 'half'
	} as RequestInit);
}

export interface ApiGuardOptions {
	verify: SessionVerifier;
	publicRoutes?: ReadonlySet<string>;
}

const isApiPath = (pathname: string) => pathname === '/api' || pathname.startsWith('/api/');

// SvelteKit 라우터가 라우트를 찾을 때 쓰는 경로와 같은 표현(퍼센트 인코딩을 풀고 %25는 그대로 둔다).
// 인코딩된 원문(/%61pi/...)으로 판정하면 라우터는 /api/...로 연결하는데 가드는 보호 대상이 아니라고 보게 된다.
// 디코딩에 실패하면 null이고, 프레임워크도 같은 이유로 400을 돌려 라우트를 실행하지 않는다.
export function routePath(url: URL): string | null {
	try {
		return url.pathname.split('%25').map(decodeURI).join('%25');
	} catch {
		return null;
	}
}

export function createApiHandle({
	verify,
	publicRoutes = PUBLIC_API_ROUTES
}: ApiGuardOptions): Handle {
	return async ({ event, resolve }) => {
		event.locals.user = null;
		const path = routePath(event.url);
		// 디코딩에 실패한 경로는 원문이 /api로 시작하면 보호 대상으로 본다(공개 경로일 수 없다).
		const isApi = isApiPath(path ?? event.url.pathname);

		const forbidden = csrfRejection(event, isApi);
		if (forbidden) return forbidden;
		if (!isApi) return resolve(event);

		if (!(path !== null && event.request.method === 'PUT' && LARGE_BODY_ROUTE.test(path))) {
			event.request = limitBody(event.request, DEFAULT_BODY_LIMIT);
		}

		try {
			const isPublic = path !== null && publicRoutes.has(`${event.request.method} ${path}`);
			if (!isPublic) {
				const token = event.cookies.get(SESSION_COOKIE);
				const session = token ? await verify(token) : null;
				if (!session) return standardError('unauthenticated');
				event.locals.user = session.user;
				// 접근 토큰이 갱신됐으면 새 값으로 쿠키를 다시 설정한다(이후 오류 응답에도 실린다).
				if (session.renewedToken) {
					event.cookies.set(SESSION_COOKIE, session.renewedToken, sessionCookieOptions(event.url));
				}
			}

			const res = await resolve(event);
			return normalize(res);
		} catch (err) {
			console.error('[api] unhandled error', err instanceof Error ? err.name : 'unknown');
			return standardError('internal_error');
		}
	};
}

// 라우트가 직접 만든 오류는 표시 헤더만 떼고 그대로 보낸다. SvelteKit이 만든 404, 405, 500은 공통 형식으로 바꾼다.
function normalize(res: Response): Response {
	if (res.headers.has(ERROR_MARKER_HEADER)) {
		const headers = new Headers(res.headers);
		headers.delete(ERROR_MARKER_HEADER);
		return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
	}
	if (res.status === 404) return stripMarker(standardError('not_found'));
	if (res.status === 405) {
		const allow = res.headers.get('allow');
		return stripMarker(standardError('method_not_allowed', allow ? { allow } : {}));
	}
	if (res.status >= 500) return stripMarker(standardError('internal_error'));
	return res;
}

function stripMarker(res: Response): Response {
	res.headers.delete(ERROR_MARKER_HEADER);
	return res;
}

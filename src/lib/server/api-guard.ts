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

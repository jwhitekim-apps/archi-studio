import type { Handle } from '@sveltejs/kit';
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

export function createApiHandle({
	verify,
	publicRoutes = PUBLIC_API_ROUTES
}: ApiGuardOptions): Handle {
	return async ({ event, resolve }) => {
		event.locals.user = null;
		if (!isApiPath(event.url.pathname)) return resolve(event);

		try {
			const isPublic = publicRoutes.has(`${event.request.method} ${event.url.pathname}`);
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

import type { RequestHandler } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { logout } from '$lib/server/auth-service';
import { SESSION_COOKIE } from '$lib/server/session';
import { decodeSessionTokens } from '$lib/server/session-cookie';

export const POST: RequestHandler = async ({ cookies }) => {
	// 가드가 이미 세션을 확인했고, 갱신됐다면 쿠키에는 갱신된 값이 들어 있다.
	const tokens = decodeSessionTokens(cookies.get(SESSION_COOKIE));
	if (tokens) await logout(authDeps(), tokens.accessToken);
	cookies.delete(SESSION_COOKIE, { path: '/' });
	return new Response(null, { status: 204 });
};

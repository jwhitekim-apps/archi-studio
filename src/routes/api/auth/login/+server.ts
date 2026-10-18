import type { RequestHandler } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { invalidRequest, login, parseCredentials, readJson } from '$lib/server/auth-service';
import { SESSION_COOKIE } from '$lib/server/session';
import { encodeSessionTokens, sessionCookieOptions } from '$lib/server/session-cookie';

export const POST: RequestHandler = async ({ request, cookies, url, getClientAddress }) => {
	const credentials = parseCredentials(await readJson(request));
	if (!credentials) return invalidRequest();

	const { response, tokens } = await login(authDeps(), credentials, getClientAddress());
	if (tokens) cookies.set(SESSION_COOKIE, encodeSessionTokens(tokens), sessionCookieOptions(url));
	return response;
};

import type { RequestHandler } from './$types';
import { errorResponse, standardError } from '$lib/server/errors';
import { zoteroConfig } from '$lib/server/zotero/config';
import {
	encodePending,
	OAUTH_COOKIE,
	OAUTH_COOKIE_MAX_AGE_SECONDS,
	OAUTH_COOKIE_PATH
} from '$lib/server/zotero/connection';
import { buildAuthorizeUrl, getRequestToken } from '$lib/server/zotero/oauth1';

export const GET: RequestHandler = async ({ locals, cookies, url }) => {
	if (!locals.user) return standardError('unauthenticated');

	const config = zoteroConfig();
	let request;
	try {
		request = await getRequestToken(
			{
				consumerKey: config.clientKey,
				consumerSecret: config.clientSecret,
				callbackUrl: `${config.appBaseUrl}/api/zotero/callback`
			},
			config.oauth
		);
	} catch {
		return errorResponse(502, 'zotero_unavailable', 'Zotero에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.');
	}

	cookies.set(
		OAUTH_COOKIE,
		encodePending({ token: request.oauthToken, secret: request.oauthTokenSecret }, config.encryptionSecret),
		{
			path: OAUTH_COOKIE_PATH,
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS
		}
	);
	const location = buildAuthorizeUrl({ oauthToken: request.oauthToken, appName: 'Archi Studio' }, config.oauth);
	return new Response(null, { status: 302, headers: { location } });
};

import type { RequestHandler } from './$types';
import { standardError } from '$lib/server/errors';
import { createServiceClient } from '$lib/server/supabase';
import { zoteroConfig } from '$lib/server/zotero/config';
import {
	decodePending,
	OAUTH_COOKIE,
	OAUTH_COOKIE_PATH,
	REDIRECTS,
	saveConnection
} from '$lib/server/zotero/connection';
import { getAccessToken } from '$lib/server/zotero/oauth1';

const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });

export const GET: RequestHandler = async ({ locals, cookies, url }) => {
	if (!locals.user) return standardError('unauthenticated');

	const config = zoteroConfig();
	const pending = decodePending(cookies.get(OAUTH_COOKIE), config.encryptionSecret);
	// 한 번 쓰면 끝이다. 어떤 결과든 대기 쿠키는 지운다.
	cookies.delete(OAUTH_COOKIE, { path: OAUTH_COOKIE_PATH });

	const oauthToken = url.searchParams.get('oauth_token');
	const verifier = url.searchParams.get('oauth_verifier');

	// 사용자가 승인을 거부하면 verifier가 없거나 oauth_problem이 온다. 아무것도 저장하지 않는다.
	if (!verifier || url.searchParams.has('oauth_problem')) return redirect(REDIRECTS.denied);
	if (!pending || !oauthToken || pending.token !== oauthToken) return redirect(REDIRECTS.error);

	try {
		const access = await getAccessToken(
			{
				consumerKey: config.clientKey,
				consumerSecret: config.clientSecret,
				oauthToken,
				oauthTokenSecret: pending.secret,
				oauthVerifier: verifier
			},
			config.oauth
		);
		if (!access.userId || !access.oauthTokenSecret) return redirect(REDIRECTS.error);

		const result = await saveConnection(createServiceClient(), locals.user.id, {
			zoteroUserId: access.userId,
			username: access.username ?? '',
			apiKey: access.oauthTokenSecret,
			encryptionSecret: config.encryptionSecret
		});
		return redirect(result === 'in_use' ? REDIRECTS.inUse : REDIRECTS.success);
	} catch (err) {
		console.error('[zotero] 연결 완료 실패', err instanceof Error ? err.name : 'unknown');
		return redirect(REDIRECTS.error);
	}
};

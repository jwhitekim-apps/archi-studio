// Zotero OAuth 1.0a 3단계(요청 토큰 → 사용자 인가 → 접근 토큰 교환). 폴리오 oauth1.js를 옮겼다.
// 시간과 무작위 값을 주입할 수 있게 해서 고정 입력으로 서명을 대조할 수 있다.
// 참고: https://www.zotero.org/support/dev/web_api/v3/oauth
import { createHmac, randomBytes } from 'node:crypto';

export interface OAuthEndpoints {
	requestUrl: string;
	authorizeUrl: string;
	accessUrl: string;
}

export interface OAuthRuntime {
	now?: () => number; // 밀리초
	nonce?: () => string;
	fetch?: typeof fetch;
}

export function oauthEndpoints(baseUrl = 'https://www.zotero.org'): OAuthEndpoints {
	const base = baseUrl.replace(/\/+$/, '');
	return {
		requestUrl: `${base}/oauth/request`,
		authorizeUrl: `${base}/oauth/authorize`,
		accessUrl: `${base}/oauth/access`
	};
}

function percentEncode(str: string): string {
	return encodeURIComponent(str).replace(
		/[!*'()]/g,
		(c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
	);
}

function signatureBaseString(method: string, url: string, params: Record<string, string>): string {
	const normalized = Object.keys(params)
		.sort()
		.map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
		.join('&');
	return `${method}&${percentEncode(url)}&${percentEncode(normalized)}`;
}

export function sign(
	method: string,
	url: string,
	params: Record<string, string>,
	consumerSecret: string,
	tokenSecret = ''
): string {
	const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
	return createHmac('sha1', signingKey).update(signatureBaseString(method, url, params)).digest('base64');
}

function authHeader(params: Record<string, string>): string {
	return (
		'OAuth ' +
		Object.keys(params)
			.sort()
			.map((key) => `${percentEncode(key)}="${percentEncode(params[key])}"`)
			.join(', ')
	);
}

function baseOauthParams(consumerKey: string, rt: OAuthRuntime): Record<string, string> {
	return {
		oauth_consumer_key: consumerKey,
		oauth_nonce: (rt.nonce ?? (() => randomBytes(16).toString('hex')))(),
		oauth_signature_method: 'HMAC-SHA1',
		oauth_timestamp: String(Math.floor((rt.now ?? Date.now)() / 1000)),
		oauth_version: '1.0'
	};
}

// 응답 원문과 키는 오류 메시지에 넣지 않는다.
export class ZoteroOAuthError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'ZoteroOAuthError';
	}
}

async function signedPost(
	url: string,
	params: Record<string, string>,
	consumerSecret: string,
	tokenSecret: string | undefined,
	rt: OAuthRuntime
): Promise<Record<string, string>> {
	const signature = sign('POST', url, params, consumerSecret, tokenSecret);
	const res = await (rt.fetch ?? fetch)(url, {
		method: 'POST',
		headers: { Authorization: authHeader({ ...params, oauth_signature: signature }) }
	});
	const text = await res.text();
	if (!res.ok) throw new ZoteroOAuthError(res.status, `Zotero OAuth 요청 실패: ${res.status}`);
	return Object.fromEntries(new URLSearchParams(text));
}

interface Consumer {
	consumerKey: string;
	consumerSecret: string;
}

// 1단계: 요청 토큰.
export async function getRequestToken(
	{ consumerKey, consumerSecret, callbackUrl }: Consumer & { callbackUrl: string },
	endpoints: OAuthEndpoints,
	rt: OAuthRuntime = {}
): Promise<{ oauthToken: string; oauthTokenSecret: string }> {
	const params = { ...baseOauthParams(consumerKey, rt), oauth_callback: callbackUrl };
	const result = await signedPost(endpoints.requestUrl, params, consumerSecret, undefined, rt);
	return { oauthToken: result.oauth_token, oauthTokenSecret: result.oauth_token_secret };
}

// 2단계: 사용자를 보낼 인가 주소.
export function buildAuthorizeUrl(
	{ oauthToken, appName }: { oauthToken: string; appName: string },
	endpoints: OAuthEndpoints
): string {
	const qs = new URLSearchParams({
		oauth_token: oauthToken,
		library_access: '1',
		notes_access: '1',
		write_access: '1',
		name: appName
	});
	return `${endpoints.authorizeUrl}?${qs}`;
}

// 3단계: 요청 토큰 + verifier를 접근 토큰으로 교환. 문서에 따라 oauthTokenSecret이 Zotero API 키다.
export async function getAccessToken(
	{
		consumerKey,
		consumerSecret,
		oauthToken,
		oauthTokenSecret,
		oauthVerifier
	}: Consumer & { oauthToken: string; oauthTokenSecret: string; oauthVerifier: string },
	endpoints: OAuthEndpoints,
	rt: OAuthRuntime = {}
): Promise<{ oauthToken: string; oauthTokenSecret: string; userId: string; username: string }> {
	const params = {
		...baseOauthParams(consumerKey, rt),
		oauth_token: oauthToken,
		oauth_verifier: oauthVerifier
	};
	const result = await signedPost(endpoints.accessUrl, params, consumerSecret, oauthTokenSecret, rt);
	return {
		oauthToken: result.oauth_token,
		oauthTokenSecret: result.oauth_token_secret,
		userId: result.userID,
		username: result.username
	};
}

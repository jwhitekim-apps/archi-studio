import { describe, expect, it } from 'vitest';
import { buildAuthorizeUrl, getAccessToken, getRequestToken, oauthEndpoints } from './oauth1';

// 기대값은 폴리오 server/oauth1.js를 같은 고정 입력(시간 1700000000000, nonce 16바이트 0xab)으로 돌려 얻었다.
const endpoints = oauthEndpoints();
const fixed = { now: () => 1700000000000, nonce: () => 'ab'.repeat(16) };

function capture() {
	const calls: { url: string; auth: string }[] = [];
	const fetchStub = (async (url: string, init: RequestInit) => {
		calls.push({ url, auth: (init.headers as Record<string, string>).Authorization });
		return new Response('oauth_token=T&oauth_token_secret=S&userID=42&username=kim');
	}) as unknown as typeof fetch;
	return { calls, rt: { ...fixed, fetch: fetchStub } };
}

describe('zotero oauth1', () => {
	it('요청 토큰 서명이 폴리오와 같다', async () => {
		const { calls, rt } = capture();
		const out = await getRequestToken(
			{ consumerKey: 'ck', consumerSecret: 'cs', callbackUrl: 'https://app.example/api/zotero/callback' },
			endpoints,
			rt
		);
		expect(out).toEqual({ oauthToken: 'T', oauthTokenSecret: 'S' });
		expect(calls[0].url).toBe('https://www.zotero.org/oauth/request');
		expect(calls[0].auth).toBe(
			'OAuth oauth_callback="https%3A%2F%2Fapp.example%2Fapi%2Fzotero%2Fcallback", oauth_consumer_key="ck", oauth_nonce="abababababababababababababababab", oauth_signature="C41OAQW8UEljnD%2BQ%2BjSJs6HZsVs%3D", oauth_signature_method="HMAC-SHA1", oauth_timestamp="1700000000", oauth_version="1.0"'
		);
	});

	it('접근 토큰 교환 서명이 폴리오와 같다', async () => {
		const { calls, rt } = capture();
		const out = await getAccessToken(
			{ consumerKey: 'ck', consumerSecret: 'cs', oauthToken: 'rt', oauthTokenSecret: 'rts', oauthVerifier: 'ver' },
			endpoints,
			rt
		);
		expect(out).toEqual({ oauthToken: 'T', oauthTokenSecret: 'S', userId: '42', username: 'kim' });
		expect(calls[0].url).toBe('https://www.zotero.org/oauth/access');
		expect(calls[0].auth).toBe(
			'OAuth oauth_consumer_key="ck", oauth_nonce="abababababababababababababababab", oauth_signature="mMvLc6rMxvPrcXA9Uwzhrj8cZfo%3D", oauth_signature_method="HMAC-SHA1", oauth_timestamp="1700000000", oauth_token="rt", oauth_verifier="ver", oauth_version="1.0"'
		);
	});

	it('인가 주소가 폴리오와 같은 형식이다', () => {
		expect(buildAuthorizeUrl({ oauthToken: 'rt', appName: 'Archi Studio' }, endpoints)).toBe(
			'https://www.zotero.org/oauth/authorize?oauth_token=rt&library_access=1&notes_access=1&write_access=1&name=Archi+Studio'
		);
	});

	it('응답이 실패하면 응답 원문 없이 오류를 낸다', async () => {
		const rt = { ...fixed, fetch: (async () => new Response('secret-body', { status: 401 })) as unknown as typeof fetch };
		await expect(
			getRequestToken({ consumerKey: 'ck', consumerSecret: 'cs', callbackUrl: 'x' }, endpoints, rt)
		).rejects.toThrow(/401/);
		await getRequestToken({ consumerKey: 'ck', consumerSecret: 'cs', callbackUrl: 'x' }, endpoints, rt).catch(
			(e) => expect(String(e.message)).not.toContain('secret-body')
		);
	});
});

// archi_session 쿠키 값(접근 토큰과 갱신 토큰 한 쌍)의 인코딩, 디코딩과 쿠키 속성.
export interface SessionTokens {
	accessToken: string;
	refreshToken: string;
}

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

// 추가 의존성 없이 표준 btoa/atob로 UTF-8 문자열을 base64url로 바꾼다.
const toBase64Url = (s: string): string => {
	const bytes = new TextEncoder().encode(s);
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (v: string): string => {
	const bin = atob(v.replace(/-/g, '+').replace(/_/g, '/'));
	return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

export function encodeSessionTokens(tokens: SessionTokens): string {
	return toBase64Url(JSON.stringify({ a: tokens.accessToken, r: tokens.refreshToken }));
}

// 깨진 값, 빈 값, 한쪽 토큰이 없는 값은 null.
export function decodeSessionTokens(value: string | undefined | null): SessionTokens | null {
	if (!value) return null;
	try {
		const parsed: unknown = JSON.parse(fromBase64Url(value));
		if (typeof parsed !== 'object' || parsed === null) return null;
		const { a, r } = parsed as { a?: unknown; r?: unknown };
		if (typeof a !== 'string' || a === '' || typeof r !== 'string' || r === '') return null;
		return { accessToken: a, refreshToken: r };
	} catch {
		return null;
	}
}

export interface SessionCookieOptions {
	path: '/';
	httpOnly: true;
	sameSite: 'lax';
	secure: boolean;
	maxAge: number;
}

// https일 때만 Secure. 로컬 http 개발에서도 쿠키가 저장되게 명시한다.
export function sessionCookieOptions(url: URL): SessionCookieOptions {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: url.protocol === 'https:',
		maxAge: SESSION_MAX_AGE_SECONDS
	};
}

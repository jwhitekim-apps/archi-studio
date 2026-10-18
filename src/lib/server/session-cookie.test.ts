import { describe, expect, it } from 'vitest';
import {
	SESSION_MAX_AGE_SECONDS,
	decodeSessionTokens,
	encodeSessionTokens,
	sessionCookieOptions
} from './session-cookie';

const b64 = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const tokens = { accessToken: 'a.b.c', refreshToken: 'refresh-1' };

describe('2.2 세션 쿠키 값', () => {
	it('정상: 인코딩한 값을 그대로 디코딩한다', () => {
		expect(decodeSessionTokens(encodeSessionTokens(tokens))).toEqual(tokens);
	});

	it('쿠키에 안전한 문자만 쓴다', () => {
		expect(encodeSessionTokens(tokens)).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	it('빈 값, undefined, null은 null', () => {
		expect(decodeSessionTokens('')).toBeNull();
		expect(decodeSessionTokens(undefined)).toBeNull();
		expect(decodeSessionTokens(null)).toBeNull();
	});

	it('깨진 값은 null', () => {
		expect(decodeSessionTokens('%%%not-base64%%%')).toBeNull();
		expect(decodeSessionTokens(b64('not json'))).toBeNull();
		expect(decodeSessionTokens(b64('"str"'))).toBeNull();
		expect(decodeSessionTokens(b64('null'))).toBeNull();
	});

	it('한쪽 토큰이 없거나 비어 있거나 문자열이 아니면 null', () => {
		const enc = (o: unknown) => b64(JSON.stringify(o));
		expect(decodeSessionTokens(enc({ a: 'x' }))).toBeNull();
		expect(decodeSessionTokens(enc({ r: 'x' }))).toBeNull();
		expect(decodeSessionTokens(enc({ a: '', r: 'x' }))).toBeNull();
		expect(decodeSessionTokens(enc({ a: 'x', r: '' }))).toBeNull();
		expect(decodeSessionTokens(enc({ a: 1, r: 'x' }))).toBeNull();
	});
});

describe('2.2 세션 쿠키 속성', () => {
	it('httpOnly, SameSite=Lax, 30일, path=/', () => {
		const o = sessionCookieOptions(new URL('http://localhost/api/x'));
		expect(o).toMatchObject({ path: '/', httpOnly: true, sameSite: 'lax' });
		expect(o.maxAge).toBe(SESSION_MAX_AGE_SECONDS);
		expect(SESSION_MAX_AGE_SECONDS).toBe(2592000);
	});

	it('https일 때만 Secure', () => {
		expect(sessionCookieOptions(new URL('https://archi.example/api/x')).secure).toBe(true);
		expect(sessionCookieOptions(new URL('http://localhost/api/x')).secure).toBe(false);
	});
});

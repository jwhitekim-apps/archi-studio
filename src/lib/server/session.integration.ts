// 로컬 Supabase(npm run db:start)가 떠 있어야 하는 통합 테스트. 실행: npm run test:auth
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSessionVerifier } from './session';
import { supabaseClientOptions as options } from './supabase-options';
import { decodeSessionTokens, encodeSessionTokens } from './session-cookie';

const env = import.meta.env;
const url: string = env.SUPABASE_URL;
const anonKey: string = env.SUPABASE_ANON_KEY;
const serviceKey: string = env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret: string = env.SUPABASE_JWT_SECRET;

const anon = (): SupabaseClient => createClient(url, anonKey, options);
const admin = createClient(url, serviceKey, options);
const verify = createSessionVerifier(anon);

const email = `session-it-${Date.now()}@example.test`;
const password = 'password-ok-1';
let userId = '';

const b64url = (bytes: Uint8Array) => {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const text = (s: string) => b64url(new TextEncoder().encode(s));

// 진짜 접근 토큰의 exp만 과거로 바꿔 같은 키로 다시 서명한다(세션 ID 등은 그대로라 "만료된 정상 토큰"이 된다).
async function expire(accessToken: string): Promise<string> {
	const [h, p] = accessToken.split('.');
	const payload = JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/')));
	payload.exp = Math.floor(Date.now() / 1000) - 60;
	const head = h;
	const body = text(JSON.stringify(payload));
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(jwtSecret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${head}.${body}`)));
	return `${head}.${body}.${b64url(sig)}`;
}

async function newSession(): Promise<Session> {
	const { data, error } = await anon().auth.signInWithPassword({ email, password });
	if (error || !data.session) throw error ?? new Error('세션 없음');
	return data.session;
}

beforeAll(async () => {
	const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
	if (error || !data.user) throw error ?? new Error('테스트 계정 생성 실패');
	userId = data.user.id;
});

afterAll(async () => {
	if (userId) await admin.auth.admin.deleteUser(userId);
});

describe('2.3 verifySession (로컬 Supabase)', () => {
	it('유효 세션: 사용자를 돌려주고 갱신하지 않는다', async () => {
		const s = await newSession();
		const r = await verify(encodeSessionTokens({ accessToken: s.access_token, refreshToken: s.refresh_token }));
		expect(r).toEqual({ user: { id: userId } });
	});

	it('만료된 접근 토큰: 갱신해서 새 쿠키 값을 돌려주고, 새 값은 그대로 유효하다', async () => {
		const s = await newSession();
		const expired = await expire(s.access_token);
		const r = await verify(encodeSessionTokens({ accessToken: expired, refreshToken: s.refresh_token }));
		expect(r?.user.id).toBe(userId);
		expect(r?.renewedToken).toBeTruthy();
		const renewed = decodeSessionTokens(r?.renewedToken);
		expect(renewed).not.toBeNull();
		expect(renewed?.accessToken).not.toBe(expired);
		expect(renewed?.refreshToken).not.toBe(s.refresh_token);
		// 새 쿠키 값으로 다시 확인하면 갱신 없이 통과한다.
		expect(await verify(r!.renewedToken!)).toEqual({ user: { id: userId } });
	});

	it('위조 값은 null', async () => {
		expect(await verify(encodeSessionTokens({ accessToken: 'forged', refreshToken: 'forged' }))).toBeNull();
		expect(await verify('이건-쿠키-형식이-아니다')).toBeNull();
		expect(await verify('')).toBeNull();
	});

	it('갱신 토큰도 만료(폐기)되면 null', async () => {
		const s = await newSession();
		const expired = await expire(s.access_token);
		await admin.auth.admin.signOut(s.access_token, 'global');
		const r = await verify(encodeSessionTokens({ accessToken: expired, refreshToken: s.refresh_token }));
		expect(r).toBeNull();
	});

	it('같은 쿠키로 동시에 갱신 두 건을 보내도 모두 성공한다', async () => {
		const s = await newSession();
		const value = encodeSessionTokens({
			accessToken: await expire(s.access_token),
			refreshToken: s.refresh_token
		});
		const [a, b] = await Promise.all([verify(value), verify(value)]);
		expect(a?.user.id).toBe(userId);
		expect(b?.user.id).toBe(userId);
		expect(a?.renewedToken).toBeTruthy();
		expect(b?.renewedToken).toBeTruthy();
	});
});

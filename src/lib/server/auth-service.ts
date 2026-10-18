// 가입, 로그인, 로그아웃, 현재 사용자 조회. 라우트는 요청과 쿠키만 다루고 나머지는 여기서 한다.
import { AuthApiError, type SupabaseClient } from '@supabase/supabase-js';
import { errorResponse } from './errors';
import { createLoginAttempts } from './login-attempts';
import type { SessionTokens } from './session-cookie';

export interface AuthDeps {
	// 사용자 로그인에 쓰는 anon 클라이언트(요청마다 새로 만든다).
	anon: () => SupabaseClient;
	// 계정 생성, 승인 행, 로그인 기록에 쓰는 service role 클라이언트.
	admin: SupabaseClient;
	// 테스트에서 승인 행 삽입 실패를 만들기 위한 교체 지점. 기본은 archi_profiles에 approved=false를 넣는다.
	insertProfile?: (userId: string) => Promise<{ error: unknown }>;
}

export interface Credentials {
	email: string;
	password: string;
}

export const SIGNUP_MIN_PASSWORD_LENGTH = 8;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const jsonResponse = (status: number, body: unknown): Response =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const invalidRequest = (): Response =>
	errorResponse(400, 'invalid_request', '요청 형식이 올바르지 않습니다.');

// 본문이 JSON이 아니면 null.
export async function readJson(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return null;
	}
}

// 필드 누락, 형식 오류는 null. 가입은 비밀번호 최소 길이를 함께 확인한다.
export function parseCredentials(body: unknown, minPasswordLength = 1): Credentials | null {
	if (typeof body !== 'object' || body === null) return null;
	const { email, password } = body as Record<string, unknown>;
	if (typeof email !== 'string' || typeof password !== 'string') return null;
	const trimmed = email.trim();
	if (!EMAIL_PATTERN.test(trimmed) || password.length < minPasswordLength) return null;
	return { email: trimmed, password };
}

const isAuthError = (error: unknown): error is AuthApiError => error instanceof AuthApiError;

export async function signup(deps: AuthDeps, { email, password }: Credentials): Promise<Response> {
	const { data, error } = await deps.admin.auth.admin.createUser({
		email,
		password,
		email_confirm: true
	});
	if (error) {
		if (isAuthError(error)) {
			if (error.code === 'email_exists' || error.code === 'user_already_exists') {
				return errorResponse(409, 'email_taken', '이미 가입된 이메일입니다.');
			}
			if (error.code === 'weak_password' || error.code === 'validation_failed') return invalidRequest();
		}
		throw error;
	}

	// 승인 행을 못 만들면 방금 만든 계정을 지워 반쪽 상태를 남기지 않는다.
	const insertProfile =
		deps.insertProfile ??
		((userId: string) => deps.admin.from('archi_profiles').insert({ user_id: userId, approved: false }));
	const profile = await insertProfile(data.user.id);
	if (profile.error) {
		await deps.admin.auth.admin.deleteUser(data.user.id);
		throw profile.error;
	}
	return jsonResponse(201, { status: 'pending_approval' });
}

async function zoteroConnected(admin: SupabaseClient, userId: string): Promise<boolean> {
	const { data, error } = await admin
		.from('folio_users')
		.select('zotero_api_key')
		.eq('id', userId)
		.maybeSingle();
	if (error) throw error;
	return Boolean(data?.zotero_api_key);
}

export interface LoginResult {
	response: Response;
	// 로그인 성공일 때만 있다. 라우트가 이 값으로 세션 쿠키를 설정한다.
	tokens?: SessionTokens;
}

// 순서: 시도 예약(제한 확인), 자격 증명, 승인 확인.
// 예약은 실패한 로그인에서만 유지된다(실패로 센다). 성공, 미승인 403, 예외에서는 지운다.
export async function login(deps: AuthDeps, { email, password }: Credentials, ip: string): Promise<LoginResult> {
	const attempts = createLoginAttempts(deps.admin);
	const reservation = await attempts.reserve(ip);
	if (reservation === null) {
		return {
			response: errorResponse(429, 'too_many_attempts', '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.')
		};
	}

	let failed = false;
	try {
		const { data, error } = await deps.anon().auth.signInWithPassword({ email, password });
		if (error) {
			// 이메일이 없는 경우와 비밀번호가 틀린 경우를 구분하지 않는다.
			if (isAuthError(error) && (error.code === 'invalid_credentials' || error.status === 400)) {
				failed = true;
				return { response: errorResponse(401, 'invalid_credentials', '이메일 또는 비밀번호가 올바르지 않습니다.') };
			}
			throw error;
		}

		const { data: profile, error: profileError } = await deps.admin
			.from('archi_profiles')
			.select('approved')
			.eq('user_id', data.user.id)
			.maybeSingle();
		if (profileError) throw profileError;
		if (!profile?.approved) {
			// 방금 만든 Supabase 세션을 바로 폐기한다. 쿠키는 설정하지 않고, 실패 횟수에도 넣지 않는다.
			const revoked = await deps.admin.auth.admin.signOut(data.session.access_token, 'local');
			if (revoked.error) throw revoked.error;
			return { response: errorResponse(403, 'pending_approval', '관리자 승인을 기다리는 계정입니다.') };
		}

		return {
			response: jsonResponse(200, {
				id: data.user.id,
				email: data.user.email,
				zoteroConnected: await zoteroConnected(deps.admin, data.user.id)
			}),
			tokens: { accessToken: data.session.access_token, refreshToken: data.session.refresh_token }
		};
	} finally {
		if (!failed) {
			// 지우지 못하면 이 시도가 실패로 남아 제한 쪽(닫히는 쪽)으로 기운다. 로그인 결과는 바꾸지 않는다.
			await attempts.release(reservation).catch((err) => {
				console.error('[auth] release login attempt failed', err instanceof Error ? err.name : 'unknown');
			});
		}
	}
}

// 현재 세션을 Supabase에서 끊는다. 쿠키 삭제는 라우트가 한다.
export async function logout(deps: AuthDeps, accessToken: string): Promise<void> {
	const { error } = await deps.admin.auth.admin.signOut(accessToken, 'local');
	if (error) throw error;
}

export async function me(deps: AuthDeps, userId: string): Promise<Response> {
	const { data, error } = await deps.admin.auth.admin.getUserById(userId);
	if (error) throw error;
	return jsonResponse(200, {
		id: data.user.id,
		email: data.user.email,
		zoteroConnected: await zoteroConnected(deps.admin, userId)
	});
}

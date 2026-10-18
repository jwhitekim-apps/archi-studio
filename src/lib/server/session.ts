// 세션 쿠키로 사용자를 식별하는 부분.
import { isAuthError, type SupabaseClient } from '@supabase/supabase-js';
import { decodeSessionTokens, encodeSessionTokens } from './session-cookie';
import { createAnonClient } from './supabase';

export const SESSION_COOKIE = 'archi_session';

export interface SessionUser {
	id: string;
}

export interface SessionResult {
	user: SessionUser;
	// 접근 토큰이 만료돼 갱신했을 때만 있다. 가드가 같은 이름의 쿠키로 다시 설정한다.
	renewedToken?: string;
}

// 쿠키 값으로 사용자를 찾는다. 없거나 만료, 위조면 null. 서버 문제는 throw.
export type SessionVerifier = (token: string) => Promise<SessionResult | null>;

// 인증이 거부된 경우(만료, 위조, 폐기)는 null, 서버·네트워크 문제는 throw.
// 폐기된 세션은 AuthApiError가 아니라 AuthSessionMissingError(상태 400)로 오므로 AuthError 전체의 4xx를 본다.
function isRejection(error: unknown): boolean {
	return isAuthError(error) && (error.status ?? 0) >= 400 && (error.status ?? 0) < 500;
}

export function createSessionVerifier(createClient: () => SupabaseClient): SessionVerifier {
	return async (value) => {
		const tokens = decodeSessionTokens(value);
		if (!tokens) return null;
		const client = createClient();

		const { data, error } = await client.auth.getUser(tokens.accessToken);
		if (!error && data.user) return { user: { id: data.user.id } };
		if (error && !isRejection(error)) throw error;

		// 접근 토큰이 만료됐거나 거부됐다. 갱신 토큰으로 한 번만 갱신한다.
		const refreshed = await client.auth.refreshSession({ refresh_token: tokens.refreshToken });
		if (refreshed.error) {
			if (isRejection(refreshed.error)) return null;
			throw refreshed.error;
		}
		const session = refreshed.data.session;
		if (!session || !refreshed.data.user) return null;
		return {
			user: { id: refreshed.data.user.id },
			renewedToken: encodeSessionTokens({
				accessToken: session.access_token,
				refreshToken: session.refresh_token
			})
		};
	};
}

export const verifySession: SessionVerifier = createSessionVerifier(createAnonClient);

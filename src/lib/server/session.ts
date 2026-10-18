// 세션 쿠키로 사용자를 식별하는 부분.
import { isAuthError, type SupabaseClient } from '@supabase/supabase-js';
import { decodeSessionTokens, encodeSessionTokens } from './session-cookie';
import { createAnonClient, createServiceClient } from './supabase';

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

// 사용자가 승인됐는지. 조회 오류는 throw해서 인증 거부(401)가 아니라 서버 오류(500)가 되게 한다(실패하면 닫힌다).
export type ApprovalCheck = (userId: string) => Promise<boolean>;

// archi_profiles.approved를 service role로 조회한다. 행이 없으면 미승인이다.
export const isUserApproved: ApprovalCheck = async (userId) => {
	const { data, error } = await createServiceClient()
		.from('archi_profiles')
		.select('approved')
		.eq('user_id', userId)
		.maybeSingle();
	if (error) throw error;
	return data?.approved === true;
};

// 세션 쿠키의 토큰이 유효해도 승인된 사용자일 때만 인정한다. 로그인 함수의 승인 확인만으로는 Supabase에서 직접 받은
// 토큰을 막을 수 없고, 승인을 취소해도 이미 발급된 세션이 남기 때문에 요청마다 확인한다.
export function createSessionVerifier(
	createClient: () => SupabaseClient,
	isApproved: ApprovalCheck
): SessionVerifier {
	return async (value) => {
		const tokens = decodeSessionTokens(value);
		if (!tokens) return null;
		const client = createClient();

		const { data, error } = await client.auth.getUser(tokens.accessToken);
		if (!error && data.user) {
			if (!(await isApproved(data.user.id))) return null;
			return { user: { id: data.user.id } };
		}
		if (error && !isRejection(error)) throw error;

		// 접근 토큰이 만료됐거나 거부됐다. 갱신 토큰으로 한 번만 갱신한다.
		const refreshed = await client.auth.refreshSession({ refresh_token: tokens.refreshToken });
		if (refreshed.error) {
			if (isRejection(refreshed.error)) return null;
			throw refreshed.error;
		}
		const session = refreshed.data.session;
		if (!session || !refreshed.data.user) return null;
		if (!(await isApproved(refreshed.data.user.id))) return null;
		return {
			user: { id: refreshed.data.user.id },
			renewedToken: encodeSessionTokens({
				accessToken: session.access_token,
				refreshToken: session.refresh_token
			})
		};
	};
}

export const verifySession: SessionVerifier = createSessionVerifier(createAnonClient, isUserApproved);

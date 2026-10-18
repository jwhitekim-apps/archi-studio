// 세션 쿠키로 사용자를 식별하는 부분. 실제 검증(Supabase Auth)은 auth change에서 채운다.
export const SESSION_COOKIE = 'archi_session';

export interface SessionUser {
	id: string;
}

// 쿠키 값으로 사용자를 찾는다. 없거나 만료, 위조면 null. 서버 문제는 throw.
export type SessionVerifier = (token: string) => Promise<SessionUser | null>;

// 아직 세션 발급 경로가 없어서 모든 쿠키를 무효로 본다.
export const verifySession: SessionVerifier = async () => null;

// 로그인 실패 기록. 서버 재시작 후에도 제한이 유지되도록 메모리가 아니라 DB(archi_login_attempts)에 둔다.
import type { SupabaseClient } from '@supabase/supabase-js';

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_FAILURES = 5;
export const ATTEMPT_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface LoginAttempts {
	// 이 IP의 최근 15분 실패가 5번 이상이면 true.
	isLimited(ip: string): Promise<boolean>;
	// 실패를 기록하고, 24시간 지난 행은 같이 지운다(별도 정리 작업 없음).
	recordFailure(ip: string): Promise<void>;
}

export function createLoginAttempts(admin: SupabaseClient): LoginAttempts {
	return {
		async isLimited(ip) {
			const since = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
			const { count, error } = await admin
				.from('archi_login_attempts')
				.select('id', { count: 'exact', head: true })
				.eq('ip', ip)
				.gte('attempted_at', since);
			if (error) throw error;
			return (count ?? 0) >= LOGIN_MAX_FAILURES;
		},
		async recordFailure(ip) {
			const inserted = await admin.from('archi_login_attempts').insert({ ip });
			if (inserted.error) throw inserted.error;
			const cutoff = new Date(Date.now() - ATTEMPT_RETENTION_MS).toISOString();
			const deleted = await admin.from('archi_login_attempts').delete().lt('attempted_at', cutoff);
			if (deleted.error) throw deleted.error;
		}
	};
}

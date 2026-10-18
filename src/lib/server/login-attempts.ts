// 로그인 시도 제한. 서버 재시작 후에도, 병렬 요청에서도 유지되도록 메모리가 아니라 DB(archi_login_attempts)에서
// 한 번에 판정한다. 판정과 기록을 나누면 동시에 온 요청들이 같은 실패 횟수를 보고 모두 통과한다.
import type { SupabaseClient } from '@supabase/supabase-js';

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_FAILURES = 5;
export const ATTEMPT_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface LoginAttempts {
	// 이 IP의 자리를 하나 예약한다. 창(15분) 안의 시도(예약 포함)가 5번 이상이면 null(제한).
	// 24시간 지난 행은 같은 호출에서 지운다(별도 정리 작업 없음).
	reserve(ip: string): Promise<number | null>;
	// 예약을 지운다. 로그인 성공, 미승인 403, 예기치 못한 예외에서 부른다. 실패한 로그인은 부르지 않는다.
	release(id: number): Promise<void>;
	// 이 IP의 최근 15분 시도가 5번 이상이면 true(읽기 전용).
	isLimited(ip: string): Promise<boolean>;
}

export function createLoginAttempts(admin: SupabaseClient): LoginAttempts {
	return {
		async reserve(ip) {
			const { data, error } = await admin.rpc('archi_reserve_login_attempt', {
				p_ip: ip,
				p_max: LOGIN_MAX_FAILURES,
				p_window_seconds: LOGIN_WINDOW_MS / 1000
			});
			if (error) throw error;
			return data === null ? null : Number(data);
		},
		async release(id) {
			const { error } = await admin.rpc('archi_release_login_attempt', { p_id: id });
			if (error) throw error;
		},
		async isLimited(ip) {
			const since = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
			const { count, error } = await admin
				.from('archi_login_attempts')
				.select('id', { count: 'exact', head: true })
				.eq('ip', ip)
				.gte('attempted_at', since);
			if (error) throw error;
			return (count ?? 0) >= LOGIN_MAX_FAILURES;
		}
	};
}

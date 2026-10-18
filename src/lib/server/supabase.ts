// 서버 전용 Supabase 클라이언트. 키는 서버 환경 변수로만 읽고 클라이언트 번들에 들어가지 않는다.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { supabaseClientOptions } from './supabase-options';

function required(name: 'SUPABASE_URL' | 'SUPABASE_ANON_KEY' | 'SUPABASE_SERVICE_ROLE_KEY'): string {
	const value = env[name];
	if (!value) throw new Error(`환경 변수 ${name}가 설정되지 않았습니다.`);
	return value;
}

// 사용자 로그인과 토큰 확인에 쓴다(anon 키).
export function createAnonClient(): SupabaseClient {
	return createClient(required('SUPABASE_URL'), required('SUPABASE_ANON_KEY'), supabaseClientOptions);
}

// 계정 생성, 승인 행 쓰기 같은 서버 권한 작업에만 쓴다(service role 키).
export function createServiceClient(): SupabaseClient {
	return createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), supabaseClientOptions);
}

import type { AuthDeps } from './auth-service';
import { createAnonClient, createServiceClient } from './supabase';

// 요청마다 새로 만든다(세션을 클라이언트 안에 저장하지 않는 설정).
export const authDeps = (): AuthDeps => ({ anon: createAnonClient, admin: createServiceClient() });

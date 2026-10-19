// Zotero 연결의 저장, 해제, 상태 조회. 키는 저장 전에 암호화하고 어떤 반환값에도 평문으로 싣지 않는다.
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptSecret, encryptSecret } from './crypto';

export const OAUTH_COOKIE = 'archi_zotero_oauth';
export const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;
export const OAUTH_COOKIE_PATH = '/api/zotero';

// 연결이 끝난 뒤 이동할 곳. 두 화면은 archi-studio-ui-auth-library가 만든다.
export const REDIRECTS = {
	success: '/library',
	denied: '/settings?zotero=denied',
	error: '/settings?zotero=error',
	inUse: '/settings?zotero=in_use'
} as const;

export interface PendingOAuth {
	token: string;
	secret: string;
}

// request token secret은 쿠키에 평문으로 두지 않는다.
export function encodePending(pending: PendingOAuth, encryptionSecret: string | undefined): string {
	return encryptSecret(JSON.stringify(pending), encryptionSecret);
}

export function decodePending(value: string | undefined, encryptionSecret: string | undefined): PendingOAuth | null {
	if (!value) return null;
	try {
		const parsed: unknown = JSON.parse(decryptSecret(value, encryptionSecret));
		if (typeof parsed !== 'object' || parsed === null) return null;
		const { token, secret } = parsed as Partial<PendingOAuth>;
		return typeof token === 'string' && typeof secret === 'string' ? { token, secret } : null;
	} catch {
		return null;
	}
}

export interface SaveConnectionInput {
	zoteroUserId: string;
	username: string;
	apiKey: string;
	encryptionSecret: string | undefined;
}

// 같은 Zotero 계정을 이미 다른 사용자가 연결했으면 'in_use'.
export async function saveConnection(
	admin: SupabaseClient,
	userId: string,
	input: SaveConnectionInput
): Promise<'saved' | 'in_use'> {
	const existing = await admin
		.from('folio_users')
		.select('zotero_user_id')
		.eq('id', userId)
		.maybeSingle();
	if (existing.error) throw existing.error;

	const saved = await admin.from('folio_users').upsert(
		{
			id: userId,
			zotero_user_id: input.zoteroUserId,
			zotero_username: input.username,
			zotero_api_key: encryptSecret(input.apiKey, input.encryptionSecret)
		},
		{ onConflict: 'id' }
	);
	if (saved.error) {
		if (saved.error.code === '23505') return 'in_use';
		throw saved.error;
	}

	// 다른 Zotero 계정으로 바꿨으면 다음 동기화가 전체가 되게 한다. 옛 계정에서 가져온 논문은 지우지 않는다.
	const previous = existing.data?.zotero_user_id;
	if (previous && previous !== input.zoteroUserId) {
		const cleared = await admin
			.from('folio_sync_state')
			.delete()
			.eq('user_id', userId)
			.in('key', ['lastVersion', 'failedItemKeys']);
		if (cleared.error) throw cleared.error;
	}
	return 'saved';
}

// 키만 비운다. 행을 지우면 folio_papers가 연쇄로 사라지므로 행과 논문 목록은 남긴다.
export async function clearConnection(admin: SupabaseClient, userId: string): Promise<void> {
	const { error } = await admin.from('folio_users').update({ zotero_api_key: null }).eq('id', userId);
	if (error) throw error;
}

export interface ConnectionStatus {
	connected: boolean;
	zoteroUsername?: string;
	lastSyncedAt?: string | null;
}

export async function getStatus(admin: SupabaseClient, userId: string): Promise<ConnectionStatus> {
	const row = await admin
		.from('folio_users')
		.select('zotero_username, zotero_api_key')
		.eq('id', userId)
		.maybeSingle();
	if (row.error) throw row.error;
	if (!row.data?.zotero_api_key) return { connected: false };

	const state = await admin
		.from('folio_sync_state')
		.select('value')
		.eq('user_id', userId)
		.eq('key', 'lastSyncedAt')
		.maybeSingle();
	if (state.error) throw state.error;
	return {
		connected: true,
		zoteroUsername: row.data.zotero_username,
		lastSyncedAt: state.data?.value ?? null
	};
}

export interface Credentials {
	zoteroUserId: string;
	apiKey: string;
}

// 복호화는 동기화 호출 직전 이곳에서만 한다. 연결하지 않았으면 null.
export async function getCredentials(
	admin: SupabaseClient,
	userId: string,
	encryptionSecret: string | undefined
): Promise<Credentials | null> {
	const row = await admin
		.from('folio_users')
		.select('zotero_user_id, zotero_api_key')
		.eq('id', userId)
		.maybeSingle();
	if (row.error) throw row.error;
	if (!row.data?.zotero_api_key || !row.data.zotero_user_id) return null;
	return {
		zoteroUserId: row.data.zotero_user_id,
		apiKey: decryptSecret(row.data.zotero_api_key, encryptionSecret)
	};
}

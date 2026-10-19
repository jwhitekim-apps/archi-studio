// Zotero 연결 설정 읽기. 값은 서버 환경 변수에서만 읽고 클라이언트 번들에 들어가지 않는다.
import { env } from '$env/dynamic/private';
import { oauthEndpoints, type OAuthEndpoints } from './oauth1';

export interface ZoteroConfig {
	clientKey: string;
	clientSecret: string;
	appBaseUrl: string;
	encryptionSecret: string | undefined;
	apiBaseUrl: string;
	oauth: OAuthEndpoints;
}

export const DEFAULT_ZOTERO_API_BASE_URL = 'https://api.zotero.org';
export const DEFAULT_ZOTERO_OAUTH_BASE_URL = 'https://www.zotero.org';

function required(name: 'ZOTERO_CLIENT_KEY' | 'ZOTERO_CLIENT_SECRET' | 'APP_BASE_URL'): string {
	const value = env[name];
	if (!value) throw new Error(`환경 변수 ${name}가 설정되지 않았습니다.`);
	return value;
}

export function zoteroConfig(): ZoteroConfig {
	return {
		clientKey: required('ZOTERO_CLIENT_KEY'),
		clientSecret: required('ZOTERO_CLIENT_SECRET'),
		appBaseUrl: required('APP_BASE_URL').replace(/\/+$/, ''),
		encryptionSecret: env.ZOTERO_KEY_ENCRYPTION_SECRET,
		apiBaseUrl: (env.ZOTERO_API_BASE_URL || DEFAULT_ZOTERO_API_BASE_URL).replace(/\/+$/, ''),
		oauth: oauthEndpoints(env.ZOTERO_OAUTH_BASE_URL || DEFAULT_ZOTERO_OAUTH_BASE_URL)
	};
}

// 키 암호화 비밀값만 필요한 곳(동기화 등)용. 앱 키가 없어도 읽을 수 있다.
export function encryptionSecret(): string | undefined {
	return env.ZOTERO_KEY_ENCRYPTION_SECRET;
}

export function zoteroApiBaseUrl(): string {
	return (env.ZOTERO_API_BASE_URL || DEFAULT_ZOTERO_API_BASE_URL).replace(/\/+$/, '');
}

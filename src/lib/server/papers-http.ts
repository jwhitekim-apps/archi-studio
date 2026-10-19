// papers 라우트가 Zotero 쪽 실패를 응답으로 바꾸는 방법을 한 곳에 둔다.
import { createServiceClient } from './supabase';
import { errorResponse } from './errors';
import { ZoteroUnavailableError } from './zotero/client';
import { encryptionSecret, zoteroApiBaseUrl } from './zotero/config';
import { ZoteroNotConnected, type ZoteroDeps } from './papers-zotero';
import type { SsrfOptions } from './ssrf';

// 통합 시험이 가짜 웹 서버에 접속할 수 있도록 SSRF 검사의 이름 해석을 바꾸는 자리. 서비스 코드는 이 값을 설정하지 않는다.
export const testHooks: { ssrf?: SsrfOptions } = {};

export const zoteroDeps = (): ZoteroDeps => ({
	admin: createServiceClient(),
	apiBaseUrl: zoteroApiBaseUrl(),
	encryptionSecret: encryptionSecret(),
	ssrf: testHooks.ssrf
});

// 연결하지 않았으면 409, Zotero가 실패하면 502. 그 밖의 예외는 그대로 던진다.
export async function withZoteroErrors(run: () => Promise<Response>): Promise<Response> {
	try {
		return await run();
	} catch (err) {
		if (err instanceof ZoteroNotConnected) {
			return errorResponse(409, 'zotero_not_connected', 'Zotero가 연결되어 있지 않습니다.');
		}
		if (err instanceof ZoteroUnavailableError) {
			console.error('[zotero] 요청 실패', err.what, err.status ?? 'network');
			return errorResponse(502, 'zotero_unavailable', 'Zotero에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.');
		}
		throw err;
	}
}

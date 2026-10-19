import type { RequestHandler } from './$types';
import { errorResponse, standardError } from '$lib/server/errors';
import { createServiceClient } from '$lib/server/supabase';
import { ZoteroUnavailableError } from '$lib/server/zotero/client';
import { encryptionSecret, zoteroApiBaseUrl } from '$lib/server/zotero/config';
import { syncZotero, ZoteroNotConnectedError } from '$lib/server/zotero/sync';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) return standardError('unauthenticated');
	try {
		const result = await syncZotero(
			{ admin: createServiceClient(), apiBaseUrl: zoteroApiBaseUrl(), encryptionSecret: encryptionSecret() },
			locals.user.id
		);
		return Response.json(result);
	} catch (err) {
		if (err instanceof ZoteroNotConnectedError) {
			return errorResponse(409, 'zotero_not_connected', 'Zotero가 연결되어 있지 않습니다.');
		}
		if (err instanceof ZoteroUnavailableError) {
			console.error('[zotero] 동기화 실패', err.what, err.status ?? 'network');
			return errorResponse(502, 'zotero_unavailable', 'Zotero에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.');
		}
		throw err;
	}
};

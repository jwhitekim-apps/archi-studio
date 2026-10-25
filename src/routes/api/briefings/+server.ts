// 브리핑 목록. GET만 둔다(읽기 전용, 다른 메서드는 405).
import type { RequestHandler } from './$types';
import { listBriefings } from '$lib/server/briefing-service';
import { errorResponse, standardError } from '$lib/server/errors';
import { createServiceClient } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return standardError('unauthenticated');
	const result = await listBriefings(createServiceClient(), locals.user.id, {
		limit: url.searchParams.get('limit'),
		cursor: url.searchParams.get('cursor')
	});
	if (!result.ok) return errorResponse(400, result.code, result.message);
	return Response.json({ items: result.items, nextCursor: result.nextCursor });
};

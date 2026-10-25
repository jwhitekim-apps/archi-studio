// 브리핑 상세. GET만 둔다(읽기 전용, 다른 메서드는 405).
import type { RequestHandler } from './$types';
import { getBriefing } from '$lib/server/briefing-service';
import { briefingNotFound, standardError } from '$lib/server/errors';
import { createServiceClient } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return standardError('unauthenticated');
	const detail = await getBriefing(createServiceClient(), locals.user.id, params.id);
	return detail ? Response.json(detail) : briefingNotFound();
};

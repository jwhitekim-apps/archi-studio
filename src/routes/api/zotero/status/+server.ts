import type { RequestHandler } from './$types';
import { standardError } from '$lib/server/errors';
import { createServiceClient } from '$lib/server/supabase';
import { getStatus } from '$lib/server/zotero/connection';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return standardError('unauthenticated');
	return Response.json(await getStatus(createServiceClient(), locals.user.id));
};

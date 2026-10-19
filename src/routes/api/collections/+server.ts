import type { RequestHandler } from './$types';
import { standardError } from '$lib/server/errors';
import { listCollections } from '$lib/server/papers-service';
import { createServiceClient } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return standardError('unauthenticated');
	return Response.json(await listCollections(createServiceClient(), locals.user.id));
};

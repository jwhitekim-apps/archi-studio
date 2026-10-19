import type { RequestHandler } from './$types';
import { standardError } from '$lib/server/errors';
import { createServiceClient } from '$lib/server/supabase';
import { clearConnection } from '$lib/server/zotero/connection';

export const DELETE: RequestHandler = async ({ locals }) => {
	if (!locals.user) return standardError('unauthenticated');
	await clearConnection(createServiceClient(), locals.user.id);
	return new Response(null, { status: 204 });
};

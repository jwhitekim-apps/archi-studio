import type { RequestHandler } from './$types';
import { paperNotFound, standardError } from '$lib/server/errors';
import { withZoteroErrors, zoteroDeps } from '$lib/server/papers-http';
import { getPaperDetail } from '$lib/server/papers-service';
import { deletePaper } from '$lib/server/papers-zotero';
import { createServiceClient } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return standardError('unauthenticated');
	const detail = await getPaperDetail(createServiceClient(), locals.user.id, params.id);
	return detail ? Response.json(detail) : paperNotFound();
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return standardError('unauthenticated');
	const userId = locals.user.id;
	return withZoteroErrors(async () => {
		const result = await deletePaper(zoteroDeps(), userId, params.id);
		return result === 'deleted' ? new Response(null, { status: 204 }) : paperNotFound();
	});
};

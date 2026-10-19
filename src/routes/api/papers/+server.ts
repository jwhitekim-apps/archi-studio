import type { RequestHandler } from './$types';
import { errorResponse, standardError } from '$lib/server/errors';
import { InvalidCursorError } from '$lib/server/papers-mapping';
import { DEFAULT_LIMIT, listPapers, MAX_LIMIT } from '$lib/server/papers-service';
import { createServiceClient } from '$lib/server/supabase';

const invalid = (message: string) => errorResponse(400, 'invalid_request', message);

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return standardError('unauthenticated');

	const rawLimit = url.searchParams.get('limit');
	let limit = DEFAULT_LIMIT;
	if (rawLimit !== null) {
		limit = /^\d+$/.test(rawLimit) ? Number(rawLimit) : NaN;
		if (!(limit >= 1 && limit <= MAX_LIMIT)) return invalid(`limit은 1 이상 ${MAX_LIMIT} 이하의 정수여야 합니다.`);
	}

	try {
		const result = await listPapers(createServiceClient(), locals.user.id, {
			query: url.searchParams.get('query') ?? undefined,
			collection: url.searchParams.get('collection') ?? undefined,
			limit,
			cursor: url.searchParams.get('cursor') ?? undefined
		});
		return Response.json(result);
	} catch (err) {
		if (err instanceof InvalidCursorError) return invalid('cursor가 올바르지 않습니다.');
		throw err;
	}
};

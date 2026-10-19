import type { RequestHandler } from './$types';
import { errorResponse, standardError } from '$lib/server/errors';
import { withZoteroErrors, zoteroDeps } from '$lib/server/papers-http';
import { addWebpage } from '$lib/server/papers-zotero';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return standardError('unauthenticated');
	const userId = locals.user.id;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return errorResponse(400, 'invalid_request', '요청 본문이 올바른 JSON이 아닙니다.');
	}
	const url = typeof body === 'object' && body !== null ? (body as { url?: unknown }).url : undefined;

	return withZoteroErrors(async () => {
		const result = await addWebpage(zoteroDeps(), userId, url);
		if (result.kind === 'invalid') return errorResponse(400, 'invalid_request', result.message);
		return Response.json(result.detail, { status: 201 });
	});
};

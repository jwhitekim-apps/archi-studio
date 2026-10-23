import type { RequestHandler } from './$types';
import { aiNotConfigured, aiUnavailable, errorResponse, paperNotFound, payloadTooLarge, standardError } from '$lib/server/errors';
import { translationDeps } from '$lib/server/translation/deps';
import { parseTranslateInput } from '$lib/server/translation/input';
import { translate } from '$lib/server/translation/service';

const MAX_BODY_BYTES = 64 * 1024;

const invalid = (message: string) => errorResponse(400, 'invalid_request', message);

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return standardError('unauthenticated');

	const declared = Number(request.headers.get('content-length'));
	if (declared > MAX_BODY_BYTES) return payloadTooLarge();
	const raw = await request.arrayBuffer();
	if (raw.byteLength > MAX_BODY_BYTES) return payloadTooLarge();

	let body: unknown;
	try {
		body = JSON.parse(new TextDecoder().decode(raw));
	} catch {
		return invalid('요청 본문이 올바른 JSON이 아닙니다.');
	}
	const input = parseTranslateInput(body);
	if (!input.ok) return input.code === 'payload_too_large' ? payloadTooLarge(input.message) : invalid(input.message);

	const result = await translate(translationDeps(), { userId: locals.user.id, text: input.text, type: input.type, paperId: input.paperId });
	if (result.kind === 'error') {
		if (result.code === 'paper_not_found') return paperNotFound();
		return result.code === 'ai_not_configured' ? aiNotConfigured() : aiUnavailable();
	}
	return new Response(result.body, {
		headers: { 'content-type': 'text/plain; charset=utf-8', 'x-cache': result.cache, 'cache-control': 'no-store' }
	});
};

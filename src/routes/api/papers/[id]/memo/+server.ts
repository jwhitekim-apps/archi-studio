import type { RequestHandler } from './$types';
import { errorResponse, paperNotFound, payloadTooLarge, standardError } from '$lib/server/errors';
import { withZoteroErrors, zoteroDeps } from '$lib/server/papers-http';
import { readPaperMemo, writePaperMemo } from '$lib/server/memo/memo-zotero';
import { MAX_MEMO_REQUEST_BYTES, parseMemoInput } from '$lib/server/memo/service';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return standardError('unauthenticated');
	const userId = locals.user.id;
	return withZoteroErrors(async () => {
		const memo = await readPaperMemo(zoteroDeps(), userId, params.id);
		return memo ? Response.json(memo) : paperNotFound();
	});
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return standardError('unauthenticated');
	const userId = locals.user.id;

	// 본문 검사가 먼저다(design 결정 5). 요청 전체는 JSON 이스케이프 여유를 두고 자른다.
	if (Number(request.headers.get('content-length') ?? 0) > MAX_MEMO_REQUEST_BYTES) return payloadTooLarge('메모는 1 MB를 넘을 수 없습니다.');
	let raw: ArrayBuffer;
	try {
		raw = await request.arrayBuffer();
	} catch {
		// 본문 읽기 실패는 서버 본문 한도(BODY_SIZE_LIMIT)를 넘은 경우다. 어댑터의 다른 형식 대신 공통 형식 413으로 답한다.
		return payloadTooLarge('메모는 1 MB를 넘을 수 없습니다.');
	}
	if (raw.byteLength > MAX_MEMO_REQUEST_BYTES) return payloadTooLarge('메모는 1 MB를 넘을 수 없습니다.');
	let body: unknown;
	try {
		body = JSON.parse(new TextDecoder().decode(raw));
	} catch {
		return errorResponse(400, 'invalid_request', '요청 본문이 올바른 JSON이 아닙니다.');
	}
	const input = parseMemoInput(body);
	if (!input.ok) return errorResponse(input.code === 'payload_too_large' ? 413 : 400, input.code, input.message);

	return withZoteroErrors(async () => {
		const memo = await writePaperMemo(zoteroDeps(), userId, params.id, input.markdown);
		return memo ? Response.json(memo) : paperNotFound();
	});
};

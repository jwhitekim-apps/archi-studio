import type { RequestHandler } from './$types';
import { errorResponse, paperNotFound, standardError } from '$lib/server/errors';
import { withZoteroErrors, zoteroDeps } from '$lib/server/papers-http';
import { getPaperFile } from '$lib/server/papers-zotero';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return standardError('unauthenticated');
	const userId = locals.user.id;
	return withZoteroErrors(async () => {
		const result = await getPaperFile(zoteroDeps(), userId, params.id);
		if (result.kind === 'paper_not_found') return paperNotFound();
		if (result.kind === 'attachment_not_found') {
			return errorResponse(404, 'attachment_not_found', '이 논문에는 열 수 있는 첨부 파일이 없습니다.');
		}
		return result.response;
	});
};

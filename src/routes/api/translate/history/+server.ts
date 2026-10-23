import type { RequestHandler } from './$types';
import { errorResponse, standardError } from '$lib/server/errors';
import { translationRepository } from '$lib/server/translation/deps';
import { isUuid } from '$lib/server/translation/input';

const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 200;

const invalid = (message: string) => errorResponse(400, 'invalid_request', message);

// 남의 논문 id는 404가 아니라 빈 목록이다(user_id 조건으로 걸러져 행이 없다).
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return standardError('unauthenticated');

	const rawLimit = url.searchParams.get('limit');
	let limit = DEFAULT_HISTORY_LIMIT;
	if (rawLimit !== null) {
		limit = /^\d+$/.test(rawLimit) ? Number(rawLimit) : NaN;
		if (!(limit >= 1 && limit <= MAX_HISTORY_LIMIT)) return invalid(`limit은 1 이상 ${MAX_HISTORY_LIMIT} 이하의 정수여야 합니다.`);
	}
	const paperId = url.searchParams.get('paperId');
	if (paperId !== null && !isUuid(paperId)) return invalid('paperId가 올바른 형식이 아닙니다.');

	const items = await translationRepository().listHistory(locals.user.id, { paperId: paperId?.toLowerCase() ?? null, limit });
	return Response.json({ items });
};

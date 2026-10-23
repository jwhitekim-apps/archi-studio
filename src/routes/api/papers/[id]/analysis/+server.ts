import type { RequestHandler } from './$types';
import { analysisDeps } from '$lib/server/analysis/deps';
import { analyzePaper, getAnalysis } from '$lib/server/analysis/analysis-service';
import { errorResponse, paperNotFound, standardError } from '$lib/server/errors';
import { createServiceClient } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return standardError('unauthenticated');
	const result = await analyzePaper(analysisDeps(locals.user.id), locals.user.id, params.id);
	switch (result.kind) {
		case 'ok':
			return Response.json(result.analysis);
		case 'paper_not_found':
			return paperNotFound();
		case 'no_source':
			return errorResponse(422, 'no_source_for_analysis', '분석에 쓸 PDF도 Semantic Scholar 정보도 없습니다.');
		case 'upstream_unavailable':
			return errorResponse(502, 'upstream_unavailable', '외부 서비스가 응답하지 않습니다. 잠시 뒤 다시 시도해 주세요.');
	}
};

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return standardError('unauthenticated');
	const result = await getAnalysis(createServiceClient(), locals.user.id, params.id);
	if (result.kind === 'paper_not_found') return paperNotFound();
	if (result.kind === 'analysis_not_found') return errorResponse(404, 'analysis_not_found', '이 논문의 분석이 없습니다.');
	return Response.json(result.analysis);
};

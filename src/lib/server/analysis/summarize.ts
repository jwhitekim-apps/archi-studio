// AI 요약(결정 7). AI에는 초록(없으면 제목과 DOI)만 보낸다. PDF 본문이나 파일은 보내지 않는다.
import { AiError, extractJson, type AiProvider } from '../ai';
import { abstractPrompt, titlePrompt } from './prompts';
import { NoSourceError, UpstreamError, type AnalysisSummary } from './types';

// 벨루는 1024였다. 학교 모델처럼 답하기 전에 생각하는 모델은 생각에도 한도를 써서 1024면 빈 응답이 나기 쉬워 늘렸다.
export const SUMMARY_MAX_TOKENS = 4096;

export interface SummarizeInput {
	abstract: string;
	title: string | null;
	doi: string | null;
}

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function toSummary(raw: Record<string, unknown>): AnalysisSummary {
	const problemShort = text(raw.problem_short);
	const methodShort = text(raw.method_short);
	const conclusionShort = text(raw.conclusion_short);
	return {
		summary: [problemShort, methodShort, conclusionShort].filter(Boolean).join('\n'),
		keywords: Array.isArray(raw.keywords) ? raw.keywords.filter((k): k is string => typeof k === 'string' && k.trim() !== '').map((k) => k.trim()) : [],
		domain: text(raw.domain),
		problemShort,
		problem: text(raw.problem),
		methodShort,
		method: text(raw.method),
		conclusionShort,
		conclusion: text(raw.conclusion)
	};
}

export async function summarize(provider: AiProvider, input: SummarizeInput): Promise<AnalysisSummary> {
	const abstract = input.abstract.trim();
	const title = input.title?.trim() ?? '';
	if (!abstract && !title) throw new NoSourceError();
	const user = abstract ? abstractPrompt(abstract) : titlePrompt(title, input.doi || '없음');
	try {
		const raw = await provider.complete({ system: '', user, maxTokens: SUMMARY_MAX_TOKENS, tier: 'fast' });
		return toSummary(extractJson(raw));
	} catch (err) {
		if (err instanceof AiError) throw new UpstreamError(err.code);
		throw err;
	}
}

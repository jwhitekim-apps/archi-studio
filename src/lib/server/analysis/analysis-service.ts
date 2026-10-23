// 논문 분석 흐름(결정 1, 8, 9): 논문 확인 → 저장된 분석 → PDF 읽기 → Semantic Scholar 연결 → 저널 점수 → 요약 → 저장.
// 서비스 키로 접속하므로 모든 쿼리에 user_id 조건을 직접 건다. 외부 통신은 deps로 주입한다.
import type { SupabaseClient } from '@supabase/supabase-js';
import { AiError, type AiProvider } from '../ai';
import { parseYear, type PaperRow } from '../papers-mapping';
import { findOwnPaper } from '../papers-service';
import type { JournalScorer } from './journal-score';
import { extractFromPdf } from './pdf-extract';
import { resolveS2 } from './resolve-s2';
import type { S2Client, S2Paper } from './semantic-scholar';
import { summarize } from './summarize';
import { NoSourceError, UpstreamError, type Analysis, type AnalysisBasic, type PdfExtract, type StoredAnalysis } from './types';

export interface AnalysisDeps {
	admin: SupabaseClient;
	provider: () => AiProvider;
	s2: S2Client;
	scorer: () => JournalScorer;
	// PDF 첨부가 없으면 null
	fetchPdf: (paper: PaperRow) => Promise<Uint8Array | null>;
	// 오류 이름만 받는다(외부 응답 내용, 키, 초록은 넘기지 않는다)
	log?: (event: string, name: string) => void;
}

export type AnalyzeResult =
	| { kind: 'ok'; analysis: Analysis }
	| { kind: 'paper_not_found' }
	| { kind: 'no_source' }
	| { kind: 'upstream_unavailable' };

const defaultLog = (event: string, name: string) => console.error(`[analysis] ${event}`, name);
const errorName = (err: unknown) => (err instanceof UpstreamError ? err.cause : err instanceof AiError ? err.code : err instanceof Error ? err.name : 'unknown');

export function toApi(paperId: string, stored: StoredAnalysis): Analysis {
	// origin은 내보내지 않는다
	const { origin: _origin, ...body } = stored;
	return { paperId, ...body };
}

async function readStored(admin: SupabaseClient, userId: string, paperId: string): Promise<StoredAnalysis | null> {
	const { data, error } = await admin.from('archi_analyses').select('result').eq('user_id', userId).eq('paper_id', paperId).maybeSingle();
	if (error) throw error;
	return (data?.result as StoredAnalysis | undefined) ?? null;
}

export async function getAnalysis(admin: SupabaseClient, userId: string, paperId: string): Promise<{ kind: 'ok'; analysis: Analysis } | { kind: 'paper_not_found' } | { kind: 'analysis_not_found' }> {
	const paper = await findOwnPaper(admin, userId, paperId);
	if (!paper) return { kind: 'paper_not_found' };
	const stored = await readStored(admin, userId, paper.id);
	return stored ? { kind: 'ok', analysis: toApi(paper.id, stored) } : { kind: 'analysis_not_found' };
}

function basicFrom(paper: PaperRow, pdf: PdfExtract | null, s2: S2Paper | null): AnalysisBasic {
	const ext = s2?.externalIds ?? {};
	return {
		title: s2?.title || pdf?.title || paper.title || null,
		year: s2?.year ?? parseYear(paper.year),
		venue: s2?.venue || null,
		doi: ext.DOI || pdf?.doi || null,
		arxivId: ext.ArXiv || pdf?.arxivId || null,
		citationCount: s2?.citationCount ?? null
	};
}

export async function analyzePaper(deps: AnalysisDeps, userId: string, paperId: string): Promise<AnalyzeResult> {
	const log = deps.log ?? defaultLog;
	const paper = await findOwnPaper(deps.admin, userId, paperId);
	if (!paper) return { kind: 'paper_not_found' };

	const existing = await readStored(deps.admin, userId, paper.id);
	if (existing) return { kind: 'ok', analysis: toApi(paper.id, existing) };

	// PDF를 못 가져오거나 못 읽으면 PDF가 없는 것으로 진행한다.
	let pdf: PdfExtract | null = null;
	try {
		const bytes = await deps.fetchPdf(paper);
		if (bytes) pdf = await extractFromPdf(bytes);
	} catch (err) {
		log('PDF 읽기 실패', errorName(err));
	}

	let s2: S2Paper | null = null;
	let s2Failed = false;
	try {
		s2 = await resolveS2(deps.s2, {
			s2PaperId: paper.s2_paper_id,
			arxivId: pdf?.arxivId ?? null,
			doi: pdf?.doi ?? null,
			title: pdf?.title || paper.title
		});
	} catch (err) {
		s2Failed = true;
		log('Semantic Scholar 실패', errorName(err));
	}

	if (!pdf && !s2) return s2Failed ? { kind: 'upstream_unavailable' } : { kind: 'no_source' };

	const basic = basicFrom(paper, pdf, s2);
	let summary;
	try {
		summary = await summarize(deps.provider(), { abstract: s2?.abstract || pdf?.abstract || '', title: basic.title, doi: basic.doi });
	} catch (err) {
		if (err instanceof NoSourceError) return { kind: 'no_source' };
		if (err instanceof UpstreamError || err instanceof AiError) {
			log('요약 실패', errorName(err));
			return { kind: 'upstream_unavailable' };
		}
		throw err;
	}

	const authors = s2 ? await deps.s2.enrichAuthors(s2) : [];
	const stored: StoredAnalysis = {
		...summary,
		basic,
		authors,
		journalScore: deps.scorer().lookup(basic.venue),
		sources: { pdf: pdf !== null, semanticScholar: s2 !== null },
		origin: 'native'
	};

	if (s2 && !paper.s2_paper_id) {
		const { error } = await deps.admin.from('papers').update({ s2_paper_id: s2.paperId }).eq('user_id', userId).eq('id', paper.id);
		if (error) log('s2_paper_id 저장 실패', error.name ?? 'unknown');
	}

	// 동시 요청: 먼저 들어간 행이 이긴다. 진 쪽은 그 행을 읽어 돌려줘 두 응답이 같다.
	const { data, error } = await deps.admin
		.from('archi_analyses')
		.upsert({ user_id: userId, paper_id: paper.id, result: stored }, { onConflict: 'user_id,paper_id', ignoreDuplicates: true })
		.select('result');
	if (error) throw error;
	if (data && data.length) return { kind: 'ok', analysis: toApi(paper.id, stored) };
	const winner = await readStored(deps.admin, userId, paper.id);
	if (!winner) throw new Error('분석 행을 다시 읽지 못했습니다.');
	return { kind: 'ok', analysis: toApi(paper.id, winner) };
}

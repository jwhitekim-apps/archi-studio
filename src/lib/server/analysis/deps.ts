// 실제 AI 제공자, Semantic Scholar, Zotero, DB를 묶는 곳. 시험은 testHooks로 가짜를 넣는다(서비스 코드는 이 값을 설정하지 않는다).
import { env } from '$env/dynamic/private';
import { getAiProvider, type AiProvider } from '../ai';
import type { PaperRow } from '../papers-mapping';
import { zoteroDeps } from '../papers-http';
import { fetchPaperPdf } from '../papers-zotero';
import { createServiceClient } from '../supabase';
import type { AnalysisDeps } from './analysis-service';
import { journalScorer } from './journal-score';
import { MAX_PDF_BYTES } from './pdf-extract';
import { createS2Client, type S2Client } from './semantic-scholar';

export const testHooks: { provider?: AiProvider; s2?: S2Client; fetchPdf?: (paper: PaperRow) => Promise<Uint8Array | null> } = {};

export function analysisDeps(userId: string): AnalysisDeps {
	return {
		admin: createServiceClient(),
		provider: () => testHooks.provider ?? getAiProvider('analysis'),
		s2: testHooks.s2 ?? createS2Client({ apiKey: env.S2_API_KEY }),
		scorer: () => journalScorer(),
		fetchPdf: testHooks.fetchPdf ?? ((paper) => fetchPaperPdf(zoteroDeps(), userId, paper, MAX_PDF_BYTES))
	};
}

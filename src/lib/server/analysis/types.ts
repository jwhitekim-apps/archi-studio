// 논문 분석 결과와 단계별 오류(archi-studio-paper-analysis). 알 수 없는 값은 필드를 빼지 않고 null, 목록은 빈 배열이다.

export interface AnalysisBasic {
	title: string | null;
	year: number | null;
	venue: string | null;
	doi: string | null;
	arxivId: string | null;
	citationCount: number | null;
}

export interface AnalysisAuthor {
	name: string;
	hIndex: number | null;
	citationCount: number | null;
}

export interface JournalScore {
	matchedTitle: string | null;
	sjr: number | null;
	quartile: string | null;
	issn: string | null;
	type: string | null;
	country: string | null;
}

export interface AnalysisSources {
	pdf: boolean;
	semanticScholar: boolean;
}

// AI가 만드는 부분. *_short는 summary를 만들고 화면에서도 쓴다.
export interface AnalysisSummary {
	summary: string;
	keywords: string[];
	domain: string | null;
	problemShort: string | null;
	problem: string | null;
	methodShort: string | null;
	method: string | null;
	conclusionShort: string | null;
	conclusion: string | null;
}

export interface AnalysisBody extends AnalysisSummary {
	basic: AnalysisBasic;
	authors: AnalysisAuthor[];
	journalScore: JournalScore;
	sources: AnalysisSources;
}

// API 응답
export interface Analysis extends AnalysisBody {
	paperId: string;
}

// archi_analyses.result에 저장하는 모양. 응답에는 origin을 내보내지 않는다.
export type AnalysisOrigin = 'native' | 'veloo-import';
export interface StoredAnalysis extends AnalysisBody {
	origin: AnalysisOrigin;
}

// PDF에서 읽은 것. 못 읽은 값은 빈 문자열 또는 null이다(벨루 extract_from_pdf와 같은 모양, 그림 제외).
export interface PdfExtract {
	title: string;
	abstract: string;
	doi: string | null;
	arxivId: string | null;
}

export const EMPTY_JOURNAL_SCORE: JournalScore = {
	matchedTitle: null,
	sjr: null,
	quartile: null,
	issn: null,
	type: null,
	country: null
};

export class PdfTooLargeError extends Error {
	constructor() {
		super('PDF가 50MB를 넘습니다.');
		this.name = 'PdfTooLargeError';
	}
}

export class PdfUnreadableError extends Error {
	constructor() {
		super('PDF를 읽지 못했습니다.');
		this.name = 'PdfUnreadableError';
	}
}

// 분석에 쓸 초록도 제목도 없다(422 no_source_for_analysis).
export class NoSourceError extends Error {
	constructor() {
		super('분석에 쓸 자료가 없습니다.');
		this.name = 'NoSourceError';
	}
}

// AI나 외부 서비스가 실패했다(502 upstream_unavailable). cause는 로그용 코드 이름이다.
export class UpstreamError extends Error {
	constructor(readonly cause: string) {
		super('외부 서비스가 응답하지 않습니다.');
		this.name = 'UpstreamError';
	}
}

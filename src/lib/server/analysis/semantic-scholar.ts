// Semantic Scholar 클라이언트. 벨루 core/semantic_scholar.py의 동작을 옮겼다. fetch와 sleep(초 단위)은 주입해 시험이 실제로 기다리지 않는다.
// 다른 점: 벨루는 429 네 번째 실패 뒤에도 8초를 기다렸다. 여기서는 마지막 시도 뒤에는 기다리지 않는다.
import type { AnalysisAuthor } from './types';

export const S2_BASE_URL = 'https://api.semanticscholar.org/graph/v1';
export const FIELDS_PAPER = 'title,year,venue,externalIds,abstract,authors,citationCount';
export const FIELDS_AUTHOR = 'name,hIndex,citationCount';
export const S2_TIMEOUT_MS = 15_000;
export const MAX_AUTHORS = 3;
const ATTEMPTS = 4;
const ANON_DELAY_SECONDS = 1;

export interface S2Paper {
	paperId: string;
	title?: string | null;
	year?: number | null;
	venue?: string | null;
	externalIds?: { DOI?: string; ArXiv?: string } | null;
	abstract?: string | null;
	authors?: { authorId?: string | null; name?: string | null }[];
	citationCount?: number | null;
}

export class RateLimitError extends Error {
	name = 'RateLimitError';
}
export class S2AuthError extends Error {
	name = 'S2AuthError';
}
export class S2TimeoutError extends Error {
	name = 'S2TimeoutError';
}
export class S2UnavailableError extends Error {
	name = 'S2UnavailableError';
}

export interface S2Options {
	apiKey?: string;
	baseUrl?: string;
	fetch?: typeof fetch;
	sleep?: (seconds: number) => Promise<void>;
	timeoutMs?: number;
}

export interface S2Client {
	// 없으면 null(404). 그 밖의 실패는 위 오류 중 하나를 던진다.
	getPaper(id: string): Promise<S2Paper | null>;
	searchByTitle(title: string, limit?: number): Promise<S2Paper[]>;
	enrichAuthors(paper: S2Paper): Promise<AnalysisAuthor[]>;
}

const realSleep = (seconds: number) => new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000));

export function createS2Client(options: S2Options = {}): S2Client {
	const fetchFn = options.fetch ?? fetch;
	const sleep = options.sleep ?? realSleep;
	const baseUrl = (options.baseUrl ?? S2_BASE_URL).replace(/\/+$/, '');
	const timeoutMs = options.timeoutMs ?? S2_TIMEOUT_MS;
	const apiKey = options.apiKey || undefined;

	async function get(path: string, params: Record<string, string>): Promise<unknown | null> {
		// 키가 없으면 요청 사이에 1초를 둔다(무인증 호출 제한)
		if (!apiKey) await sleep(ANON_DELAY_SECONDS);
		const url = `${baseUrl}/${path}?${new URLSearchParams(params)}`;
		let res: Response | undefined;
		for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
			try {
				res = await fetchFn(url, { headers: apiKey ? { 'x-api-key': apiKey } : {}, signal: AbortSignal.timeout(timeoutMs) });
			} catch (err) {
				if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) throw new S2TimeoutError('Semantic Scholar 시간 초과');
				throw new S2UnavailableError('Semantic Scholar 연결 실패');
			}
			if (res.status !== 429) break;
			await res.body?.cancel().catch(() => {});
			if (attempt < ATTEMPTS - 1) await sleep(2 ** attempt);
		}
		if (!res) throw new S2UnavailableError('Semantic Scholar 응답 없음');
		if (res.status === 401 || res.status === 403) throw new S2AuthError(`Semantic Scholar 인증 오류 (${res.status})`);
		if (res.status === 429) throw new RateLimitError('Semantic Scholar 호출 제한');
		if (res.status === 404) {
			await res.body?.cancel().catch(() => {});
			return null;
		}
		if (!res.ok) {
			await res.body?.cancel().catch(() => {});
			throw new S2UnavailableError(`Semantic Scholar 오류 (${res.status})`);
		}
		try {
			return await res.json();
		} catch {
			throw new S2UnavailableError('Semantic Scholar 응답을 읽지 못함');
		}
	}

	async function enrichOne(author: { authorId?: string | null; name?: string | null }): Promise<AnalysisAuthor> {
		const fallback = { name: author.name ?? '', hIndex: null, citationCount: null };
		if (!author.authorId) return fallback;
		try {
			const detail = (await get(`author/${author.authorId}`, { fields: FIELDS_AUTHOR })) as
				| { name?: string; hIndex?: number | null; citationCount?: number | null }
				| null;
			if (!detail) return fallback;
			return { name: detail.name ?? fallback.name, hIndex: detail.hIndex ?? null, citationCount: detail.citationCount ?? null };
		} catch {
			// 벨루와 같다: 저자 보강이 실패해도 이름만 남기고 계속한다
			return fallback;
		}
	}

	return {
		async getPaper(id) {
			const data = (await get(`paper/${id}`, { fields: FIELDS_PAPER })) as S2Paper | null;
			return data?.paperId ? data : null;
		},

		async searchByTitle(title, limit = 5) {
			const data = (await get('paper/search', { query: title, limit: String(limit), fields: FIELDS_PAPER })) as { data?: S2Paper[] } | null;
			return data?.data ?? [];
		},

		// 상위 3명만. 키가 있으면 동시에, 없으면 차례로(요청마다 1초 간격).
		async enrichAuthors(paper) {
			const authors = (paper.authors ?? []).slice(0, MAX_AUTHORS);
			if (apiKey) return Promise.all(authors.map(enrichOne));
			const out: AnalysisAuthor[] = [];
			for (const a of authors) out.push(await enrichOne(a));
			return out;
		}
	};
}

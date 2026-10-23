// 분석할 논문의 Semantic Scholar 짝 찾기(결정 6): s2PaperId → arXiv 번호 → DOI → 제목(정규화한 제목이 정확히 같을 때만).
// 못 찾으면 null, 조회 자체가 실패하면 클라이언트의 오류를 그대로 던진다(호출하는 쪽이 둘을 구분한다).
import type { S2Client, S2Paper } from './semantic-scholar';

export interface ResolveInput {
	s2PaperId: string | null;
	arxivId: string | null;
	doi: string | null;
	title: string | null;
}

// 대소문자, 공백, 문장부호를 무시한다
export function normalizeTitle(title: string): string {
	return title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

export async function resolveS2(client: S2Client, input: ResolveInput): Promise<S2Paper | null> {
	if (input.s2PaperId) return client.getPaper(input.s2PaperId);
	if (input.arxivId) {
		// Semantic Scholar의 arXiv 키에는 판 번호(v2 등)를 붙이지 않는다
		const found = await client.getPaper(`ArXiv:${input.arxivId.replace(/v\d+$/i, '')}`);
		if (found) return found;
	}
	if (input.doi) {
		const found = await client.getPaper(`DOI:${input.doi}`);
		if (found) return found;
	}
	const title = input.title?.trim();
	if (title) {
		const wanted = normalizeTitle(title);
		const results = await client.searchByTitle(title, 5);
		return results.find((p) => p.title && normalizeTitle(p.title) === wanted) ?? null;
	}
	return null;
}

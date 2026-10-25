// 브리핑 화면(archi-studio-ui-briefing)의 데이터 불러오기와 표시 도우미. API 계약은 docs/api/openapi.yaml의 Briefing*.
import { ApiError, apiFetch } from '$lib/api/client';

export interface BriefingListItem {
	id: string;
	date: string;
	summary: string;
}

export interface BriefingList {
	items: BriefingListItem[];
	nextCursor: string | null;
}

export interface BriefingDetail extends BriefingListItem {
	body: string;
	paperIds: string[];
}

export interface MentionedPaper {
	id: string;
	// null이면 제목을 불러오지 못한 논문
	title: string | null;
}

export interface BriefingView {
	briefing: BriefingDetail;
	papers: MentionedPaper[];
	// 상한을 넘어 보여 주지 않은 논문 수
	hiddenPapers: number;
}

// 한 브리핑에서 제목을 가져와 보여 줄 논문 수(design 결정 4)
export const PAPER_LIMIT = 20;

const WEEKDAY = new Intl.DateTimeFormat('ko-KR', { weekday: 'long', timeZone: 'UTC' });

// "2026-10-18" → "2026년 10월 18일 일요일". 시간대 없는 날짜라 문자열에서 바로 만든다(design 결정 3).
export function formatBriefingDate(date: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	if (!match) return date;
	const [y, m, d] = match.slice(1).map(Number);
	const weekday = WEEKDAY.format(new Date(Date.UTC(y, m - 1, d)));
	return `${y}년 ${m}월 ${d}일 ${weekday}`;
}

export function briefingsPath(cursor?: string | null): string {
	return cursor ? `/api/briefings?${new URLSearchParams({ cursor })}` : '/api/briefings';
}

// 이미 보이는 목록 뒤에 붙이되 같은 id는 건너뛴다
export function appendUnique(current: BriefingListItem[], next: BriefingListItem[]): BriefingListItem[] {
	const seen = new Set(current.map((item) => item.id));
	const added: BriefingListItem[] = [];
	for (const item of next) {
		if (seen.has(item.id)) continue;
		seen.add(item.id);
		added.push(item);
	}
	return [...current, ...added];
}

export function paperLabel(paper: MentionedPaper): string {
	if (paper.title === null) return '제목을 불러오지 못한 논문';
	return paper.title.trim() || '제목 없는 논문';
}

export function loadBriefingList(fetch: typeof globalThis.fetch, url?: URL): Promise<BriefingList> {
	return apiFetch<BriefingList>(briefingsPath(), { fetch, url });
}

// 상세와 언급된 논문 제목. 제목 요청은 병렬로 보내고, 404(그 사이 삭제)는 빼고, 다른 실패는 제목 없이 링크만 남긴다.
export async function loadBriefingView(fetch: typeof globalThis.fetch, id: string, url?: URL): Promise<BriefingView> {
	const briefing = await apiFetch<BriefingDetail>(`/api/briefings/${encodeURIComponent(id)}`, { fetch, url });
	const paperIds = briefing.paperIds ?? [];
	const shown = paperIds.slice(0, PAPER_LIMIT);
	const results = await Promise.all(
		shown.map(async (paperId): Promise<MentionedPaper | null> => {
			try {
				const paper = await apiFetch<{ title: string | null }>(`/api/papers/${encodeURIComponent(paperId)}`, {
					fetch,
					redirectOn401: false
				});
				return { id: paperId, title: paper?.title ?? '' };
			} catch (error) {
				if (error instanceof ApiError && error.status === 404) return null;
				return { id: paperId, title: null };
			}
		})
	);
	return {
		briefing,
		papers: results.filter((p): p is MentionedPaper => p !== null),
		hiddenPapers: paperIds.length - shown.length
	};
}

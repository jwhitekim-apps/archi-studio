// 서재 화면 도우미: 목록 요청 주소, 컬렉션 들여쓰기 순서, 동기화 결과 문구.
import type { Collection, SyncResult } from '$lib/api/types';

export const SEARCH_DEBOUNCE_MS = 280;

export function papersPath(query: string, collection: string, cursor?: string): string {
	const params = new URLSearchParams();
	if (query) params.set('query', query);
	if (collection) params.set('collection', collection);
	if (cursor) params.set('cursor', cursor);
	const search = params.toString();
	return search ? `/api/papers?${search}` : '/api/papers';
}

// 화면 주소의 쿼리(검색어, 컬렉션)
export function libraryHref(query: string, collection: string): string {
	const params = new URLSearchParams();
	if (query) params.set('query', query);
	if (collection) params.set('collection', collection);
	const search = params.toString();
	return search ? `/library?${search}` : '/library';
}

// 부모 아래에 자식이 오도록 깊이 우선으로 펼친다. 부모를 찾을 수 없는 항목은 최상위로 둔다.
export function flattenCollections(collections: Collection[]): (Collection & { depth: number })[] {
	const keys = new Set(collections.map((c) => c.key));
	const children = new Map<string | null, Collection[]>();
	for (const c of collections) {
		const parent = c.parentKey && keys.has(c.parentKey) ? c.parentKey : null;
		children.set(parent, [...(children.get(parent) ?? []), c]);
	}
	const out: (Collection & { depth: number })[] = [];
	const seen = new Set<string>();
	const walk = (parent: string | null, depth: number) => {
		for (const c of (children.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'ko'))) {
			if (seen.has(c.key)) continue;
			seen.add(c.key);
			out.push({ ...c, depth });
			walk(c.key, depth + 1);
		}
	};
	walk(null, 0);
	return out;
}

export function syncSummary(result: SyncResult): string {
	return `${result.added}건 추가, ${result.updated}건 갱신, ${result.removed}건 삭제`;
}

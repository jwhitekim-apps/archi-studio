import { describe, expect, it } from 'vitest';
import { flattenCollections, libraryHref, papersPath, syncSummary } from './library';

describe('서재 도우미', () => {
	it('요청 주소에 검색어, 컬렉션, 커서를 함께 붙인다', () => {
		expect(papersPath('', '')).toBe('/api/papers');
		expect(papersPath('attention is', 'K1', 'c2')).toBe('/api/papers?query=attention+is&collection=K1&cursor=c2');
		expect(libraryHref('a', '')).toBe('/library?query=a');
		expect(libraryHref('', '')).toBe('/library');
	});

	it('컬렉션은 부모 아래 자식 순서로 깊이를 붙인다', () => {
		const c = (key: string, name: string, parentKey: string | null) => ({ key, name, parentKey, paperCount: 0 });
		const flat = flattenCollections([c('B', '나', null), c('A1', '가-1', 'A'), c('A', '가', null), c('X', '고아', 'Z')]);
		expect(flat.map((f) => `${f.depth}:${f.name}`)).toEqual(['0:가', '1:가-1', '0:고아', '0:나']);
	});

	it('동기화 결과 문구', () => {
		expect(syncSummary({ added: 3, updated: 1, removed: 0, syncedAt: '' })).toBe('3건 추가, 1건 갱신, 0건 삭제');
	});
});

import { describe, expect, it } from 'vitest';
import { cleanTitle, extractAuthors, extractYear } from './sync';

// 기대값은 폴리오 server.js의 같은 이름 함수에 같은 입력을 넣어 얻었다.
describe('폴리오와 같은 항목 변환 규칙', () => {
	it('저자 목록', () => {
		expect(extractAuthors([{ firstName: 'Ada', lastName: 'Lovelace' }, { name: 'Org Inc' }, { lastName: 'Solo' }, {}])).toEqual([
			'Ada Lovelace',
			'Org Inc',
			'Solo'
		]);
		expect(extractAuthors(undefined)).toEqual([]);
	});

	it('연도 문자열', () => {
		expect(extractYear('2021-05-03')).toBe('2021');
		expect(extractYear('n.d.')).toBe('n.d.');
		expect(extractYear('Spring 1999 ed.')).toBe('1999');
		expect(extractYear('')).toBeNull();
		expect(extractYear(undefined)).toBeNull();
	});

	it('웹페이지 제목 꼬리 제거는 webpage 항목에만', () => {
		expect(cleanTitle('Page | Site | Pub', 'webpage')).toBe('Page');
		expect(cleanTitle('A | B', 'journalArticle')).toBe('A | B');
		expect(cleanTitle(' | x', 'webpage')).toBe(' | x');
		expect(cleanTitle(undefined, 'webpage')).toBeUndefined();
	});
});

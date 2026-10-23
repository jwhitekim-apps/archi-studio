import { describe, expect, it } from 'vitest';
import { createJournalScorer, journalScorer, parseCsv, toNumber } from './journal-score';
import { EMPTY_JOURNAL_SCORE } from './types';

const HEADER = 'Rank;Sourceid;Title;Type;Issn;Publisher;SJR;SJR Best Quartile;Country';
const csv = (rows: string[]) => [HEADER, ...rows].join('\n') + '\n';

const SMALL = csv([
	'1;1;"Journal of Exact Things";journal;"11111111";"P; with semicolon";12,5;Q1;Korea',
	'2;2;"alpha beta gamma delta epsilon";journal;"22222222";"P";1,25;Q2;Japan',
	'3;3;"one two three four five six seven eight nine ten k l m n o p q";journal;"";"P";;Q3;',
	'4;4;"IEEE Transactions on Biomedical Engineering";journal;"00189294";"IEEE";1,1;Q1;United States'
]);
const ALIASES = { TBME: 'IEEE Transactions on Biomedical Engineering' };

describe('규칙(작은 CSV)', () => {
	const scorer = createJournalScorer(SMALL, ALIASES);

	it('따옴표 안의 세미콜론과 쉼표 소수를 읽는다', () => {
		expect(parseCsv(SMALL)[1][5]).toBe('P; with semicolon');
		expect(toNumber('35,568')).toBe(35.568);
		expect(toNumber('')).toBeNull();
	});

	it('별칭은 대소문자를 무시하고 정식 이름으로 바꾼다', () => {
		expect(scorer.lookup('tbme').matchedTitle).toBe('IEEE Transactions on Biomedical Engineering');
	});

	it('정확히 같은 이름(대소문자 무시)', () => {
		expect(scorer.lookup('journal of exact things')).toEqual({
			matchedTitle: 'Journal of Exact Things',
			sjr: 12.5,
			quartile: 'Q1',
			issn: '11111111',
			type: 'journal',
			country: 'Korea'
		});
	});

	it('단어 겹침 0.6은 일치(3/5)', () => {
		expect(scorer.lookup('alpha beta gamma').matchedTitle).toBe('alpha beta gamma delta epsilon');
	});

	it('단어 겹침 0.59는 불일치(10/17)', () => {
		expect(scorer.lookup('one two three four five six seven eight nine ten')).toEqual(EMPTY_JOURNAL_SCORE);
	});

	it('빈 칸은 null', () => {
		expect(scorer.lookup('one two three four five six seven eight nine ten k l m n o p q')).toMatchObject({ sjr: null, issn: null, country: null, quartile: 'Q3' });
	});

	it.each(['', null, undefined])('venue가 %s이면 여섯 값이 모두 null', (venue) => {
		expect(scorer.lookup(venue)).toEqual(EMPTY_JOURNAL_SCORE);
	});

	it('돌려준 값을 고쳐도 캐시가 바뀌지 않는다', () => {
		scorer.lookup('TBME').sjr = 999;
		expect(scorer.lookup('TBME').sjr).toBe(1.1);
	});
});

describe('실제 SCImago CSV', () => {
	it('대표 저널과 별칭, 없는 이름', () => {
		const t0 = performance.now();
		const scorer = journalScorer();
		const nature = scorer.lookup('Nature Reviews Molecular Cell Biology');
		const built = performance.now() - t0;

		expect(nature).toMatchObject({ matchedTitle: 'Nature Reviews Molecular Cell Biology', quartile: 'Q1', sjr: 35.568 });
		expect(scorer.lookup('Ca-A Cancer Journal for Clinicians').sjr).toBe(104.065);
		expect(scorer.lookup('TBME').matchedTitle).toBe('IEEE Transactions on Biomedical Engineering');
		expect(scorer.lookup('Proceedings of a Workshop Nobody Indexed 2026')).toEqual(EMPTY_JOURNAL_SCORE);

		const t1 = performance.now();
		scorer.lookup('IEEE Transactions on Pattern Analysis and Machine Intelligence');
		const second = performance.now() - t1;
		console.log(`색인 만들기와 첫 조회 ${built.toFixed(0)}ms, 두 번째 조회 ${second.toFixed(2)}ms`);
		expect(second).toBeLessThan(10);
	});
});

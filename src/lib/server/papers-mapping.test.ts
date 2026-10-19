import { describe, expect, it } from 'vitest';
import {
	decodeCursor,
	encodeCursor,
	InvalidCursorError,
	parseYear,
	toPaperDetail,
	toPaperListItem,
	type PaperRow
} from './papers-mapping';

const row: PaperRow = {
	id: '11111111-1111-4111-8111-111111111111',
	item_key: 'ABCD1234',
	s2_paper_id: null,
	title: null,
	authors: ['Ada Lovelace', 3, 'Org'],
	year: '2017-06-12',
	collections: ['C1'],
	attachment_key: 'ATT1',
	attachment_type: 'pdf',
	has_memo: true,
	synced_at: '2026-01-01T00:00:03.00001+00:00'
};

describe('응답 변환', () => {
	it('제목 null은 빈 문자열, 연도는 정수, 문자열이 아닌 저자는 버린다', () => {
		expect(toPaperListItem(row)).toEqual({
			id: row.id,
			title: '',
			authors: ['Ada Lovelace', 'Org'],
			year: 2017,
			collections: ['C1'],
			hasPdf: true,
			hasMemo: true
		});
	});

	it.each([
		['2017-06-12', 2017],
		['c. 1999', 1999],
		['n.d.', null],
		['', null],
		[null, null]
	])('연도 %j는 %j', (input, expected) => {
		expect(parseYear(input)).toBe(expected);
	});

	it('html 첨부와 첨부 없음은 hasPdf가 false이고 attachment.type을 그대로 쓴다', () => {
		const html = toPaperDetail({ ...row, attachment_type: 'html' }, { translationCount: 2, analysisCount: 1 });
		expect(html).toMatchObject({ hasPdf: false, attachment: { type: 'html' }, translationCount: 2, analysisCount: 1, itemKey: 'ABCD1234', s2PaperId: null });
		expect(toPaperDetail({ ...row, attachment_key: null, attachment_type: null }, { translationCount: 0, analysisCount: 0 }).attachment).toEqual({ type: null });
	});
});

describe('커서', () => {
	it('인코딩한 값을 그대로 해독한다(마이크로초 문자열 유지)', () => {
		const cursor = { syncedAt: '2026-01-01T00:00:03.00001+00:00', id: row.id };
		const encoded = encodeCursor(cursor);
		expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(decodeCursor(encoded)).toEqual(cursor);
	});

	it.each(['', 'not-a-cursor', '!!!', Buffer.from('{"a":1}').toString('base64url'), Buffer.from('["x","y"]').toString('base64url'), Buffer.from(JSON.stringify(['2026-01-01T00:00:00Z', 'nope'])).toString('base64url')])(
		'깨진 커서 %j는 오류를 던진다',
		(bad) => {
			expect(() => decodeCursor(bad)).toThrow(InvalidCursorError);
		}
	);
});

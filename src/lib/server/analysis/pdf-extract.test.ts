import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { abstractFromText, extractFromPdf, idsFromText, MAX_PDF_BYTES, titleFromLines } from './pdf-extract';
import { PdfTooLargeError, PdfUnreadableError } from './types';

// 시험용 PDF는 scripts/make-analysis-fixture.mjs가 만든다.
const fixture = (name: string) => new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures', name)));

describe('extractFromPdf', () => {
	it('sample.pdf에서 제목, 초록, DOI, arXiv 번호를 읽는다', async () => {
		const result = await extractFromPdf(fixture('sample.pdf'));
		expect(result.title).toBe('Attention Is a Small Test Fixture for Paper Analysis Extraction');
		expect(result.abstract).toBe(
			'We present a tiny synthetic paper used only to test abstract extraction. The fixture has a large title, a short author line and an abstract paragraph that continues across several lines with a hyphenated word. Results show that the extractor joins the lines into one paragraph.'
		);
		expect(result.abstract.length).toBeGreaterThanOrEqual(80);
		expect(result.abstract).not.toContain('Introduction');
		expect(result.doi).toBe('10.1234/fixture.2026.001');
		expect(result.arxivId).toBe('2601.01234v2');
	});

	it('no-abstract.pdf는 초록이 빈 문자열이고 번호는 null이다', async () => {
		const result = await extractFromPdf(fixture('no-abstract.pdf'));
		expect(result.title).toBe('Attention Is a Small Test Fixture for Paper Analysis Extraction');
		expect(result.abstract).toBe('');
		expect(result.doi).toBeNull();
		expect(result.arxivId).toBeNull();
	});

	it('broken.pdf는 PdfUnreadableError', async () => {
		await expect(extractFromPdf(fixture('broken.pdf'))).rejects.toBeInstanceOf(PdfUnreadableError);
	});

	it('50MB를 넘으면 읽기 전에 PdfTooLargeError', async () => {
		const big = new Uint8Array(MAX_PDF_BYTES + 1);
		await expect(extractFromPdf(big)).rejects.toBeInstanceOf(PdfTooLargeError);
	});

	it('넘긴 버퍼를 망가뜨리지 않는다', async () => {
		const buffer = fixture('sample.pdf');
		await extractFromPdf(buffer);
		expect(buffer.byteLength).toBeGreaterThan(0);
	});
});

describe('규칙 단위', () => {
	it('제목은 가장 큰 글자의 88% 이상인 줄을 문서 순서대로 최대 4줄', () => {
		const lines = [
			{ size: 20, text: 'You' },
			{ size: 18, text: 'Need' },
			{ size: 12, text: 'author' },
			{ size: 20, text: 'a' },
			{ size: 20, text: 'b' },
			{ size: 20, text: 'c' }
		];
		expect(titleFromLines(lines)).toBe('You Need a b');
		expect(titleFromLines([])).toBe('');
	});

	it.each([
		['머리글 줄', 'Title\nAbstract\n' + 'x'.repeat(90) + '\n1 Introduction\nbody', 'x'.repeat(90)],
		['같은 줄 Abstract—', 'Abstract— ' + 'y'.repeat(90) + '\nIndex Terms—z', 'y'.repeat(90)],
		['하이픈 줄바꿈과 공백 정리', 'ABSTRACT\n' + 'a'.repeat(50) + ' exam-\nple ' + 'b'.repeat(40) + '\nKeywords', 'a'.repeat(50) + ' example ' + 'b'.repeat(40)],
		['80자 미만은 버린다', 'Abstract\nshort text\n1 Introduction', ''],
		['머리글 없음', 'Nothing here\n', '']
	])('초록: %s', (_, text, expected) => {
		expect(abstractFromText(text)).toBe(expected);
	});

	it('초록은 3000자에서 자른다', () => {
		expect(abstractFromText('Abstract\n' + 'w '.repeat(2000))).toHaveLength(3000);
	});

	it('DOI 끝의 마침표를 떼고 arXiv 번호를 읽는다', () => {
		expect(idsFromText('see doi 10.1145/3292500.3330701. and arXiv: 1706.03762')).toEqual({ doi: '10.1145/3292500.3330701', arxivId: '1706.03762' });
	});
});

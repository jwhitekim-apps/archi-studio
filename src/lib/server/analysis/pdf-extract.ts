// PDF에서 제목·초록·DOI·arXiv 번호 읽기. 벨루 core/pdf_extractor.py(PyMuPDF)의 규칙을 pdf.js로 옮겼다(그림 추출 제외).
// 다른 점: 벨루는 제목 줄을 (크기, 문자열) 역순으로 정렬해 같은 크기의 여러 줄 제목이 알파벳 역순으로 섞였다. 여기서는 문서 순서를 지킨다.
import { getDocument, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PdfTooLargeError, PdfUnreadableError, type PdfExtract } from './types';

export const MAX_PDF_BYTES = 50 * 1024 * 1024;

const ARXIV_RE = /arXiv\s*[:.]?\s*(\d{4}\.\d{4,5}(?:v\d+)?)/i;
const DOI_RE = /10\.\d{4,}\/[^\s&?#"']+/;
const NEXT_SECTION = String.raw`\n\s*(?:(?:1\s*\.?\s*)?(?:introduction|keywords|index terms|ccs concepts|background|related work|notation|nomenclature))`;
const ABSTRACT_PATTERNS = [
	// 1: "Abstract" 머리글 줄 → 다음 절
	new RegExp(String.raw`(?:^|\n)\s*abstract\s*\n([\s\S]*?)(?=${NEXT_SECTION}|$)`, 'i'),
	// 2: "Abstract—", "Abstract:" 처럼 같은 줄에서 시작
	new RegExp(String.raw`abstract\s*[—–:\-]+\s*([\s\S]*?)(?=${NEXT_SECTION}|$)`, 'i'),
	// 3: "Abstract" 뒤 100~1500자
	new RegExp(String.raw`abstract[^\w]+([\s\S]{100,1500}?)(?=${NEXT_SECTION}|$)`, 'i')
];

interface PdfTextItem {
	str: string;
	transform: number[];
	hasEOL: boolean;
}

interface Line {
	size: number;
	text: string;
}

// pdf.js 글자 조각을 줄로 묶는다. PyMuPDF의 line과 같은 단위로 hasEOL에서 끊는다.
function toLines(items: PdfTextItem[]): Line[] {
	const lines: Line[] = [];
	let parts: string[] = [];
	let size = 0;
	const flush = () => {
		if (parts.length && size > 10) lines.push({ size, text: parts.join(' ') });
		parts = [];
		size = 0;
	};
	for (const item of items) {
		const text = item.str.trim();
		const itemSize = Math.hypot(item.transform[2], item.transform[3]);
		if (text && itemSize > 10) {
			parts.push(text);
			size = Math.max(size, itemSize);
		}
		if (item.hasEOL) flush();
	}
	flush();
	return lines;
}

// 첫 쪽에서 가장 큰 글자의 88% 이상인 줄을 문서 순서대로 최대 4줄
export function titleFromLines(lines: Line[]): string {
	if (!lines.length) return '';
	const max = Math.max(...lines.map((l) => l.size));
	return lines
		.filter((l) => l.size >= max * 0.88)
		.slice(0, 4)
		.map((l) => l.text)
		.join(' ')
		.trim();
}

export function abstractFromText(text: string): string {
	for (const pattern of ABSTRACT_PATTERNS) {
		const m = pattern.exec(text);
		if (!m) continue;
		const abstract = m[1].trim().replace(/-\s*\n/g, '').replace(/\s+/g, ' ');
		// 벨루는 첫 번째로 맞은 방식의 결과만 본다
		return abstract.length >= 80 ? abstract.slice(0, 3000) : '';
	}
	return '';
}

export function idsFromText(text: string): { doi: string | null; arxivId: string | null } {
	return {
		arxivId: ARXIV_RE.exec(text)?.[1] ?? null,
		doi: DOI_RE.exec(text)?.[0].replace(/\.+$/, '') ?? null
	};
}

function pageText(items: PdfTextItem[]): string {
	return items.map((i) => i.str + (i.hasEOL ? '\n' : '')).join('');
}

export async function extractFromPdf(buffer: Uint8Array): Promise<PdfExtract> {
	if (buffer.byteLength > MAX_PDF_BYTES) throw new PdfTooLargeError();
	let doc;
	try {
		// pdf.js가 넘긴 버퍼를 떼어 가므로 사본을 넘긴다
		doc = await getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, verbosity: VerbosityLevel.ERRORS }).promise;
	} catch {
		throw new PdfUnreadableError();
	}
	try {
		const pages: PdfTextItem[][] = [];
		for (let i = 1; i <= Math.min(3, doc.numPages); i++) {
			const content = await (await doc.getPage(i)).getTextContent();
			pages.push(content.items.flatMap((it) => ('str' in it ? [{ str: it.str, transform: it.transform, hasEOL: it.hasEOL }] : [])));
		}
		const texts = pages.map(pageText);
		return {
			title: titleFromLines(toLines(pages[0] ?? [])),
			abstract: abstractFromText(texts.join('')),
			...idsFromText(texts.slice(0, 2).join(''))
		};
	} catch {
		throw new PdfUnreadableError();
	} finally {
		await doc.destroy();
	}
}

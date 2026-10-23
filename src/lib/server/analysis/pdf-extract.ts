// PDF에서 제목·초록·DOI·arXiv 번호 읽기. 벨루 core/pdf_extractor.py(PyMuPDF)의 규칙을 pdf.js로 옮겼다(그림 추출 제외).
// 다른 점: 벨루는 제목 줄을 (크기, 문자열) 역순으로 정렬해 같은 크기의 여러 줄 제목이 알파벳 역순으로 섞였다. 여기서는 문서 순서를 지킨다.
// 다른 점 2: arXiv 판 왼쪽 여백의 세로 도장이 가장 큰 글자로 잡혀 제목이 되던 문제를, 세로 글자를 빼서 고쳤다.
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
	width: number;
	hasEOL: boolean;
}

interface Line {
	size: number;
	text: string;
}

// pdf.js 글자 조각을 줄로 묶는다. PyMuPDF의 line과 같은 단위로 hasEOL에서 끊는다.
// 조각 사이는 공백 조각이 있거나 간격이 글자 크기의 20%를 넘을 때만 띄운다(작은 대문자 "M ETA GPT"가 갈라지지 않게).
export function toLines(items: PdfTextItem[]): Line[] {
	const lines: Line[] = [];
	let text = '';
	let size = 0;
	let space = false;
	let end: number | null = null;
	const flush = () => {
		if (text && size > 10) lines.push({ size, text });
		text = '';
		size = 0;
		space = false;
		end = null;
	};
	for (const item of items) {
		const str = item.str.trim();
		const [a, b, c, d, x] = item.transform;
		const itemSize = Math.hypot(c, d);
		// 세로 글자(arXiv 판의 왼쪽 여백 도장 "arXiv:2407.16741v3 [cs.SE] …")는 제목 후보에서 뺀다. 벨루와 다른 점.
		const vertical = Math.abs(b) > Math.abs(a);
		if (!str) {
			space = true;
		} else if (itemSize > 10 && !vertical) {
			const gap = end === null ? 0 : x - end;
			if (text && (space || /^\s/.test(item.str) || gap > itemSize * 0.2)) text += ' ';
			text += str;
			size = Math.max(size, itemSize);
			space = /\s$/.test(item.str);
			end = x + item.width;
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
			pages.push(content.items.flatMap((it) => ('str' in it ? [{ str: it.str, transform: it.transform, width: it.width, hasEOL: it.hasEOL }] : [])));
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

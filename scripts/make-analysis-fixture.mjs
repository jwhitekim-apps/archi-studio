// 분석 시험용 PDF 3개를 손으로 만든다(외부 라이브러리 없음, 날짜 없음 → 여러 번 실행해도 같은 바이트).
// 실행: node scripts/make-analysis-fixture.mjs
//   sample.pdf      제목 18pt 두 줄, 저자 11pt, Abstract 머리글과 문단 10pt, DOI·arXiv 줄, 1 Introduction
//   no-abstract.pdf 제목과 본문만 있고 Abstract 머리글이 없다
//   broken.pdf      PDF 머리글 뒤가 잘린 깨진 파일
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'server', 'analysis', 'fixtures');

const escape = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

// lines: [글자 크기, 텍스트, 줄 간격(앞 줄과의 거리)]
function content(lines) {
	let y = 760;
	const ops = ['BT'];
	for (const [size, text, gap = size * 1.4] of lines) {
		y -= gap;
		ops.push(`/F1 ${size} Tf`, `1 0 0 1 72 ${y.toFixed(1)} Tm`, `(${escape(text)}) Tj`);
	}
	ops.push('ET');
	return ops.join('\n');
}

function pdf(lines) {
	const stream = content(lines);
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
		`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`
	];
	let out = '%PDF-1.4\n';
	const offsets = [];
	objects.forEach((body, i) => {
		offsets.push(Buffer.byteLength(out, 'latin1'));
		out += `${i + 1} 0 obj\n${body}\nendobj\n`;
	});
	const xref = Buffer.byteLength(out, 'latin1');
	out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
	out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return Buffer.from(out, 'latin1');
}

const TITLE = [
	[18, 'Attention Is a Small Test Fixture', 40],
	[18, 'for Paper Analysis Extraction']
];
const AUTHORS = [[11, 'Jane Doe and John Roe, Example University', 24]];
const IDS = [
	[9, 'DOI: 10.1234/fixture.2026.001', 16],
	[9, 'arXiv:2601.01234v2 [cs.CL]']
];

const sample = pdf([
	...TITLE,
	...AUTHORS,
	...IDS,
	[12, 'Abstract', 28],
	[10, 'We present a tiny synthetic paper used only to test abstract extraction. The'],
	[10, 'fixture has a large title, a short author line and an abstract para-'],
	[10, 'graph that continues across several lines with a hyphenated word.'],
	[10, 'Results show that the extractor joins the lines into one paragraph.'],
	[12, '1 Introduction', 28],
	[10, 'This section must not appear in the extracted abstract text at all.']
]);

const noAbstract = pdf([
	...TITLE,
	...AUTHORS,
	[12, '1 Introduction', 28],
	[10, 'This paper has no summary heading, so the extractor returns nothing.'],
	[10, 'Only the title and these body lines are present on the first page.']
]);

const broken = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R\nthis file is truncated on purpose', 'latin1');

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'sample.pdf'), sample);
writeFileSync(join(outDir, 'no-abstract.pdf'), noAbstract);
writeFileSync(join(outDir, 'broken.pdf'), broken);
console.log(`시험용 PDF 3개를 ${outDir}에 만들었다.`);

import { describe, expect, it } from 'vitest';
import { markdownToNoteHtml, noteHtmlToMarkdown } from './convert';

const roundTrip = (md: string) => noteHtmlToMarkdown(markdownToNoteHtml(md));

describe('2.1 마크다운 왕복 변환', () => {
	const samples: [string, string][] = [
		['제목', '# 연구 질문\n\n## 방법\n\n### 세부'],
		['목록', '- 첫째 항목\n- 둘째 항목\n  - 안쪽 항목\n\n1. 번호 하나\n2. 번호 둘'],
		['코드 블록', '```\nconst x = 1;\nconsole.log(x);\n```'],
		['링크', '자세한 내용은 [논문 페이지](https://example.com/paper) 참고'],
		['한글', '이 논문은 **도시 공간**의 *보행성*을 다룬다.'],
		['빈 줄', '첫 문단입니다.\n\n둘째 문단입니다.\n\n셋째 문단입니다.']
	];
	it.each(samples)('%s: 저장 변환 후 조회 변환하면 앞뒤 공백 제거 후 같다', (_name, md) => {
		expect(roundTrip(`\n${md}\n  `)).toBe(md);
	});

	it('빈 본문과 null HTML은 빈 문자열이다', () => {
		expect(noteHtmlToMarkdown('')).toBe('');
		expect(noteHtmlToMarkdown(null)).toBe('');
	});
});

describe('2.2 폴리오가 만든 노트 HTML 읽기', () => {
	it('폴리오 marked 출력(제목, 목록, 문단)', () => {
		const html = '<h1>요약</h1>\n<ul>\n<li>가설 하나</li>\n<li>가설 둘</li>\n</ul>\n<p>결론 문단.</p>';
		expect(noteHtmlToMarkdown(html)).toBe('# 요약\n\n- 가설 하나\n- 가설 둘\n\n결론 문단.');
	});
	it('폴리오 marked 출력(코드 블록과 링크)', () => {
		const html = '<p><a href="https://example.com">출처</a></p>\n<pre><code class="language-js">let a = 1;\n</code></pre>';
		expect(noteHtmlToMarkdown(html)).toBe('[출처](https://example.com)\n\n```js\nlet a = 1;\n```');
	});
	it('Zotero 앱에서 한 번 편집해 div로 감싼 노트', () => {
		const html = '<div data-schema-version="9"><h2>메모</h2>\n<p>굵게 <strong>강조</strong>한 문장</p>\n</div>';
		expect(noteHtmlToMarkdown(html)).toBe('## 메모\n\n굵게 **강조**한 문장');
	});
});

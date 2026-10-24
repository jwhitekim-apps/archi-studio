import { describe, expect, it } from 'vitest';
import { renderMemo } from './render';

describe('renderMemo', () => {
	it('원본 HTML을 글자로 이스케이프한다', () => {
		const html = renderMemo('<script>alert(1)</script>\n\n문장 <img src=x onerror="window.__x=1"> 끝');
		expect(html).not.toMatch(/<script|<img/i);
		expect(html).toContain('&lt;script&gt;');
		expect(html).toContain('&lt;img src=x');
	});

	it('제목, 목록, 링크, 코드 블록은 서식대로 그린다', () => {
		const html = renderMemo('# 제목\n\n- 하나\n- 둘\n\n[링크](https://example.com)\n\n```\nconst a = 1;\n```');
		expect(html).toContain('<h1>제목</h1>');
		expect(html).toMatch(/<ul>\s*<li>하나<\/li>/);
		expect(html).toContain('href="https://example.com"');
		expect(html).toMatch(/<pre><code>const a = 1;/);
	});

	it('javascript: 링크는 글자만 남긴다', () => {
		const html = renderMemo('[누름](javascript:alert(1))');
		expect(html).not.toContain('href');
		expect(html).toContain('누름');
	});
});

// 메모 마크다운과 Zotero 노트 HTML 사이의 변환. 폴리오(server.js)와 같은 라이브러리와 옵션을 쓴다(design 결정 2).
import { marked } from 'marked';
import TurndownService from 'turndown';

// 기울임은 * 로 쓴다. 기본값 _ 는 "*보행성*을"처럼 한글이 바로 붙으면 다시 읽을 때 기울임이 풀린다.
const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' });

// turndown 기본 규칙은 목록 기호 뒤에 공백 3칸("-   항목")을 넣는다. 사용자가 쓴 그대로 "- 항목"이 되도록 1칸으로 바꾼다.
turndown.addRule('compactListItem', {
	filter: 'li',
	replacement(content, node) {
		const li = node as HTMLElement;
		const parent = li.parentNode as HTMLElement | null;
		let prefix = '- ';
		if (parent?.nodeName === 'OL') {
			const start = parent.getAttribute('start');
			const index = Array.prototype.indexOf.call(parent.children, li);
			prefix = `${start ? Number(start) + index : index + 1}. `;
		}
		const isParagraph = /\n$/.test(content);
		const body = content.replace(/^\n+/, '').replace(/\n+$/, '') + (isParagraph ? '\n' : '');
		return prefix + body.replace(/\n/gm, '\n' + ' '.repeat(prefix.length)) + (li.nextSibling ? '\n' : '');
	}
});

export function markdownToNoteHtml(markdown: string): string {
	return (marked.parse(markdown.trim(), { async: false }) as string).trim();
}

export function noteHtmlToMarkdown(html: string | null | undefined): string {
	if (!html) return '';
	return turndown.turndown(html).trim();
}

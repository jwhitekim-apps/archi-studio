// 메모 미리보기용 마크다운 변환(design 결정 6).
// 메모는 Zotero 노트이기도 해서 다른 곳에서 편집됐을 수 있다. 원본 HTML 토큰은 글자로 이스케이프하고,
// 링크 주소는 http(s)·mailto·스킴 없는 주소만 남겨 스크립트와 이벤트 속성이 실행되지 않게 한다.
import { Marked, type Tokens } from 'marked';

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function safeHref(href: string): string | null {
	const value = href.trim();
	if (/^(https?:|mailto:)/i.test(value)) return value;
	// 스킴이 없는 주소(상대 경로, #앵커)는 허용하고 "javascript:" 같은 다른 스킴은 막는다
	if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
	return null;
}

const marked = new Marked({
	gfm: true,
	renderer: {
		html({ text }: Tokens.HTML | Tokens.Tag) {
			return escapeHtml(text);
		},
		link({ href, title, tokens }: Tokens.Link) {
			const label = this.parser.parseInline(tokens);
			const safe = safeHref(href);
			if (safe === null) return label;
			const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
			return `<a href="${escapeHtml(safe)}"${titleAttr} rel="noopener noreferrer" target="_blank">${label}</a>`;
		},
		image({ text }: Tokens.Image) {
			// 외부 이미지 요청과 속성 주입 경로를 없애려고 대체 글자만 보인다
			return escapeHtml(text ? `[이미지: ${text}]` : '[이미지]');
		}
	}
});

export function renderMemo(markdown: string): string {
	return marked.parse(markdown || '', { async: false });
}

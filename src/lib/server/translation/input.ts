// 번역 요청 본문 확인. 순수 함수라 라우트와 서비스가 함께 쓰고 단위 시험한다.
import { UUID_PATTERN } from '../papers-mapping';

export const MAX_TEXT_LENGTH = 5000;

export type TranslationType = 'word' | 'sentence';

export type TranslateInput =
	| { ok: true; text: string; type: TranslationType; paperId: string | null }
	| { ok: false; code: 'invalid_request' | 'payload_too_large'; message: string };

const invalid = (message: string): TranslateInput => ({ ok: false, code: 'invalid_request', message });

// 공백 없는 한 토큰이면 word, 공백(줄바꿈 포함)이 하나라도 있으면 sentence. 벨루의 len(text.split()) == 1과 같다.
export function translationType(text: string): TranslationType {
	return /\s/.test(text) ? 'sentence' : 'word';
}

export function isUuid(value: string): boolean {
	return UUID_PATTERN.test(value);
}

export function parseTranslateInput(body: unknown): TranslateInput {
	if (typeof body !== 'object' || body === null || Array.isArray(body)) return invalid('요청 본문이 올바른 JSON 객체가 아닙니다.');
	const { text: rawText, paperId: rawPaperId } = body as { text?: unknown; paperId?: unknown };
	if (typeof rawText !== 'string') return invalid('text는 문자열이어야 합니다.');

	let paperId: string | null = null;
	if (rawPaperId !== undefined && rawPaperId !== null) {
		if (typeof rawPaperId !== 'string' || !isUuid(rawPaperId)) return invalid('paperId가 올바른 형식이 아닙니다.');
		paperId = rawPaperId.toLowerCase();
	}

	const text = rawText.trim();
	// 글자 수는 코드 포인트 기준(이모지 하나는 한 글자)
	const length = [...text].length;
	if (length === 0) return invalid('번역할 텍스트가 비어 있습니다.');
	if (length > MAX_TEXT_LENGTH) {
		return { ok: false, code: 'payload_too_large', message: `텍스트는 ${MAX_TEXT_LENGTH}자 이하여야 합니다.` };
	}
	return { ok: true, text, type: translationType(text), paperId };
}

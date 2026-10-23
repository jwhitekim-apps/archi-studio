// JSON 응답을 요구하는 기능(논문 분석 등)이 함께 쓰는 지시문과 파서. 벨루 ai_provider.py에서 옮겼다.
import { AiError } from './types';

export const JSON_OUTPUT_CONTRACT = `<output_contract>
반드시 JSON만 출력합니다.
마크다운, 코드펜스, 추가 설명을 출력하지 않습니다.
</output_contract>`;

// 코드 울타리나 앞뒤 설명이 섞여 있어도 첫 '{'부터 마지막 '}'까지만 잘라 읽는다.
// 오류 메시지에는 응답 원문을 넣지 않는다(논문 내용이 들어 있을 수 있다).
export function extractJson(raw: string): Record<string, unknown> {
	let text = raw.trim();
	if (text.startsWith('```')) {
		text = text.slice(3).includes('```') ? text.split('```')[1] : text.replace(/^`+|`+$/g, '');
		if (text.startsWith('json')) text = text.slice(4);
	}
	const start = text.indexOf('{');
	const end = text.lastIndexOf('}');
	if (start === -1 || end === -1 || end < start) {
		throw new AiError('ai_invalid_json', 'AI 응답에서 JSON 객체를 찾지 못했습니다.');
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text.slice(start, end + 1));
	} catch {
		throw new AiError('ai_invalid_json', 'AI 응답의 JSON을 읽지 못했습니다.');
	}
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new AiError('ai_invalid_json', 'AI 응답이 JSON 객체가 아닙니다.');
	}
	return parsed as Record<string, unknown>;
}

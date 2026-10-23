import { describe, expect, it } from 'vitest';
import { extractJson, JSON_OUTPUT_CONTRACT } from './json';
import { AiError } from './types';

describe('extractJson', () => {
	it.each<[string, string, Record<string, unknown>]>([
		['그냥 객체', '{"a":1}', { a: 1 }],
		['코드 울타리', '```json\n{"a":1}\n```', { a: 1 }],
		['언어 표시 없는 울타리', '```\n{"a":1}\n```', { a: 1 }],
		['앞뒤 설명', '결과입니다.\n{"a":"b"}\n이상입니다.', { a: 'b' }],
		['중첩 객체', '{"a":{"b":{"c":[1,2]}},"d":"}"}', { a: { b: { c: [1, 2] } }, d: '}' }]
	])('%s', (_, raw, expected) => {
		expect(extractJson(raw)).toEqual(expected);
	});

	it.each([
		['중괄호 없음', '죄송하지만 답할 수 없습니다.'],
		['깨진 JSON', '{"a": 1,, }'],
		['닫는 괄호가 앞에 있음', '} 그리고 {']
	])('%s는 ai_invalid_json이고 원문을 메시지에 넣지 않는다', (_, raw) => {
		try {
			extractJson(raw);
			expect.unreachable();
		} catch (e) {
			expect(e).toBeInstanceOf(AiError);
			expect((e as AiError).code).toBe('ai_invalid_json');
			expect((e as AiError).message).not.toContain(raw);
		}
	});

	it('JSON 출력 지시문을 제공한다', () => {
		expect(JSON_OUTPUT_CONTRACT).toContain('반드시 JSON만 출력합니다.');
	});
});

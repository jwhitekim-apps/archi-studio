import { describe, expect, it } from 'vitest';
import { MAX_TEXT_LENGTH, parseTranslateInput } from './input';

const PAPER = '0b9c5a3e-2f4d-4c1a-9e8b-7a6d5c4b3a21';

describe('parseTranslateInput', () => {
	it.each<[string, unknown, Record<string, unknown>]>([
		['한 토큰은 word', { text: 'attention' }, { ok: true, text: 'attention', type: 'word', paperId: null }],
		['여러 토큰은 sentence', { text: 'attention is all you need' }, { ok: true, type: 'sentence' }],
		['앞뒤 공백 제거', { text: '  attention \n' }, { ok: true, text: 'attention', type: 'word' }],
		['줄바꿈도 공백으로 본다', { text: 'line one\nline two' }, { ok: true, type: 'sentence' }],
		['탭도 공백으로 본다', { text: 'a\tb' }, { ok: true, type: 'sentence' }],
		['5000자는 통과', { text: 'a'.repeat(MAX_TEXT_LENGTH) }, { ok: true, type: 'word' }],
		['이모지는 한 글자로 센다', { text: '😀'.repeat(MAX_TEXT_LENGTH) }, { ok: true }],
		['paperId 포함', { text: 'x', paperId: PAPER }, { ok: true, paperId: PAPER }],
		['paperId null은 없는 것', { text: 'x', paperId: null }, { ok: true, paperId: null }],
		['빈 문자열', { text: '' }, { ok: false, code: 'invalid_request' }],
		['공백뿐', { text: ' \n\t ' }, { ok: false, code: 'invalid_request' }],
		['5001자', { text: 'a'.repeat(MAX_TEXT_LENGTH + 1) }, { ok: false, code: 'payload_too_large' }],
		['이모지 5001개', { text: '😀'.repeat(MAX_TEXT_LENGTH + 1) }, { ok: false, code: 'payload_too_large' }],
		['text가 숫자', { text: 42 }, { ok: false, code: 'invalid_request' }],
		['text 없음', {}, { ok: false, code: 'invalid_request' }],
		['본문이 배열', ['x'], { ok: false, code: 'invalid_request' }],
		['본문이 문자열', 'x', { ok: false, code: 'invalid_request' }],
		['본문이 null', null, { ok: false, code: 'invalid_request' }],
		['paperId가 uuid 아님', { text: 'x', paperId: 'abc' }, { ok: false, code: 'invalid_request' }],
		['paperId가 숫자', { text: 'x', paperId: 1 }, { ok: false, code: 'invalid_request' }]
	])('%s', (_, body, expected) => {
		expect(parseTranslateInput(body)).toMatchObject(expected);
	});

	it('paperId 형식 오류는 text 길이보다 먼저 거른다', () => {
		expect(parseTranslateInput({ text: '', paperId: 'abc' })).toMatchObject({ code: 'invalid_request', message: expect.stringContaining('paperId') });
	});
});

import { describe, expect, it } from 'vitest';
import { TRANSLATION_SYSTEM_PROMPT } from './system-prompt';

describe('번역 지시문', () => {
	it.each(['role', 'rules', 'examples', 'output'])('<%s> 구획이 있다', (tag) => {
		expect(TRANSLATION_SYSTEM_PROMPT).toContain(`<${tag}>`);
		expect(TRANSLATION_SYSTEM_PROMPT).toContain(`</${tag}>`);
	});

	it('예시 4개가 있다', () => {
		const examples = TRANSLATION_SYSTEM_PROMPT.split('<examples>')[1].split('</examples>')[0];
		expect(examples.match(/^입력: /gm)).toHaveLength(4);
		expect(examples.match(/^출력: /gm)).toHaveLength(4);
	});
});

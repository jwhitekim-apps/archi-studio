import { describe, expect, it } from 'vitest';
import { safeRedirect } from './redirect';

describe('safeRedirect', () => {
	it('같은 사이트 경로는 허용한다', () => {
		expect(safeRedirect('/library')).toBe('/library');
		expect(safeRedirect('/library?query=a')).toBe('/library?query=a');
		expect(safeRedirect('/library?query=attention&collection=K1')).toBe('/library?query=attention&collection=K1');
	});

	it.each([
		['//evil.example', '//evil.example'],
		['//evil.example/x', '//evil.example/x'],
		['/\\evil', '/\\evil'],
		['https://evil.example', 'https://evil.example'],
		['javascript:alert(1)', 'javascript:alert(1)'],
		['빈 값', ''],
		['제어 문자', '/\t/evil.example'],
		['상대 경로', 'library']
	])('%s는 /library로 바꾼다', (_name, value) => {
		expect(safeRedirect(value)).toBe('/library');
	});

	it('문자열이 아닌 값(배열, 없음)은 /library', () => {
		expect(safeRedirect(['/library', '//evil.example'])).toBe('/library');
		expect(safeRedirect(null)).toBe('/library');
		expect(safeRedirect(undefined)).toBe('/library');
	});
});

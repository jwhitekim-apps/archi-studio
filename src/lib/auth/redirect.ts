// 로그인 뒤 이동할 주소 검사. 같은 사이트 안의 경로(슬래시 하나로 시작)만 따라가고 나머지는 서재로 보낸다.
export const DEFAULT_AFTER_LOGIN = '/library';

export function safeRedirect(value: unknown): string {
	if (typeof value !== 'string' || !value.startsWith('/')) return DEFAULT_AFTER_LOGIN;
	// "//host", "/\host"는 브라우저가 다른 사이트 주소로 읽는다. 제어 문자도 같은 효과를 낼 수 있어 거른다.
	if (value.startsWith('//') || value.startsWith('/\\') || /[\u0000-\u001f\u007f]/.test(value)) return DEFAULT_AFTER_LOGIN;
	const base = 'http://same.invalid';
	try {
		const parsed = new URL(value, base);
		if (parsed.origin !== base) return DEFAULT_AFTER_LOGIN;
		return parsed.pathname + parsed.search + parsed.hash;
	} catch {
		return DEFAULT_AFTER_LOGIN;
	}
}

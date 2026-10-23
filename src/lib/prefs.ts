// 브라우저에만 저장하는 화면 설정. 저장소를 쓸 수 없으면(사생활 보호 모드, 막힌 저장소) 기본값으로 조용히 동작한다.
export function readBool(key: string, fallback: boolean): boolean {
	try {
		const value = localStorage.getItem(key);
		return value === null ? fallback : value === '1';
	} catch {
		return fallback;
	}
}

export function writeBool(key: string, value: boolean): void {
	try {
		localStorage.setItem(key, value ? '1' : '0');
	} catch {
		// 저장하지 못해도 이번 방문에서는 화면 상태로 동작한다
	}
}

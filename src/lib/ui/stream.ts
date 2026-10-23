// text/plain 조각 응답 읽기(design 결정 7). TextDecoder를 stream: true로 써서 한글 한 글자가 두 조각에 걸쳐도 깨지지 않는다.
// 도중에 끊기면 그때까지 받은 글자는 onChunk로 이미 넘어갔고, 오류는 그대로 던진다.
export async function readTextStream(response: Response, onChunk: (text: string) => void): Promise<string> {
	if (!response.body) {
		const text = await response.text();
		if (text) onChunk(text);
		return text;
	}
	const reader = response.body.getReader();
	const decoder = new TextDecoder('utf-8');
	let full = '';
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			const text = decoder.decode(value, { stream: true });
			if (text) {
				full += text;
				onChunk(text);
			}
		}
		const rest = decoder.decode();
		if (rest) {
			full += rest;
			onChunk(rest);
		}
		return full;
	} finally {
		reader.releaseLock();
	}
}

import { describe, expect, it } from 'vitest';
import { readTextStream } from './stream';

function streamOf(parts: (Uint8Array | Error)[]): Response {
	const body = new ReadableStream<Uint8Array>({
		async pull(controller) {
			const next = parts.shift();
			if (next === undefined) controller.close();
			else if (next instanceof Error) controller.error(next);
			else controller.enqueue(next);
		}
	});
	return new Response(body);
}

const bytes = (text: string) => new TextEncoder().encode(text);

describe('readTextStream', () => {
	it('한글 한 글자의 바이트가 두 조각에 걸쳐도 복원된다', async () => {
		const all = bytes('안녕하세요');
		// "안"(3바이트)의 가운데에서 자른다
		const received: string[] = [];
		const text = await readTextStream(streamOf([all.slice(0, 1), all.slice(1, 4), all.slice(4, 8), all.slice(8)]), (t) =>
			received.push(t)
		);
		expect(text).toBe('안녕하세요');
		expect(received.join('')).toBe('안녕하세요');
		expect(received.every((t) => !t.includes('�'))).toBe(true);
	});

	it('조각 순서를 지킨다', async () => {
		const received: string[] = [];
		await readTextStream(streamOf([bytes('하나 '), bytes('둘 '), bytes('셋')]), (t) => received.push(t));
		expect(received).toEqual(['하나 ', '둘 ', '셋']);
	});

	it('도중 오류가 나도 앞서 받은 글자는 넘어가 있고 오류를 던진다', async () => {
		const received: string[] = [];
		await expect(
			readTextStream(streamOf([bytes('안녕'), new Error('끊김')]), (t) => received.push(t))
		).rejects.toThrow('끊김');
		expect(received.join('')).toBe('안녕');
	});
});

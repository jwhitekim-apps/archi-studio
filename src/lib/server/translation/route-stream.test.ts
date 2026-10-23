// 라우트의 POST를 직접 불러, 모델이 다음 조각을 내기 전에 첫 조각이 이미 클라이언트에 도착하는지 본다.
import { afterEach, describe, expect, it } from 'vitest';
import { POST } from '../../../routes/api/translate/+server';
import type { AiProvider } from '../ai';
import { testHooks } from './deps';
import { memoryTranslationRepository } from './memory-repository';

afterEach(() => {
	delete testHooks.provider;
	delete testHooks.repository;
});

function call(body: unknown) {
	const request = new Request('http://localhost/api/translate', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	return POST({ locals: { user: { id: 'user-1' } }, request } as never);
}

describe('4.2 스트리밍', () => {
	it('두 번째 조각이 막혀 있어도 첫 조각이 먼저 도착한다', async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		const provider: AiProvider = {
			name: 'fake',
			complete: async () => '',
			async *stream() {
				yield '첫 조각';
				await gate;
				yield '두 번째 조각';
			}
		};
		const repo = memoryTranslationRepository();
		testHooks.provider = provider;
		testHooks.repository = repo;

		const res = await call({ text: 'a long sentence' });
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
		expect(res.headers.get('x-cache')).toBe('MISS');

		const reader = res.body!.getReader();
		const decoder = new TextDecoder();
		expect(decoder.decode((await reader.read()).value)).toBe('첫 조각');
		expect(repo.rows).toHaveLength(0);

		release();
		expect(decoder.decode((await reader.read()).value)).toBe('두 번째 조각');
		expect((await reader.read()).done).toBe(true);
		expect(repo.rows[0]).toMatchObject({ translatedText: '첫 조각두 번째 조각' });
	});

	it('64 KiB를 넘는 본문은 413', async () => {
		testHooks.repository = memoryTranslationRepository();
		const res = await call({ text: 'a'.repeat(70 * 1024) });
		expect(res.status).toBe(413);
		expect(await res.json()).toMatchObject({ error: { code: 'payload_too_large' } });
	});
});

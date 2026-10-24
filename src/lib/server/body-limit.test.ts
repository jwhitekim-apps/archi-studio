import { describe, expect, it } from 'vitest';
import { limitBody } from './api-guard';

describe('limitBody (메모 밖 경로의 512 KB 본문 한도)', () => {
	const req = (size: number, withLength: boolean) =>
		new Request('http://localhost/api/auth/login', {
			method: 'POST',
			headers: withLength ? { 'content-length': String(size) } : {},
			body: 'a'.repeat(size)
		});
	it('한도 이하는 그대로 읽힌다', async () => {
		expect((await limitBody(req(10, true), 10).text()).length).toBe(10);
	});
	it('content-length가 넘거나 실제 바이트가 넘으면 읽기가 실패한다', async () => {
		await expect(limitBody(req(11, true), 10).text()).rejects.toThrow();
		await expect(limitBody(req(11, false), 10).text()).rejects.toThrow();
	});
});

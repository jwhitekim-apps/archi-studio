import { describe, expect, it } from 'vitest';
import { errorFromStatus } from './provider';
import { MAX_RETRY_AFTER_MS, RETRY_DELAYS_MS, streamWithRetry, withRetry } from './retry';
import { AiError } from './types';

function recorder() {
	const waits: number[] = [];
	return { waits, sleep: async (ms: number) => void waits.push(ms) };
}

function failing(statuses: number[], result = 'ok') {
	let calls = 0;
	const fn = async () => {
		const status = statuses[calls++];
		if (status !== undefined) throw errorFromStatus(status);
		return result;
	};
	return { fn, calls: () => calls };
}

describe('withRetry', () => {
	it('429 한 번 뒤 성공하면 결과를 돌려준다', async () => {
		const { waits, sleep } = recorder();
		const { fn, calls } = failing([429]);
		expect(await withRetry(fn, { sleep })).toBe('ok');
		expect(calls()).toBe(2);
		expect(waits).toEqual([RETRY_DELAYS_MS[0]]);
	});

	it('5xx 세 번 연속이면 ai_unavailable', async () => {
		const { waits, sleep } = recorder();
		const { fn, calls } = failing([500, 502, 503]);
		await expect(withRetry(fn, { sleep })).rejects.toMatchObject({ code: 'ai_unavailable' });
		expect(calls()).toBe(3);
		expect(waits).toEqual(RETRY_DELAYS_MS);
	});

	it('429만 세 번이면 ai_rate_limited', async () => {
		const { sleep } = recorder();
		const { fn } = failing([429, 429, 429]);
		await expect(withRetry(fn, { sleep })).rejects.toMatchObject({ code: 'ai_rate_limited' });
	});

	it('400은 다시 시도하지 않는다', async () => {
		const { waits, sleep } = recorder();
		const { fn, calls } = failing([400]);
		await expect(withRetry(fn, { sleep })).rejects.toMatchObject({ code: 'ai_unavailable', retryable: false });
		expect(calls()).toBe(1);
		expect(waits).toEqual([]);
	});

	it('Retry-After는 존중하되 5초로 자른다', async () => {
		const { waits, sleep } = recorder();
		let calls = 0;
		const fn = async () => {
			calls++;
			if (calls === 1) throw errorFromStatus(429, 2000);
			if (calls === 2) throw errorFromStatus(429, 60_000);
			return 'ok';
		};
		expect(await withRetry(fn, { sleep })).toBe('ok');
		expect(waits).toEqual([2000, MAX_RETRY_AFTER_MS]);
	});

	it('AiError가 아닌 실패는 ai_unavailable로 바꾼다', async () => {
		await expect(withRetry(async () => { throw new Error('boom'); })).rejects.toMatchObject({ code: 'ai_unavailable' });
	});

	it('취소된 요청은 다시 시도하지 않는다', async () => {
		const { waits, sleep } = recorder();
		const controller = new AbortController();
		controller.abort();
		const { fn } = failing([503]);
		await expect(withRetry(fn, { sleep, signal: controller.signal })).rejects.toBeInstanceOf(AiError);
		expect(waits).toEqual([]);
	});
});

async function collect(source: AsyncIterable<string>): Promise<string[]> {
	const out: string[] = [];
	for await (const chunk of source) out.push(chunk);
	return out;
}

describe('streamWithRetry', () => {
	it('첫 조각 전 실패는 다시 시도한다', async () => {
		const { sleep } = recorder();
		let opens = 0;
		const open = async function* () {
			opens++;
			if (opens === 1) throw errorFromStatus(503);
			yield '안';
			yield '녕';
		};
		expect(await collect(streamWithRetry(open, { sleep }))).toEqual(['안', '녕']);
		expect(opens).toBe(2);
	});

	it('첫 조각 뒤 실패는 다시 시도하지 않고 ai_unavailable', async () => {
		const { waits, sleep } = recorder();
		let opens = 0;
		const open = async function* () {
			opens++;
			yield '안';
			throw errorFromStatus(429);
		};
		const out: string[] = [];
		await expect(
			(async () => {
				for await (const c of streamWithRetry(open, { sleep })) out.push(c);
			})()
		).rejects.toMatchObject({ code: 'ai_unavailable' });
		expect(out).toEqual(['안']);
		expect(opens).toBe(1);
		expect(waits).toEqual([]);
	});
});

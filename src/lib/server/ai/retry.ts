// 일시적 실패(429, 5xx, 연결 실패)만 두 번까지 다시 시도한다. 대기 함수는 시험에서 바꿔 끼운다.
import { AiError } from './types';

export type Sleep = (ms: number) => Promise<void>;

export const RETRY_DELAYS_MS = [500, 1500];
export const MAX_RETRY_AFTER_MS = 5000;

export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export interface RetryOptions {
	sleep?: Sleep;
	signal?: AbortSignal;
}

function delayFor(err: AiError, attempt: number): number {
	if (err.retryAfterMs !== undefined) return Math.min(Math.max(err.retryAfterMs, 0), MAX_RETRY_AFTER_MS);
	return RETRY_DELAYS_MS[attempt];
}

function canRetry(err: AiError, attempt: number, signal: AbortSignal | undefined): boolean {
	return err.retryable && attempt < RETRY_DELAYS_MS.length && !signal?.aborted;
}

function asAiError(err: unknown): AiError {
	return err instanceof AiError ? err : new AiError('ai_unavailable', 'AI 제공자 호출에 실패했습니다.');
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
	const sleep = options.sleep ?? realSleep;
	for (let attempt = 0; ; attempt++) {
		try {
			return await fn();
		} catch (e) {
			const err = asAiError(e);
			if (!canRetry(err, attempt, options.signal)) throw err;
			await sleep(delayFor(err, attempt));
		}
	}
}

// 첫 조각을 내보낸 뒤의 실패는 다시 시도하지 않는다(같은 글자가 중복되기 때문이다).
export async function* streamWithRetry(
	open: () => AsyncIterable<string>,
	options: RetryOptions = {}
): AsyncGenerator<string> {
	const sleep = options.sleep ?? realSleep;
	for (let attempt = 0; ; attempt++) {
		let yielded = false;
		try {
			for await (const chunk of open()) {
				yielded = true;
				yield chunk;
			}
			return;
		} catch (e) {
			const err = asAiError(e);
			if (yielded) {
				throw err.code === 'ai_unavailable' ? err : new AiError('ai_unavailable', '스트리밍 도중 연결이 끊겼습니다.', { status: err.status });
			}
			if (!canRetry(err, attempt, options.signal)) throw err;
			await sleep(delayFor(err, attempt));
		}
	}
}

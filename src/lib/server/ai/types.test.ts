import { describe, expect, it } from 'vitest';
import { AI_ERROR_CODES, AiError } from './types';

describe('AiError', () => {
	it.each(AI_ERROR_CODES)('%s 코드로 만들 수 있고 instanceof로 구분된다', (code) => {
		const err = new AiError(code, '메시지');
		expect(err).toBeInstanceOf(AiError);
		expect(err).toBeInstanceOf(Error);
		expect(err.code).toBe(code);
		expect(err.retryable).toBe(false);
		expect(err.message).toBe('메시지');
	});

	it('일반 Error는 AiError가 아니다', () => {
		expect(new Error('x')).not.toBeInstanceOf(AiError);
	});

	it('재시도 여부를 지정할 수 있다', () => {
		expect(new AiError('ai_rate_limited', 'x', { retryable: true }).retryable).toBe(true);
	});
});

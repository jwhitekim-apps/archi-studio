// 시험용 가짜 제공자. 번역·분석 change의 라우트 시험이 getAiProvider 대신 넣어 쓴다. 네트워크를 쓰지 않는다.
import { AiError, type AiErrorCode, type AiProvider, type AiRequest } from './types';

export interface FakeProviderOptions {
	// complete가 차례로 돌려줄 응답. 다 쓰면 마지막 값을 계속 돌려준다.
	responses?: string[];
	// stream이 내보낼 조각
	chunks?: string[];
	// 지정하면 complete와 stream이 이 오류를 던진다
	error?: AiErrorCode | AiError;
}

export interface FakeProvider extends AiProvider {
	readonly calls: { method: 'complete' | 'stream'; request: AiRequest }[];
}

export function createFakeProvider(options: FakeProviderOptions = {}): FakeProvider {
	const calls: FakeProvider['calls'] = [];
	const responses = options.responses ?? [''];
	let index = 0;
	const fail = () => {
		const { error } = options;
		if (!error) return;
		throw error instanceof AiError ? error : new AiError(error, `가짜 제공자 오류: ${error}`);
	};

	return {
		name: 'fake',
		calls,
		async complete(request) {
			calls.push({ method: 'complete', request });
			fail();
			const text = responses[Math.min(index++, responses.length - 1)];
			return text.trim();
		},
		async *stream(request) {
			calls.push({ method: 'stream', request });
			fail();
			for (const chunk of options.chunks ?? []) {
				if (request.signal?.aborted) return;
				if (chunk) yield chunk;
			}
		}
	};
}

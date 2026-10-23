// 번역 스트림 요청(design 결정 2). 응답이 2xx가 아니면 ApiError, 읽는 도중 끊기면 StreamInterrupted, 취소는 AbortError다.
import { ApiError, toApiError } from '$lib/api/client';
import { readTextStream } from '$lib/ui/stream';

export const MAX_TRANSLATE_CHARS = 5000;

export class StreamInterrupted extends Error {
	constructor(readonly partial: string) {
		super('번역 스트림이 도중에 끊겼습니다.');
		this.name = 'StreamInterrupted';
	}
}

export interface TranslationResult {
	text: string;
	cache: 'HIT' | 'MISS' | null;
}

export async function startTranslation(
	input: { text: string; paperId?: string | null },
	signal: AbortSignal,
	onChunk: (chunk: string) => void,
	fetcher: typeof fetch = fetch
): Promise<TranslationResult> {
	const body: { text: string; paperId?: string } = { text: input.text };
	if (input.paperId) body.paperId = input.paperId;
	let response: Response;
	try {
		response = await fetcher('/api/translate', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
			signal
		});
	} catch (cause) {
		if (signal.aborted || (cause as Error)?.name === 'AbortError') throw abortError();
		throw new ApiError(0, 'network_error', '');
	}
	if (!response.ok) throw await toApiError(response);

	let received = '';
	try {
		const text = await readTextStream(response, (chunk) => {
			received += chunk;
			onChunk(chunk);
		});
		const cache = response.headers.get('x-cache');
		return { text, cache: cache === 'HIT' || cache === 'MISS' ? cache : null };
	} catch (cause) {
		if (signal.aborted || (cause as Error)?.name === 'AbortError') throw abortError();
		throw new StreamInterrupted(received);
	}
}

function abortError(): DOMException {
	return new DOMException('번역을 중지했습니다.', 'AbortError');
}

export function isAbortError(error: unknown): boolean {
	return (error as Error | null)?.name === 'AbortError';
}

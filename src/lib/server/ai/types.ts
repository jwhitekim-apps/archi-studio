// 공용 AI 호출 계층의 인터페이스. 벨루 ai_provider.py의 AIProvider를 옮겼다(이미지 입력은 제외).

export const AI_TIERS = ['fast', 'smart'] as const;
export type AiTier = (typeof AI_TIERS)[number];

export type AiPurpose = 'translation' | 'analysis';

export const AI_PROVIDER_NAMES = ['claude', 'gemini', 'local'] as const;
export type AiProviderName = (typeof AI_PROVIDER_NAMES)[number];

export interface AiRequest {
	system?: string;
	user: string;
	maxTokens: number;
	// 기본값: complete는 fast, stream은 smart(벨루와 같다)
	tier?: AiTier;
	signal?: AbortSignal;
}

export interface AiProvider {
	readonly name: AiProviderName | 'fake';
	complete(req: AiRequest): Promise<string>;
	stream(req: AiRequest): AsyncIterable<string>;
}

export const AI_ERROR_CODES = [
	'ai_not_configured',
	'ai_unavailable',
	'ai_rate_limited',
	'ai_empty_response',
	'ai_invalid_json'
] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

export interface AiErrorOptions {
	retryable?: boolean;
	// 제공자가 돌려준 HTTP 상태(없으면 연결 실패). 로그에만 쓴다.
	status?: number;
	retryAfterMs?: number;
	finishReason?: string;
}

// 메시지에는 키 값, 프롬프트, 모델 응답을 넣지 않는다.
export class AiError extends Error {
	readonly retryable: boolean;
	readonly status: number | undefined;
	readonly retryAfterMs: number | undefined;
	readonly finishReason: string | undefined;

	constructor(
		readonly code: AiErrorCode,
		message: string,
		options: AiErrorOptions = {}
	) {
		super(message);
		this.name = 'AiError';
		this.retryable = options.retryable ?? false;
		this.status = options.status;
		this.retryAfterMs = options.retryAfterMs;
		this.finishReason = options.finishReason;
	}
}

// 제공자 공통 동작: 등급 → 모델, 오류 코드 변환, 재시도, 공백 제거와 빈 응답 검사, 빈 조각 건너뛰기, 로깅.
// 각 제공자는 한 번의 요청(completeOnce, streamOnce)만 구현한다.
import { modelForTier, type AiModels } from './config';
import { defaultAiLogger, type AiLogger } from './log';
import { streamWithRetry, withRetry, type Sleep } from './retry';
import { AiError, type AiProvider, type AiProviderName, type AiRequest, type AiTier } from './types';

export interface ProviderDeps {
	logger?: AiLogger;
	sleep?: Sleep;
	now?: () => number;
}

export interface ResolvedRequest {
	system: string;
	user: string;
	maxTokens: number;
	model: string;
	signal?: AbortSignal;
}

export interface RawCompletion {
	text: string;
	finishReason?: string;
}

// 429는 호출 제한, 408·5xx는 일시적 실패, 그 밖의 4xx(형식 오류, 키 거부, 없는 모델)는 다시 시도하지 않는다.
export function errorFromStatus(status: number, retryAfterMs?: number): AiError {
	if (status === 429) {
		return new AiError('ai_rate_limited', 'AI 제공자의 호출 제한을 넘었습니다.', { retryable: true, status, retryAfterMs });
	}
	const retryable = status === 408 || status >= 500;
	return new AiError('ai_unavailable', `AI 제공자가 요청을 처리하지 못했습니다 (HTTP ${status}).`, {
		retryable,
		status,
		retryAfterMs: retryable ? retryAfterMs : undefined
	});
}

export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
	if (!value) return undefined;
	const seconds = Number(value);
	if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
	const date = Date.parse(value);
	return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

interface ErrorLike {
	status?: unknown;
	headers?: { get?: (name: string) => string | null } | Record<string, string>;
}

function retryAfterOf(headers: ErrorLike['headers']): string | null | undefined {
	if (!headers) return undefined;
	if (typeof headers.get === 'function') return headers.get('retry-after');
	return (headers as Record<string, string>)['retry-after'];
}

// SDK 오류는 모양(status, headers)만 보고 바꾼다. 원래 메시지는 키나 요청 내용을 담을 수 있어 버린다.
export function toAiError(err: unknown, signal?: AbortSignal): AiError {
	if (err instanceof AiError) return err;
	if (signal?.aborted) return new AiError('ai_unavailable', 'AI 요청이 취소되었습니다.');
	const { status, headers } = (err ?? {}) as ErrorLike;
	if (typeof status === 'number') return errorFromStatus(status, parseRetryAfter(retryAfterOf(headers)));
	return new AiError('ai_unavailable', 'AI 제공자에 연결하지 못했습니다.', { retryable: true });
}

export abstract class BaseProvider implements AiProvider {
	abstract readonly name: AiProviderName;

	constructor(
		protected readonly models: AiModels,
		protected readonly deps: ProviderDeps = {}
	) {}

	protected abstract completeOnce(req: ResolvedRequest): Promise<RawCompletion>;
	protected abstract streamOnce(req: ResolvedRequest): AsyncIterable<string>;

	private resolve(req: AiRequest, tier: AiTier): ResolvedRequest {
		return {
			system: req.system ?? '',
			user: req.user,
			maxTokens: req.maxTokens,
			model: modelForTier(this.models, tier),
			signal: req.signal
		};
	}

	private log(tier: AiTier, started: number, err?: AiError): void {
		const now = this.deps.now ?? Date.now;
		(this.deps.logger ?? defaultAiLogger)({
			provider: this.name,
			tier,
			ms: now() - started,
			ok: !err,
			...(err && { code: err.code }),
			...(err?.status !== undefined && { status: err.status }),
			...(err?.finishReason !== undefined && { finishReason: err.finishReason })
		});
	}

	async complete(req: AiRequest): Promise<string> {
		const tier = req.tier ?? 'fast';
		const started = (this.deps.now ?? Date.now)();
		try {
			const resolved = this.resolve(req, tier);
			const result = await withRetry(
				async () => {
					try {
						return await this.completeOnce(resolved);
					} catch (e) {
						throw toAiError(e, req.signal);
					}
				},
				{ sleep: this.deps.sleep, signal: req.signal }
			);
			const text = result.text.trim();
			if (!text) {
				throw new AiError(
					'ai_empty_response',
					`AI 응답이 비어 있습니다 (종료 이유: ${result.finishReason ?? '알 수 없음'}). 출력 길이 부족이나 안전 필터 차단일 수 있습니다.`,
					{ finishReason: result.finishReason }
				);
			}
			this.log(tier, started);
			return text;
		} catch (e) {
			const err = toAiError(e, req.signal);
			this.log(tier, started, err);
			throw err;
		}
	}

	private async *mapStream(source: AsyncIterable<string>, signal?: AbortSignal): AsyncGenerator<string> {
		try {
			for await (const chunk of source) {
				if (chunk) yield chunk;
			}
		} catch (e) {
			throw toAiError(e, signal);
		}
	}

	// 호출자가 취소하면 오류 없이 끝낸다. 반복을 멈추면 아래 단계의 SDK 스트림도 닫힌다.
	async *stream(req: AiRequest): AsyncGenerator<string> {
		const tier = req.tier ?? 'smart';
		const started = (this.deps.now ?? Date.now)();
		let failure: AiError | undefined;
		try {
			const resolved = this.resolve(req, tier);
			const chunks = streamWithRetry(() => this.mapStream(this.streamOnce(resolved), req.signal), {
				sleep: this.deps.sleep,
				signal: req.signal
			});
			for await (const chunk of chunks) {
				if (req.signal?.aborted) break;
				yield chunk;
			}
		} catch (e) {
			if (req.signal?.aborted) return;
			failure = toAiError(e, req.signal);
			throw failure;
		} finally {
			this.log(tier, started, failure);
		}
	}
}

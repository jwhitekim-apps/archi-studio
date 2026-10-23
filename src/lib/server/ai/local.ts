// 학교 서버의 로컬 모델(OpenAI 호환 chat/completions). SDK 없이 fetch로 부른다.
// https만 쓰고 인증서 검증은 끄지 않는다. 자체 서명 인증서는 실행 환경의 NODE_EXTRA_CA_CERTS로 신뢰한다.
import type { AiModels } from './config';
import {
	BaseProvider,
	errorFromStatus,
	parseRetryAfter,
	type ProviderDeps,
	type RawCompletion,
	type ResolvedRequest,
	type StreamMeta
} from './provider';
import { AiError } from './types';

export interface LocalProviderOptions {
	baseUrl: string;
	apiKey: string | undefined;
	models: AiModels;
	fetch?: typeof fetch;
}

interface ChatCompletion {
	choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
}

interface ChatCompletionChunk {
	choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
}

export class LocalProvider extends BaseProvider {
	readonly name = 'local' as const;
	private readonly baseUrl: string;
	private readonly apiKey: string | undefined;
	private readonly fetchFn: typeof fetch;

	constructor(options: LocalProviderOptions, deps: ProviderDeps = {}) {
		super(options.models, deps);
		if (!options.baseUrl.startsWith('https://')) {
			throw new AiError('ai_not_configured', 'LOCAL_LLM_BASE_URL은 https:// 주소여야 합니다.');
		}
		this.baseUrl = options.baseUrl.replace(/\/+$/, '');
		this.apiKey = options.apiKey;
		this.fetchFn = options.fetch ?? fetch;
	}

	private async post(req: ResolvedRequest, stream: boolean): Promise<Response> {
		const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(this.apiKey && { authorization: `Bearer ${this.apiKey}` })
			},
			body: JSON.stringify({
				model: req.model,
				max_tokens: req.maxTokens,
				stream,
				messages: [...(req.system.trim() ? [{ role: 'system', content: req.system }] : []), { role: 'user', content: req.user }]
			}),
			signal: req.signal
		});
		if (!res.ok) {
			await res.body?.cancel().catch(() => {});
			throw errorFromStatus(res.status, parseRetryAfter(res.headers.get('retry-after')));
		}
		return res;
	}

	protected async completeOnce(req: ResolvedRequest): Promise<RawCompletion> {
		const res = await this.post(req, false);
		let body: ChatCompletion;
		try {
			body = (await res.json()) as ChatCompletion;
		} catch {
			throw new AiError('ai_unavailable', '로컬 모델 응답을 읽지 못했습니다.');
		}
		const choice = body.choices?.[0];
		return { text: choice?.message?.content ?? '', finishReason: choice?.finish_reason ?? undefined };
	}

	// 서버가 보내는 이벤트(SSE)를 줄 단위로 읽는다. 한 줄이 여러 덩어리로 쪼개져 와도 이어 붙인다.
	protected async *streamOnce(req: ResolvedRequest, meta: StreamMeta): AsyncIterable<string> {
		const res = await this.post(req, true);
		if (!res.body) throw new AiError('ai_unavailable', '로컬 모델 응답 본문이 없습니다.', { retryable: true });
		const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
		let buffer = '';
		try {
			for (;;) {
				const { value, done } = await reader.read();
				if (done) break;
				buffer += value;
				let newline: number;
				while ((newline = buffer.indexOf('\n')) !== -1) {
					const line = buffer.slice(0, newline).trim();
					buffer = buffer.slice(newline + 1);
					if (!line.startsWith('data:')) continue;
					const data = line.slice(5).trim();
					if (data === '[DONE]') return;
					let chunk: ChatCompletionChunk;
					try {
						chunk = JSON.parse(data) as ChatCompletionChunk;
					} catch {
						throw new AiError('ai_unavailable', '로컬 모델 스트림을 읽지 못했습니다.');
					}
					const finishReason = chunk.choices?.[0]?.finish_reason;
					if (finishReason) meta.finishReason = finishReason;
					const text = chunk.choices?.[0]?.delta?.content;
					if (text) yield text;
				}
			}
		} finally {
			await reader.cancel().catch(() => {});
		}
	}
}

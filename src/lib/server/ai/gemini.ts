// Gemini 제공자(@google/genai). 재시도는 공용 계층이 하므로 SDK 재시도는 한 번(재시도 없음)으로 둔다.
import { GoogleGenAI } from '@google/genai';
import type { AiModels } from './config';
import { BaseProvider, type ProviderDeps, type RawCompletion, type ResolvedRequest, type StreamMeta } from './provider';

interface GeminiParams {
	model: string;
	contents: string;
	config: { maxOutputTokens: number; systemInstruction?: string; abortSignal?: AbortSignal };
}

interface GeminiResponse {
	text?: string;
	candidates?: { finishReason?: string }[];
}

// 실제 SDK의 models, 또는 시험용으로 같은 모양을 가진 가짜
export interface GeminiClient {
	models: {
		generateContent(params: GeminiParams): Promise<GeminiResponse>;
		generateContentStream(params: GeminiParams): Promise<AsyncIterable<GeminiResponse>>;
	};
}

export function createGeminiClient(apiKey: string): GeminiClient {
	return new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
}

export class GeminiProvider extends BaseProvider {
	readonly name = 'gemini' as const;

	constructor(
		private readonly client: GeminiClient,
		models: AiModels,
		deps: ProviderDeps = {}
	) {
		super(models, deps);
	}

	private params(req: ResolvedRequest): GeminiParams {
		return {
			model: req.model,
			contents: req.user,
			config: {
				maxOutputTokens: req.maxTokens,
				...(req.system.trim() && { systemInstruction: req.system }),
				...(req.signal && { abortSignal: req.signal })
			}
		};
	}

	// 안전 필터 차단이나 출력 길이 부족이면 예외 없이 빈 응답이 온다. 종료 이유를 넘겨 빈 응답 오류에 남긴다.
	protected async completeOnce(req: ResolvedRequest): Promise<RawCompletion> {
		const response = await this.client.models.generateContent(this.params(req));
		return { text: response.text ?? '', finishReason: response.candidates?.[0]?.finishReason };
	}

	protected async *streamOnce(req: ResolvedRequest, meta: StreamMeta): AsyncIterable<string> {
		const chunks = await this.client.models.generateContentStream(this.params(req));
		for await (const chunk of chunks) {
			const finishReason = chunk.candidates?.[0]?.finishReason;
			if (finishReason) meta.finishReason = finishReason;
			if (chunk.text) yield chunk.text;
		}
	}
}

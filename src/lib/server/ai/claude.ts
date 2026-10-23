// Claude 제공자(@anthropic-ai/sdk). 재시도는 공용 계층이 하므로 SDK 자체 재시도는 끈다.
import Anthropic from '@anthropic-ai/sdk';
import type { AiModels } from './config';
import { BaseProvider, type ProviderDeps, type RawCompletion, type ResolvedRequest } from './provider';

interface ClaudeParams {
	model: string;
	max_tokens: number;
	system?: string;
	messages: { role: 'user'; content: string }[];
	stream?: boolean;
}

// 실제 SDK 클라이언트, 또는 시험용으로 같은 모양을 가진 가짜
export interface ClaudeClient {
	messages: {
		create(params: ClaudeParams, options?: { signal?: AbortSignal }): PromiseLike<unknown>;
	};
}

interface ClaudeMessage {
	content?: { type: string; text?: string }[];
	stop_reason?: string | null;
}

interface ClaudeStreamEvent {
	type: string;
	delta?: { type?: string; text?: string };
}

export function createClaudeClient(apiKey: string): ClaudeClient {
	return new Anthropic({ apiKey, maxRetries: 0 });
}

export class ClaudeProvider extends BaseProvider {
	readonly name = 'claude' as const;

	constructor(
		private readonly client: ClaudeClient,
		models: AiModels,
		deps: ProviderDeps = {}
	) {
		super(models, deps);
	}

	private params(req: ResolvedRequest): ClaudeParams {
		return {
			model: req.model,
			max_tokens: req.maxTokens,
			...(req.system.trim() && { system: req.system }),
			messages: [{ role: 'user', content: req.user }]
		};
	}

	protected async completeOnce(req: ResolvedRequest): Promise<RawCompletion> {
		const message = (await this.client.messages.create(this.params(req), { signal: req.signal })) as ClaudeMessage;
		const text = (message.content ?? [])
			.filter((block) => block.type === 'text')
			.map((block) => block.text ?? '')
			.join('');
		return { text, finishReason: message.stop_reason ?? undefined };
	}

	protected async *streamOnce(req: ResolvedRequest): AsyncIterable<string> {
		const events = (await this.client.messages.create(
			{ ...this.params(req), stream: true },
			{ signal: req.signal }
		)) as AsyncIterable<ClaudeStreamEvent>;
		for await (const event of events) {
			if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
				yield event.delta.text;
			}
		}
	}
}

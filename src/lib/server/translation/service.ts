// 번역 흐름(archi-studio-translation 결정 2, 4, 5). 모델 호출과 DB 접근은 주입받아 네트워크 없이 시험한다.
import { AiError, type AiProvider } from '../ai';
import type { TranslationType } from './input';
import type { TranslationRepository } from './repository';
import { TRANSLATION_SYSTEM_PROMPT } from './system-prompt';

export const TRANSLATION_MAX_TOKENS = 4096;

export interface TranslateDeps {
	repo: TranslationRepository;
	// 설정이 없으면 AiError('ai_not_configured')를 던진다
	provider: () => AiProvider;
	// 오류 이름만 받는다. 원문, 번역문, 키는 넘기지 않는다.
	log?: (event: string, name: string) => void;
}

export interface TranslateRequest {
	userId: string;
	text: string;
	type: TranslationType;
	paperId: string | null;
}

export type TranslateResult =
	| { kind: 'error'; status: 404 | 502 | 503; code: 'paper_not_found' | 'ai_unavailable' | 'ai_not_configured' }
	| { kind: 'stream'; cache: 'HIT' | 'MISS'; body: ReadableStream<Uint8Array> };

const defaultLog = (event: string, name: string) => console.error(`[translate] ${event}`, name);

const errorName = (err: unknown) => (err instanceof AiError ? err.code : err instanceof Error ? err.name : 'unknown');

function aiFailure(err: unknown): TranslateResult {
	if (!(err instanceof AiError)) throw err;
	return err.code === 'ai_not_configured'
		? { kind: 'error', status: 503, code: 'ai_not_configured' }
		: { kind: 'error', status: 502, code: 'ai_unavailable' };
}

export async function translate(deps: TranslateDeps, req: TranslateRequest): Promise<TranslateResult> {
	const log = deps.log ?? defaultLog;
	const encoder = new TextEncoder();
	const save = async (translatedText: string) => {
		try {
			await deps.repo.saveTranslation({ userId: req.userId, paperId: req.paperId, sourceText: req.text, translatedText, type: req.type });
		} catch (err) {
			log('이력 저장 실패', errorName(err));
		}
	};

	if (req.paperId && !(await deps.repo.ownsPaper(req.userId, req.paperId))) {
		return { kind: 'error', status: 404, code: 'paper_not_found' };
	}

	// 조회가 실패하면 새로 번역한다(벨루와 같다).
	let saved = null;
	try {
		saved = await deps.repo.findTranslation(req.userId, req.text, req.paperId);
	} catch (err) {
		log('저장된 번역 조회 실패', errorName(err));
	}
	if (saved) {
		// 같은 원문을 다른 논문에서 요청하면 그 논문의 이력 행을 새로 만든다. paperId가 없으면 만들지 않는다.
		if (req.paperId && !saved.paperLinked) await save(saved.translatedText);
		const text = saved.translatedText;
		return {
			kind: 'stream',
			cache: 'HIT',
			body: new ReadableStream({
				start(controller) {
					controller.enqueue(encoder.encode(text));
					controller.close();
				}
			})
		};
	}

	// 첫 글자를 받은 뒤에 응답을 만든다. 그래야 첫 글자 전 실패를 JSON 오류로 돌려줄 수 있다.
	const abort = new AbortController();
	let chunks: AsyncIterator<string>;
	let first: IteratorResult<string>;
	try {
		const provider = deps.provider();
		chunks = provider
			.stream({ system: TRANSLATION_SYSTEM_PROMPT, user: req.text, maxTokens: TRANSLATION_MAX_TOKENS, tier: 'smart', signal: abort.signal })
			[Symbol.asyncIterator]();
		first = await chunks.next();
	} catch (err) {
		log('번역 시작 실패', errorName(err));
		return aiFailure(err);
	}
	if (first.done) {
		log('번역 시작 실패', 'ai_empty_response');
		return { kind: 'error', status: 502, code: 'ai_unavailable' };
	}

	const collected: string[] = [first.value];
	let cancelled = false;
	return {
		kind: 'stream',
		cache: 'MISS',
		body: new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode(first.value));
			},
			async pull(controller) {
				let next: IteratorResult<string>;
				try {
					next = await chunks.next();
				} catch (err) {
					if (cancelled) return;
					// 도중 실패: 오류로 끝내고 저장하지 않는다. 오류 문장을 본문에 섞지 않는다.
					log('번역 도중 실패', errorName(err));
					controller.error(err);
					return;
				}
				if (cancelled) return;
				if (next.done) {
					// 저장이 끝난 뒤에 닫는다. 저장이 실패해도 이미 보낸 번역은 그대로 끝낸다.
					await save(collected.join(''));
					controller.close();
					return;
				}
				collected.push(next.value);
				controller.enqueue(encoder.encode(next.value));
			},
			// 요청자가 연결을 끊으면 모델 호출을 멈추고 저장하지 않는다.
			async cancel() {
				cancelled = true;
				abort.abort();
				await chunks.return?.().catch(() => undefined);
			}
		})
	};
}

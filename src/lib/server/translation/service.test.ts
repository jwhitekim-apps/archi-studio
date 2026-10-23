import { describe, expect, it } from 'vitest';
import { AiError, createFakeProvider, type AiProvider, type AiRequest } from '../ai';
import { memoryTranslationRepository } from './memory-repository';
import { translate, TRANSLATION_MAX_TOKENS, type TranslateDeps, type TranslateRequest, type TranslateResult } from './service';
import { TRANSLATION_SYSTEM_PROMPT } from './system-prompt';

const USER = 'user-1';
const PAPER_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const PAPER_B = 'aaaaaaaa-0000-4000-8000-000000000002';

const req = (text: string, paperId: string | null = null): TranslateRequest => ({
	userId: USER,
	text,
	type: /\s/.test(text) ? 'sentence' : 'word',
	paperId
});

// 호출 횟수와 요청을 세는 제공자. script가 조각 순서와 실패 지점을 정한다.
function scripted(script: { chunks?: string[]; failBefore?: AiError; failAfter?: number; hang?: boolean }) {
	const state = { calls: 0, requests: [] as AiRequest[], aborted: false, returned: false };
	const provider: AiProvider = {
		name: 'fake',
		complete: async () => '',
		async *stream(request) {
			state.calls++;
			state.requests.push(request);
			request.signal?.addEventListener('abort', () => (state.aborted = true));
			try {
				if (script.failBefore) throw script.failBefore;
				const chunks = script.chunks ?? [];
				for (let i = 0; i < chunks.length; i++) {
					if (script.failAfter === i) throw new AiError('ai_unavailable', '끊김');
					yield chunks[i];
				}
				if (script.hang) await new Promise<void>((resolve) => request.signal?.addEventListener('abort', () => resolve()));
			} finally {
				state.returned = true;
			}
		}
	};
	return { provider, state };
}

function setup(provider: AiProvider) {
	const repo = memoryTranslationRepository();
	repo.papers.push({ userId: USER, paperId: PAPER_A }, { userId: USER, paperId: PAPER_B });
	const logs: [string, string][] = [];
	const deps: TranslateDeps = { repo, provider: () => provider, log: (e, n) => logs.push([e, n]) };
	return { repo, deps, logs };
}

async function readAll(result: TranslateResult): Promise<{ chunks: string[]; error?: unknown }> {
	if (result.kind !== 'stream') throw new Error(`stream이 아니다: ${JSON.stringify(result)}`);
	const reader = result.body.getReader();
	const decoder = new TextDecoder();
	const chunks: string[] = [];
	try {
		for (;;) {
			const { value, done } = await reader.read();
			if (done) return { chunks };
			chunks.push(decoder.decode(value));
		}
	} catch (error) {
		return { chunks, error };
	}
}

describe('3.1 새 번역과 저장된 번역', () => {
	it('새 번역은 모델을 1번 부르고 조각을 이어 붙여 저장한다', async () => {
		const { provider, state } = scripted({ chunks: ['트랜스', '포머'] });
		const { repo, deps } = setup(provider);
		const result = await translate(deps, req('transformer'));
		expect(result).toMatchObject({ kind: 'stream', cache: 'MISS' });
		expect((await readAll(result)).chunks).toEqual(['트랜스', '포머']);
		expect(state.calls).toBe(1);
		expect(state.requests[0]).toMatchObject({ system: TRANSLATION_SYSTEM_PROMPT, user: 'transformer', maxTokens: TRANSLATION_MAX_TOKENS, tier: 'smart' });
		expect(repo.rows).toMatchObject([{ userId: USER, sourceText: 'transformer', translatedText: '트랜스포머', type: 'word', paperId: null }]);
	});

	it('같은 원문을 다시 요청하면 모델을 부르지 않고 같은 번역문을 돌려준다', async () => {
		const { provider, state } = scripted({ chunks: ['어텐션', '(attention)'] });
		const { repo, deps } = setup(provider);
		await readAll(await translate(deps, req('attention')));
		const again = await translate(deps, req('attention'));
		expect(again).toMatchObject({ kind: 'stream', cache: 'HIT' });
		expect((await readAll(again)).chunks.join('')).toBe('어텐션(attention)');
		expect(state.calls).toBe(1);
		expect(repo.rows).toHaveLength(1);
	});

	it('가져다 쓰는 가짜 제공자(createFakeProvider)로도 같은 흐름이 된다', async () => {
		const { repo, deps } = setup(createFakeProvider({ chunks: ['안', '녕'] }));
		expect((await readAll(await translate(deps, req('hello there')))).chunks).toEqual(['안', '녕']);
		expect(repo.rows[0]).toMatchObject({ translatedText: '안녕', type: 'sentence' });
	});
});

describe('3.2 저장된 번역 재사용 규칙', () => {
	it('다른 논문으로 요청하면 모델 0번에 행 1개 추가, 같은 논문으로 다시 요청하면 행이 늘지 않는다', async () => {
		const { provider, state } = scripted({ chunks: ['번역'] });
		const { repo, deps } = setup(provider);
		await readAll(await translate(deps, req('a sentence', PAPER_A)));
		expect(repo.rows).toHaveLength(1);

		const other = await translate(deps, req('a sentence', PAPER_B));
		expect(other).toMatchObject({ cache: 'HIT' });
		await readAll(other);
		expect(state.calls).toBe(1);
		expect(repo.rows.map((r) => r.paperId)).toEqual([PAPER_A, PAPER_B]);

		await readAll(await translate(deps, req('a sentence', PAPER_B)));
		await readAll(await translate(deps, req('a sentence', PAPER_A)));
		expect(repo.rows).toHaveLength(2);
	});

	it('paperId 없이 요청하면 저장된 번역이 있어도 행이 늘지 않는다', async () => {
		const { provider, state } = scripted({ chunks: ['번역'] });
		const { repo, deps } = setup(provider);
		await readAll(await translate(deps, req('a sentence', PAPER_A)));
		await readAll(await translate(deps, req('a sentence')));
		expect(state.calls).toBe(1);
		expect(repo.rows).toHaveLength(1);
	});

	it('없는 논문이나 남의 논문은 404이고 모델을 부르지 않는다', async () => {
		const { provider, state } = scripted({ chunks: ['번역'] });
		const { repo, deps } = setup(provider);
		repo.papers = [{ userId: 'someone-else', paperId: PAPER_A }];
		expect(await translate(deps, req('x', PAPER_A))).toEqual({ kind: 'error', status: 404, code: 'paper_not_found' });
		expect(await translate(deps, req('x', PAPER_B))).toEqual({ kind: 'error', status: 404, code: 'paper_not_found' });
		expect(state.calls).toBe(0);
	});

	it('저장된 번역 조회가 실패하면 로그만 남기고 새로 번역한다', async () => {
		const { provider, state } = scripted({ chunks: ['번역'] });
		const { repo, deps, logs } = setup(provider);
		repo.failFind = true;
		expect((await readAll(await translate(deps, req('x')))).chunks).toEqual(['번역']);
		expect(state.calls).toBe(1);
		expect(logs).toEqual([['저장된 번역 조회 실패', 'Error']]);
	});
});

describe('3.3 실패 경로', () => {
	it.each<[string, AiError, number, string]>([
		['첫 글자 전 실패', new AiError('ai_unavailable', 'x'), 502, 'ai_unavailable'],
		['호출 제한', new AiError('ai_rate_limited', 'x'), 502, 'ai_unavailable'],
		['빈 응답', new AiError('ai_empty_response', 'x'), 502, 'ai_unavailable'],
		['모델 미설정', new AiError('ai_not_configured', 'x'), 503, 'ai_not_configured']
	])('%s → %i %s, 스트림을 만들지 않고 저장하지 않는다', async (_, error, status, code) => {
		const { provider } = scripted({ failBefore: error });
		const { repo, deps } = setup(provider);
		expect(await translate(deps, req('x'))).toEqual({ kind: 'error', status, code });
		expect(repo.rows).toHaveLength(0);
	});

	it('제공자 생성이 설정 오류로 실패하면 503', async () => {
		const { repo, deps } = setup(createFakeProvider());
		deps.provider = () => {
			throw new AiError('ai_not_configured', '환경 변수 ANTHROPIC_API_KEY가 설정되지 않았습니다.');
		};
		expect(await translate(deps, req('x'))).toEqual({ kind: 'error', status: 503, code: 'ai_not_configured' });
		expect(repo.rows).toHaveLength(0);
	});

	it('도중 실패는 스트림을 오류로 끝내고 저장하지 않으며, 다시 요청하면 새로 번역한다', async () => {
		const { provider, state } = scripted({ chunks: ['앞부분', '뒷부분'], failAfter: 1 });
		const { repo, deps } = setup(provider);
		const first = await readAll(await translate(deps, req('a sentence')));
		expect(first.chunks).toEqual(['앞부분']);
		expect(first.error).toBeInstanceOf(AiError);
		expect(repo.rows).toHaveLength(0);

		await readAll(await translate(deps, req('a sentence')));
		expect(state.calls).toBe(2);
	});

	it('연결을 끊으면 제공자의 중단이 호출되고 저장하지 않는다', async () => {
		const { provider, state } = scripted({ chunks: ['첫 조각'], hang: true });
		const { repo, deps } = setup(provider);
		const result = await translate(deps, req('a sentence'));
		if (result.kind !== 'stream') throw new Error('stream이 아니다');
		const reader = result.body.getReader();
		expect(new TextDecoder().decode((await reader.read()).value)).toBe('첫 조각');
		const pending = reader.read();
		await reader.cancel();
		await pending;
		expect(state.aborted).toBe(true);
		expect(state.returned).toBe(true);
		expect(repo.rows).toHaveLength(0);
	});

	it('저장이 실패해도 번역은 끝까지 전달되고 로그에는 오류 이름만 남는다', async () => {
		const { provider } = scripted({ chunks: ['비밀', ' 번역'] });
		const { repo, deps, logs } = setup(provider);
		repo.failSave = true;
		const { chunks, error } = await readAll(await translate(deps, req('secret source')));
		expect(chunks).toEqual(['비밀', ' 번역']);
		expect(error).toBeUndefined();
		expect(logs).toEqual([['이력 저장 실패', 'PostgrestError']]);
		expect(JSON.stringify(logs)).not.toMatch(/secret|비밀|원문/);
	});
});

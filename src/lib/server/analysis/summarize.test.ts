import { describe, expect, it } from 'vitest';
import { AiError, createFakeProvider } from '../ai';
import { summarize, SUMMARY_MAX_TOKENS } from './summarize';
import { NoSourceError, UpstreamError } from './types';

const ABSTRACT = 'We propose a tiny model that reads abstracts. It works well on the fixture benchmark.';
const BODY_MARKER = 'BODY-ONLY-SENTENCE-XYZ';

const reply = JSON.stringify({
	keywords: ['attention', ' fixtures ', 3],
	domain: 'NLP',
	problem_short: '문제 한 줄',
	problem: '문제 설명',
	method_short: '방법 한 줄',
	method: '방법 설명',
	conclusion_short: '결론 한 줄',
	conclusion: '결론 설명'
});

describe('summarize', () => {
	it('AI 요청에는 초록 문장만 있고 본문 표식은 없다', async () => {
		const fake = createFakeProvider({ responses: ['```json\n' + reply + '\n```'] });
		const result = await summarize(fake, { abstract: ABSTRACT, title: 'Some Title ' + BODY_MARKER, doi: '10.1/x' });
		expect(fake.calls).toHaveLength(1);
		const req = fake.calls[0].request;
		expect(req.user).toContain(ABSTRACT);
		expect(req.user).not.toContain(BODY_MARKER);
		expect(req.user).not.toContain('10.1/x');
		expect(req.user).not.toContain('relevance');
		expect(req).toMatchObject({ maxTokens: SUMMARY_MAX_TOKENS, tier: 'fast' });
		expect(result).toEqual({
			summary: '문제 한 줄\n방법 한 줄\n결론 한 줄',
			keywords: ['attention', 'fixtures'],
			domain: 'NLP',
			problemShort: '문제 한 줄',
			problem: '문제 설명',
			methodShort: '방법 한 줄',
			method: '방법 설명',
			conclusionShort: '결론 한 줄',
			conclusion: '결론 설명'
		});
	});

	it('초록이 없으면 제목과 DOI만 보내고 추론임을 밝히라고 요구한다', async () => {
		const fake = createFakeProvider({ responses: [reply] });
		await summarize(fake, { abstract: '  ', title: 'A Title Only Paper', doi: '10.1234/abc' });
		const user = fake.calls[0].request.user;
		expect(user).toContain('논문 제목: A Title Only Paper');
		expect(user).toContain('DOI: 10.1234/abc');
		expect(user).toContain('추론임을 명시');
		expect(user).not.toContain('[초록]');
	});

	it('DOI가 없으면 "없음"으로 보낸다', async () => {
		const fake = createFakeProvider({ responses: [reply] });
		await summarize(fake, { abstract: '', title: 'T', doi: null });
		expect(fake.calls[0].request.user).toContain('DOI: 없음');
	});

	it('초록도 제목도 없으면 AI를 부르지 않고 NoSourceError', async () => {
		const fake = createFakeProvider({ responses: [reply] });
		await expect(summarize(fake, { abstract: '', title: null, doi: '10.1/x' })).rejects.toBeInstanceOf(NoSourceError);
		expect(fake.calls).toHaveLength(0);
	});

	it.each(['ai_unavailable', 'ai_rate_limited', 'ai_empty_response', 'ai_not_configured'] as const)('AI 오류 %s는 UpstreamError', async (code) => {
		const err = await summarize(createFakeProvider({ error: code }), { abstract: ABSTRACT, title: null, doi: null }).catch((e) => e);
		expect(err).toBeInstanceOf(UpstreamError);
		expect(err.cause).toBe(code);
	});

	it('JSON이 아닌 응답은 UpstreamError(ai_invalid_json)', async () => {
		const err = await summarize(createFakeProvider({ responses: ['죄송합니다'] }), { abstract: ABSTRACT, title: null, doi: null }).catch((e) => e);
		expect(err).toBeInstanceOf(UpstreamError);
		expect(err.cause).toBe('ai_invalid_json');
	});

	it('빠진 항목은 null, 키워드가 배열이 아니면 빈 배열', async () => {
		const result = await summarize(createFakeProvider({ responses: ['{"keywords": "x", "method_short": "방법"}'] }), { abstract: ABSTRACT, title: null, doi: null });
		expect(result).toMatchObject({ summary: '방법', keywords: [], domain: null, problem: null, conclusionShort: null });
	});

	it('AiError가 아닌 예외는 그대로 던진다', async () => {
		const broken = { name: 'fake' as const, complete: async () => { throw new TypeError('bug'); }, stream: async function* () {} };
		await expect(summarize(broken, { abstract: ABSTRACT, title: null, doi: null })).rejects.toBeInstanceOf(TypeError);
		expect(new AiError('ai_unavailable', 'x')).toBeInstanceOf(Error);
	});
});

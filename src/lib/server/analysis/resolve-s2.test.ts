import { describe, expect, it } from 'vitest';
import { normalizeTitle, resolveS2, type ResolveInput } from './resolve-s2';
import { createS2Client, S2UnavailableError } from './semantic-scholar';

const NONE: ResolveInput = { s2PaperId: null, arxivId: null, doi: null, title: null };

// 경로별로 응답을 정하는 가짜 Semantic Scholar
function fake(routes: Record<string, unknown>) {
	const paths: string[] = [];
	const fn = (async (input: string) => {
		const url = new URL(input);
		const key = url.pathname.replace('/graph/v1/', '') + (url.searchParams.get('query') ? `?${url.searchParams.get('query')}` : '');
		paths.push(key);
		const body = routes[key];
		if (body === undefined) return new Response('', { status: 404 });
		if (body instanceof Response) return body;
		return Response.json(body);
	}) as unknown as typeof fetch;
	return { client: createS2Client({ apiKey: 'k', fetch: fn, sleep: async () => {} }), paths };
}

describe('resolveS2', () => {
	it('s2PaperId가 있으면 그것으로 한 번만 조회한다', async () => {
		const { client, paths } = fake({ 'paper/S2ID': { paperId: 'S2ID' } });
		expect(await resolveS2(client, { s2PaperId: 'S2ID', arxivId: '2601.01234', doi: '10.1/x', title: 'T' })).toEqual({ paperId: 'S2ID' });
		expect(paths).toEqual(['paper/S2ID']);
	});

	it('arXiv 번호로 찾는다(판 번호는 뗀다)', async () => {
		const { client, paths } = fake({ 'paper/ArXiv:2601.01234': { paperId: 'AX' } });
		expect(await resolveS2(client, { ...NONE, arxivId: '2601.01234v2', doi: '10.1/x' })).toEqual({ paperId: 'AX' });
		expect(paths).toEqual(['paper/ArXiv:2601.01234']);
	});

	it('arXiv로 못 찾으면 DOI로 찾는다', async () => {
		const { client, paths } = fake({ 'paper/DOI:10.1234/fixture.2026.001': { paperId: 'DX' } });
		expect(await resolveS2(client, { ...NONE, arxivId: '2601.01234', doi: '10.1234/fixture.2026.001' })).toEqual({ paperId: 'DX' });
		expect(paths).toEqual(['paper/ArXiv:2601.01234', 'paper/DOI:10.1234/fixture.2026.001']);
	});

	it('제목은 정규화한 제목이 정확히 같은 결과만', async () => {
		const { client } = fake({
			'paper/search?Attention Is All You Need': { data: [{ paperId: 'near', title: 'Attention Is All You Need 2' }, { paperId: 'same', title: 'attention is all you need.' }] }
		});
		expect(await resolveS2(client, { ...NONE, title: 'Attention Is All You Need' })).toMatchObject({ paperId: 'same' });
	});

	it('제목이 비슷하지만 다르면 null', async () => {
		const { client } = fake({ 'paper/search?Attention Is All You Need': { data: [{ paperId: 'near', title: 'Attention Is Not All You Need' }] } });
		expect(await resolveS2(client, { ...NONE, title: 'Attention Is All You Need' })).toBeNull();
	});

	it('찾을 단서가 없으면 조회하지 않고 null', async () => {
		const { client, paths } = fake({});
		expect(await resolveS2(client, NONE)).toBeNull();
		expect(paths).toEqual([]);
	});

	it('조회 실패는 예외를 던져 못 찾음과 구분된다', async () => {
		const { client } = fake({ 'paper/S2ID': new Response('', { status: 500 }) });
		await expect(resolveS2(client, { ...NONE, s2PaperId: 'S2ID' })).rejects.toBeInstanceOf(S2UnavailableError);
	});

	it('normalizeTitle은 대소문자, 공백, 문장부호를 무시한다', () => {
		expect(normalizeTitle('  BERT: Pre-training of Deep  Bidirectional Transformers! ')).toBe('bertpretrainingofdeepbidirectionaltransformers');
	});
});

// 로컬 Supabase가 떠 있어야 하는 분석 통합 테스트. 실행: npm run test:analysis
// 실제 DB(archi_analyses, papers)를 쓰고, AI·Semantic Scholar·Zotero는 가짜다. 저널 점수는 실제 SCImago CSV를 쓴다.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createFakeProvider, type AiProvider } from '../ai';
import { Browser } from '../auth-harness';
import { supabaseClientOptions as options } from '../supabase-options';
import { analyzePaper, type AnalysisDeps } from './analysis-service';
import { testHooks } from './deps';
import { journalScorer } from './journal-score';
import { createS2Client, type S2Client } from './semantic-scholar';

const env = import.meta.env;
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);

const runId = Date.now();
const prefix = `analysis-it-${runId}`;
const password = 'password-ok-1';
const SAMPLE_PDF = new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures', 'sample.pdf')));

const REPLY = JSON.stringify({
	keywords: ['attention'],
	domain: 'NLP',
	problem_short: '문제',
	problem: '문제 설명',
	method_short: '방법',
	method: '방법 설명',
	conclusion_short: '결론',
	conclusion: '결론 설명'
});

const S2_PAPER = {
	paperId: 'S2-FIXTURE',
	title: 'Attention Is a Small Test Fixture for Paper Analysis Extraction',
	year: 2026,
	venue: 'TBME',
	externalIds: { DOI: '10.1234/fixture.2026.001', ArXiv: '2601.01234' },
	abstract: 'Semantic Scholar abstract used for the summary.',
	authors: [{ authorId: 'A1', name: 'Jane Doe' }],
	citationCount: 7
};

// 경로 → 응답. 값이 숫자면 그 상태 코드로 실패한다. 없는 경로는 404(못 찾음).
function fakeS2(routes: Record<string, unknown>): S2Client & { calls: string[] } {
	const calls: string[] = [];
	const fn = (async (input: string) => {
		const url = new URL(input);
		const key = url.pathname.replace('/graph/v1/', '');
		calls.push(key);
		const body = routes[key] ?? routes['*'];
		if (body === undefined) return new Response('', { status: 404 });
		if (typeof body === 'number') return new Response('upstream body with secret', { status: body });
		return Response.json(body);
	}) as unknown as typeof fetch;
	return Object.assign(createS2Client({ apiKey: 'k', fetch: fn, sleep: async () => {} }), { calls });
}

const S2_OK = {
	'paper/ArXiv:2601.01234': S2_PAPER,
	'paper/S2-FIXTURE': S2_PAPER,
	'author/A1': { name: 'Jane Doe', hIndex: 12, citationCount: 3400 }
};

function counting(responses: string[] = [REPLY], error?: 'ai_unavailable'): AiProvider & { calls: number } {
	const fake = createFakeProvider({ responses, error });
	const p = {
		name: 'fake' as const,
		calls: 0,
		async complete(req: Parameters<AiProvider['complete']>[0]) {
			p.calls++;
			return fake.complete(req);
		},
		stream: fake.stream
	};
	return p;
}

function deps(over: { provider?: AiProvider; s2?: S2Client; pdf?: Uint8Array | null } = {}): AnalysisDeps {
	const provider = over.provider ?? counting();
	return {
		admin,
		provider: () => provider,
		s2: over.s2 ?? fakeS2(S2_OK),
		scorer: () => journalScorer(),
		fetchPdf: async (paper) => (paper.attachment_type === 'pdf' ? (over.pdf === undefined ? SAMPLE_PDF : over.pdf) : null),
		log: () => {}
	};
}

let n = 0;
async function user(name: string): Promise<string> {
	const { data, error } = await admin.auth.admin.createUser({ email: `${prefix}-${name}@example.test`, password, email_confirm: true });
	if (error || !data.user) throw error ?? new Error('계정 생성 실패');
	const profile = await admin.from('archi_profiles').insert({ user_id: data.user.id, approved: true });
	if (profile.error) throw profile.error;
	return data.user.id;
}

async function addPaper(userId: string, extra: Record<string, unknown> = {}): Promise<string> {
	const { data, error } = await admin
		.from('papers')
		.insert({
			user_id: userId,
			item_key: `K${n++}`,
			item_version: 1,
			title: 'Attention Is a Small Test Fixture for Paper Analysis Extraction',
			authors: [],
			year: '2026',
			synced_at: new Date().toISOString(),
			attachment_key: 'ATT',
			attachment_type: 'pdf',
			...extra
		})
		.select('id')
		.single();
	if (error) throw error;
	return data.id as string;
}

async function analysisRows(paperId: string) {
	const { data, error } = await admin.from('archi_analyses').select('result').eq('paper_id', paperId);
	if (error) throw error;
	return data;
}

afterAll(async () => {
	const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
	for (const u of data?.users ?? []) {
		if (u.email?.startsWith(prefix)) await admin.auth.admin.deleteUser(u.id);
	}
});

describe('5.2 분석 흐름', () => {
	let me: string;
	beforeAll(async () => {
		me = await user('flow');
	});

	it('PDF와 Semantic Scholar가 모두 있으면 AI 1회·행 1개이고 s2_paper_id가 채워진다', async () => {
		const paper = await addPaper(me);
		const provider = counting();
		const s2 = fakeS2(S2_OK);
		const result = await analyzePaper(deps({ provider, s2 }), me, paper);
		expect(result.kind).toBe('ok');
		if (result.kind !== 'ok') return;
		expect(result.analysis).toMatchObject({
			paperId: paper,
			summary: '문제\n방법\n결론',
			basic: { title: S2_PAPER.title, year: 2026, venue: 'TBME', doi: '10.1234/fixture.2026.001', arxivId: '2601.01234', citationCount: 7 },
			authors: [{ name: 'Jane Doe', hIndex: 12, citationCount: 3400 }],
			journalScore: { matchedTitle: 'IEEE Transactions on Biomedical Engineering', quartile: 'Q1' },
			sources: { pdf: true, semanticScholar: true }
		});
		expect(typeof result.analysis.journalScore.sjr).toBe('number');
		expect(result.analysis).not.toHaveProperty('origin');
		expect(s2.calls[0]).toBe('paper/ArXiv:2601.01234');
		expect(provider.calls).toBe(1);

		const rows = await analysisRows(paper);
		expect(rows).toHaveLength(1);
		expect(rows[0].result).toMatchObject({ origin: 'native' });
		const { data } = await admin.from('papers').select('s2_paper_id').eq('id', paper).single();
		expect(data?.s2_paper_id).toBe('S2-FIXTURE');

		// 재요청: AI 0회, 같은 결과
		const again = counting();
		const second = await analyzePaper(deps({ provider: again }), me, paper);
		expect(second).toEqual(result);
		expect(again.calls).toBe(0);
	});

	it('동시 두 건은 행 1개, 두 결과가 같다', async () => {
		const paper = await addPaper(me);
		const [a, b] = await Promise.all([analyzePaper(deps(), me, paper), analyzePaper(deps(), me, paper)]);
		expect(a.kind).toBe('ok');
		expect(b).toEqual(a);
		expect(await analysisRows(paper)).toHaveLength(1);
	});

	it('Semantic Scholar가 429로 계속 실패하고 PDF가 있으면 PDF만으로 저장한다', async () => {
		const paper = await addPaper(me);
		const result = await analyzePaper(deps({ s2: fakeS2({ '*': 429 }) }), me, paper);
		expect(result.kind).toBe('ok');
		if (result.kind !== 'ok') return;
		expect(result.analysis.sources).toEqual({ pdf: true, semanticScholar: false });
		expect(result.analysis.authors).toEqual([]);
		expect(result.analysis.basic).toMatchObject({ title: S2_PAPER.title, venue: null, doi: '10.1234/fixture.2026.001', arxivId: '2601.01234v2' });
		expect(Object.values(result.analysis.journalScore).every((v) => v === null)).toBe(true);
		expect(await analysisRows(paper)).toHaveLength(1);
	});

	it('Semantic Scholar만 있는 논문(첨부 없음, s2PaperId)은 그 초록을 쓰고 sources.pdf가 false', async () => {
		const paper = await addPaper(me, { attachment_key: null, attachment_type: null, s2_paper_id: 'S2-FIXTURE' });
		const provider = createFakeProvider({ responses: [REPLY] });
		const s2 = fakeS2(S2_OK);
		const result = await analyzePaper(deps({ provider, s2 }), me, paper);
		expect(result).toMatchObject({ kind: 'ok', analysis: { sources: { pdf: false, semanticScholar: true } } });
		expect(s2.calls[0]).toBe('paper/S2-FIXTURE');
		expect(provider.calls[0].request.user).toContain(S2_PAPER.abstract);
	});

	it('AI가 실패하면 upstream_unavailable이고 행이 없다', async () => {
		const paper = await addPaper(me);
		expect(await analyzePaper(deps({ provider: counting([], 'ai_unavailable') }), me, paper)).toEqual({ kind: 'upstream_unavailable' });
		expect(await analysisRows(paper)).toHaveLength(0);
	});

	it('PDF가 없고 Semantic Scholar에서 못 찾으면 no_source, 조회가 실패하면 upstream_unavailable', async () => {
		const paper = await addPaper(me, { attachment_key: null, attachment_type: null });
		const provider = counting();
		expect(await analyzePaper(deps({ provider, s2: fakeS2({ 'paper/search': { data: [] } }) }), me, paper)).toEqual({ kind: 'no_source' });
		expect(await analyzePaper(deps({ provider, s2: fakeS2({ '*': 503 }) }), me, paper)).toEqual({ kind: 'upstream_unavailable' });
		expect(provider.calls).toBe(0);
		expect(await analysisRows(paper)).toHaveLength(0);
	});

	it('논문을 지우면 분석 행도 지워진다', async () => {
		const paper = await addPaper(me);
		expect((await analyzePaper(deps(), me, paper)).kind).toBe('ok');
		expect(await analysisRows(paper)).toHaveLength(1);
		expect((await admin.from('papers').delete().eq('id', paper)).error).toBeNull();
		expect(await analysisRows(paper)).toHaveLength(0);
	});

	it('남의 논문은 paper_not_found이고 아무것도 부르지 않는다', async () => {
		const other = await user('flow-other');
		const theirs = await addPaper(other);
		const provider = counting();
		const s2 = fakeS2(S2_OK);
		expect(await analyzePaper(deps({ provider, s2 }), me, theirs)).toEqual({ kind: 'paper_not_found' });
		expect(provider.calls).toBe(0);
		expect(s2.calls).toEqual([]);
	});
});

describe('6.1 /api/papers/{id}/analysis', () => {
	let b: Browser;
	let me: string;
	let theirs: string;
	const MISSING = '00000000-0000-4000-8000-000000000000';

	beforeAll(async () => {
		me = await user('route');
		theirs = await addPaper(await user('route-other'));
		b = new Browser(`ait-${runId}`);
		expect((await b.request('POST', '/api/auth/login', { email: `${prefix}-route@example.test`, password })).status).toBe(200);
	});

	afterEach(() => {
		delete testHooks.provider;
		delete testHooks.s2;
		delete testHooks.fetchPdf;
	});

	afterAll(async () => {
		await admin.from('archi_login_attempts').delete().eq('ip', `ait-${runId}`);
	});

	const hooks = (provider: AiProvider, s2: S2Client = fakeS2(S2_OK)) => {
		testHooks.provider = provider;
		testHooks.s2 = s2;
		testHooks.fetchPdf = async (paper) => (paper.attachment_type === 'pdf' ? SAMPLE_PDF : null);
	};

	it('쿠키 없음은 401', async () => {
		const anon = new Browser(`ait-anon-${runId}`);
		expect((await anon.request('POST', `/api/papers/${MISSING}/analysis`)).status).toBe(401);
		expect((await anon.request('GET', `/api/papers/${MISSING}/analysis`)).status).toBe(401);
	});

	it('없는 논문과 남의 논문은 404 paper_not_found', async () => {
		hooks(counting());
		for (const id of [MISSING, theirs, 'not-a-uuid']) {
			for (const method of ['POST', 'GET'] as const) {
				const res = await b.request(method, `/api/papers/${id}/analysis`);
				expect(res.status).toBe(404);
				expect(res.body).toMatchObject({ error: { code: 'paper_not_found' } });
			}
		}
	});

	it('분석 없는 논문의 GET은 404 analysis_not_found, 첫 POST 200, 재요청 200(AI 0회), origin 없음', async () => {
		const paper = await addPaper(me);
		const provider = counting();
		hooks(provider);
		const missing = await b.request('GET', `/api/papers/${paper}/analysis`);
		expect(missing.status).toBe(404);
		expect(missing.body).toMatchObject({ error: { code: 'analysis_not_found' } });

		const first = await b.request('POST', `/api/papers/${paper}/analysis`);
		expect(first.status).toBe(200);
		expect(first.body).toMatchObject({ paperId: paper, sources: { pdf: true, semanticScholar: true } });
		expect(first.body).not.toHaveProperty('origin');

		const again = await b.request('POST', `/api/papers/${paper}/analysis`);
		expect(again.status).toBe(200);
		expect(again.body).toEqual(first.body);
		const read = await b.request('GET', `/api/papers/${paper}/analysis`);
		expect(read.body).toEqual(first.body);
		expect(provider.calls).toBe(1);
	});

	it('자료 없음은 422 no_source_for_analysis', async () => {
		const paper = await addPaper(me, { attachment_key: null, attachment_type: null });
		hooks(counting(), fakeS2({ 'paper/search': { data: [] } }));
		const res = await b.request('POST', `/api/papers/${paper}/analysis`);
		expect(res.status).toBe(422);
		expect(res.body).toMatchObject({ error: { code: 'no_source_for_analysis' } });
	});

	it('AI 실패는 502 upstream_unavailable이고 외부 응답 내용이 없다', async () => {
		const paper = await addPaper(me);
		hooks(counting([], 'ai_unavailable'), fakeS2({ '*': 500 }));
		const res = await b.request('POST', `/api/papers/${paper}/analysis`);
		expect(res.status).toBe(502);
		expect(res.body).toMatchObject({ error: { code: 'upstream_unavailable' } });
		expect(JSON.stringify(res.body)).not.toContain('secret');
		expect(await analysisRows(paper)).toHaveLength(0);
	});
});

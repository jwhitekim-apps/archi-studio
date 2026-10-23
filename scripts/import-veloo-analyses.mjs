// 벨루 paper_history의 분석 결과를 archi_analyses로 옮긴다(archi-studio-paper-analysis 결정 10, 예비안).
// 기본은 확인만 하는 실행(dry-run)이다. --apply를 줘야 쓴다. 벨루 paper_history는 읽기만 하고, 쓰는 곳은 archi_analyses뿐이다.
//
// 실행: node --env-file=.env scripts/import-veloo-analyses.mjs [--apply] [--map data/veloo-user-map.json]
// 필요한 환경 변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// 매핑 파일: { "<벨루 users.id>": "<새 앱 auth.users.id>", ... }  (사용자 이름이 들어갈 수 있어 git 추적 제외)
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const mapAt = args.indexOf('--map');
const mapPath = mapAt >= 0 ? args[mapAt + 1] : 'data/veloo-user-map.json';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
	console.error('SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요하다(node --env-file=.env 로 실행).');
	process.exit(1);
}
// Node 20에는 전역 WebSocket이 없다. 실시간 기능은 쓰지 않으므로 빈 전송 클래스를 넘긴다(supabase-options.ts와 같다).
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
	realtime: { transport: class {} }
});

const userMap = JSON.parse(readFileSync(mapPath, 'utf8'));

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const int = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null);
// 벨루는 sjr을 "35,568"처럼 쉼표 소수 문자열로 저장했다
const sjr = (v) => {
	if (typeof v === 'number') return v;
	const n = Number(String(v ?? '').replace(',', '.'));
	return str(v) && Number.isFinite(n) ? n : null;
};

// 벨루 결과 {basic, analysis, authors, quality} → 새 형식(openapi.yaml의 Analysis에서 paperId를 빼고 origin을 더한 것)
export function convert(result) {
	const a = result?.analysis ?? {};
	const b = result?.basic ?? {};
	const q = result?.quality ?? {};
	const problemShort = str(a.problem_short);
	const methodShort = str(a.method_short);
	const conclusionShort = str(a.conclusion_short);
	return {
		summary: [problemShort, methodShort, conclusionShort].filter(Boolean).join('\n'),
		keywords: Array.isArray(a.keywords) ? a.keywords.filter((k) => typeof k === 'string' && k.trim()).map((k) => k.trim()) : [],
		domain: str(a.domain),
		problemShort,
		problem: str(a.problem),
		methodShort,
		method: str(a.method),
		conclusionShort,
		conclusion: str(a.conclusion),
		basic: {
			title: str(b.title),
			year: int(b.year),
			venue: str(b.venue),
			doi: str(b.doi),
			arxivId: str(b.arxivId),
			citationCount: int(b.citationCount)
		},
		authors: (Array.isArray(result?.authors) ? result.authors : []).slice(0, 3).map((x) => ({
			name: str(x?.name) ?? '',
			hIndex: int(x?.hIndex),
			citationCount: int(x?.citationCount)
		})),
		journalScore: {
			matchedTitle: str(q.matched_title),
			sjr: sjr(q.sjr),
			quartile: str(q.quartile),
			issn: str(q.issn),
			type: str(q.type),
			country: str(q.country)
		},
		sources: { pdf: false, semanticScholar: true },
		origin: 'veloo-import'
	};
}

async function main() {
	const { data: history, error } = await admin
		.from('paper_history')
		.select('id, user_id, paper_id, title, result, created_at')
		.order('created_at', { ascending: false });
	if (error) throw error;

	const imported = [];
	const skipped = [];
	const seen = new Set();
	for (const row of history) {
		const label = row.title ?? row.result?.basic?.title ?? '(제목 없음)';
		const userId = userMap[row.user_id];
		if (!userId) {
			skipped.push(`${label} — 사용자 매핑 없음`);
			continue;
		}
		if (!row.paper_id) {
			skipped.push(`${label} — Semantic Scholar 키 없음`);
			continue;
		}
		// 같은 논문을 여러 번 분석했으면 가장 최근 것만
		const key = `${userId}:${row.paper_id}`;
		if (seen.has(key)) continue;
		seen.add(key);

		const { data: papers, error: paperError } = await admin
			.from('papers')
			.select('id')
			.eq('user_id', userId)
			.eq('s2_paper_id', row.paper_id)
			.limit(1);
		if (paperError) throw paperError;
		const paper = papers?.[0];
		if (!paper) {
			skipped.push(`${label} — 일치하는 논문 없음`);
			continue;
		}
		const { data: existing, error: existingError } = await admin
			.from('archi_analyses')
			.select('id')
			.eq('user_id', userId)
			.eq('paper_id', paper.id)
			.limit(1);
		if (existingError) throw existingError;
		if (existing?.length) {
			skipped.push(`${label} — 이미 분석 있음`);
			continue;
		}
		imported.push({ label, row: { user_id: userId, paper_id: paper.id, result: convert(row.result) } });
	}

	if (apply) {
		for (const { label, row } of imported) {
			const { error: insertError } = await admin.from('archi_analyses').insert(row);
			// 그사이 다른 실행이나 분석이 같은 논문을 저장했으면(유일 제약) 건너뛴다
			if (insertError?.code === '23505') skipped.push(`${label} — 이미 분석 있음`);
			else if (insertError) throw insertError;
		}
	}

	console.log(`${apply ? '적용' : '확인만(dry-run)'}: 가져옴 ${imported.length}, 건너뜀 ${skipped.length}`);
	for (const { label } of imported) console.log(`  + ${label}`);
	for (const line of skipped) console.log(`  - ${line}`);
	if (!apply && imported.length) console.log('쓰려면 --apply를 붙여 다시 실행한다.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((err) => {
		console.error('가져오기 실패:', err?.message ?? err);
		process.exit(1);
	});
}

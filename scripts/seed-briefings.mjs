// 브리핑 화면 시험 데이터(로컬 DB 전용). 모든 내용은 지어낸 자리표시 글이다.
// 사용: SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... SEED_PASSWORD=... node scripts/seed-briefings.mjs
// 계정: SEED_EMAIL(기본 briefing-seed@example.com, 승인됨, 브리핑 38건)과 빈 계정 briefing-empty@example.com(브리핑 0건).
// 같은 계정의 브리핑을 지우고 다시 넣으므로 여러 번 실행해도 건수가 같다.
import { createClient } from '@supabase/supabase-js';

function fail(message) {
	console.error(message);
	process.exit(1);
}

const { SUPABASE_URL = '', SUPABASE_SERVICE_ROLE_KEY = '', SEED_PASSWORD = '' } = process.env;
const SEED_EMAIL = process.env.SEED_EMAIL ?? 'briefing-seed@example.com';
const EMPTY_EMAIL = process.env.SEED_EMPTY_EMAIL ?? 'briefing-empty@example.com';

let host = '';
try {
	host = new URL(SUPABASE_URL).hostname;
} catch {
	fail('SUPABASE_URL이 올바른 주소가 아닙니다.');
}
if (host !== '127.0.0.1' && host !== 'localhost') fail('로컬 DB(127.0.0.1 또는 localhost)에만 시험 데이터를 넣습니다. 아무것도 쓰지 않았습니다.');
if (!SUPABASE_SERVICE_ROLE_KEY) fail('SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
if (SEED_PASSWORD.length < 8) fail('SEED_PASSWORD(8자 이상)가 필요합니다.');

// Node 20에는 전역 WebSocket이 없어 빈 전송 클래스를 넘긴다(src/lib/server/supabase-options.ts와 같은 이유)
class UnusedWebSocket {}
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
	realtime: { transport: UnusedWebSocket }
});

async function check(promise, what) {
	const { data, error } = await promise;
	if (error) fail(`${what} 실패: ${error.message}`);
	return data;
}

// 승인된 계정을 찾거나 만든다
async function ensureUser(email) {
	const { users } = await check(db.auth.admin.listUsers({ perPage: 1000 }), '계정 목록');
	let user = users.find((u) => u.email === email);
	if (!user) {
		({ user } = await check(db.auth.admin.createUser({ email, password: SEED_PASSWORD, email_confirm: true }), '계정 만들기'));
	} else {
		await check(db.auth.admin.updateUserById(user.id, { password: SEED_PASSWORD }), '비밀번호 맞추기');
	}
	await check(db.from('archi_profiles').upsert({ user_id: user.id, approved: true }), '승인');
	return user.id;
}

const userId = await ensureUser(SEED_EMAIL);
const emptyId = await ensureUser(EMPTY_EMAIL);
await check(db.from('archi_briefings').delete().eq('user_id', emptyId), '빈 계정 정리');

// 시험용 논문 2편
const papers = [];
for (const [key, title] of [
	['SEEDBRF1', '시험용 논문 하나: 자리표시 제목'],
	['SEEDBRF2', '시험용 논문 둘: 자리표시 제목']
]) {
	const row = await check(
		db.from('papers').upsert({ user_id: userId, item_key: key, title }, { onConflict: 'user_id,item_key' }).select('id').single(),
		'논문'
	);
	papers.push(row.id);
}

await check(db.from('archi_briefings').delete().eq('user_id', userId), '이전 브리핑 정리');

// 35건은 오늘부터 하루씩 거슬러 간 평범한 브리핑, 뒤 3건은 특별한 본문
const day = (offset) => new Date(Date.UTC(2026, 9, 18) - offset * 86400000).toISOString().slice(0, 10);
const rows = Array.from({ length: 35 }, (_, i) => ({
	user_id: userId,
	date: day(i + 3),
	summary: `자리표시 요약 ${i + 1}: 오늘 할 일 3건, 마감 1건`,
	body: `먼저 할 일\n- 자리표시 할 일 ${i + 1}\n\n오늘 마감\n- 자리표시 마감\n\n참고\n- 자리표시 메모`
}));
const longUrl = `https://example.com/${'a'.repeat(100)}`.slice(0, 120);
rows.unshift(
	{ user_id: userId, date: day(0), summary: '논문 2편을 언급한 브리핑', body: '읽을 논문\n- 시험용 논문 두 편을 확인한다.' },
	{ user_id: userId, date: day(1), summary: '본문에 태그 글자가 든 브리핑', body: '메일 제목: <script>alert(1)</script>\n<b>굵게가 아니라 글자</b>' },
	{ user_id: userId, date: day(2), summary: '긴 주소가 든 브리핑', body: `긴 주소\n${longUrl}\n끝` }
);
const inserted = await check(db.from('archi_briefings').insert(rows).select('id, date'), '브리핑');
const withPapers = inserted.find((r) => r.date === day(0));
await check(
	db.from('archi_briefing_papers').insert(papers.map((paper_id) => ({ briefing_id: withPapers.id, paper_id }))),
	'논문 연결'
);

console.log(`브리핑 ${inserted.length}건, 논문 연결 ${papers.length}행을 ${SEED_EMAIL}에 넣었습니다. 빈 계정: ${EMPTY_EMAIL}`);

// 화면 검사(Playwright, Chromium). 실행 중인 개발 서버 주소와 스크린샷 폴더를 받는다.
// 사용: node scripts/ui-screens.mjs http://127.0.0.1:5273 <저장 폴더> [검사 묶음,...]
// 검사 묶음: components(공통 부품), signup(가입 화면, 가짜 응답), auth(로그인 흐름, 실제 인증 API),
// library(서재, 가짜 응답), settings(설정, 가짜 응답), layout(화면 크기·테마별 배치),
// library-real(로컬 DB에 SQL로 넣은 논문으로 실제 서버의 목록·검색·컬렉션·더 보기),
// translate(번역 화면, 브라우저 안 가짜 스트림), analyze(분석 화면, 가짜 응답). 아무것도 주지 않으면 모두 돈다.
// components와 signup 말고는 로컬 Supabase가 떠 있어야 한다(npm run db:start). 화면 검사용 계정은 끝나면 지운다.
// 실행 준비와 묶음별 조건은 docs/dev/setup.md의 "화면 검사" 절.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const [url = 'http://127.0.0.1:5273', outDir = '.', only = ''] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const selected = only ? new Set(only.split(',')) : null;
const want = (name) => !selected || selected.has(name);

let failed = false;
export const report = (ok, text) => {
	if (!ok) failed = true;
	console.log(`${ok ? 'OK  ' : 'FAIL'} ${text}`);
};

const browser = await chromium.launch();

// 하이드레이션이 끝나기 전 클릭은 무시될 수 있어, SvelteKit이 붙이는 시작 표시를 기다린다.
async function open(page, path) {
	await page.goto(url + path);
	await page.waitForLoadState('networkidle');
	await page.waitForFunction(() => document.body.dataset.hydrated === '1', null, { timeout: 15000 });
}

// "rgb(…)", "color(srgb …)" 값을 0~1 sRGB로
function parseColor(value) {
	const nums = value.match(/[\d.]+/g)?.map(Number) ?? [];
	if (value.startsWith('color(')) return nums.slice(0, 3);
	return nums.slice(0, 3).map((n) => n / 255);
}

function luminance([r, g, b]) {
	const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(fg, bg) {
	const [a, b] = [luminance(parseColor(fg)), luminance(parseColor(bg))].sort((x, y) => y - x);
	return (a + 0.05) / (b + 0.05);
}

// 요소의 글자색과, 투명하지 않은 가장 가까운 조상 배경색
async function colorsOf(page, selector) {
	return page.locator(selector).first().evaluate((el) => {
		const color = getComputedStyle(el).color;
		let node = el;
		while (node) {
			const bg = getComputedStyle(node).backgroundColor;
			if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return { color, bg };
			node = node.parentElement;
		}
		return { color, bg: 'rgb(255, 255, 255)' };
	});
}

async function components(scheme) {
	const context = await browser.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 900 } });
	const page = await context.newPage();
	await open(page, '/dev/components');
	const tag = `${scheme} 부품`;

	// 진행 중 버튼: 누른 뒤 다시 누르고 Enter를 쳐도 요청은 한 번
	const busyButton = page.getByTestId('busy-button');
	await busyButton.click();
	await page.waitForFunction(() => document.querySelector('[data-testid="busy-button"]')?.getAttribute('aria-busy') === 'true');
	await busyButton.click({ force: true });
	await busyButton.focus();
	await page.keyboard.press('Enter');
	await page.waitForFunction(() => !document.querySelector('[data-testid="busy-button"]')?.hasAttribute('aria-busy'), null, {
		timeout: 5000
	});
	report((await page.getByTestId('busy-count').textContent()) === '1', `${tag} 진행 중 버튼을 다시 눌러도 요청 1번`);

	// Tab 포커스 윤곽
	await page.evaluate(() => {
		document.activeElement?.blur();
		window.scrollTo(0, 0);
	});
	await page.locator('h1').click();
	let outlined = false;
	for (let i = 0; i < 40 && !outlined; i++) {
		await page.keyboard.press('Tab');
		outlined = await page.evaluate(() => {
			const el = document.activeElement;
			if (!el?.matches('.work button.button')) return false;
			const style = getComputedStyle(el);
			return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
		});
	}
	report(outlined, `${tag} Tab으로 옮긴 버튼에 포커스 윤곽 표시`);

	// 입력 오류 연결
	const errorField = page.getByTestId('error-field');
	const describedBy = await errorField.getAttribute('aria-describedby');
	const errorText = describedBy ? await page.locator(`#${describedBy.split(' ').pop()}`).textContent() : '';
	report(
		(await errorField.getAttribute('aria-invalid')) === 'true' && errorText?.includes('8자'),
		`${tag} 입력 오류가 aria-invalid와 aria-describedby로 연결`
	);

	// 확인 대화상자: Tab이 밖으로 나가지 않음, Escape는 취소, 포커스는 연 버튼으로
	const opener = page.getByTestId('dialog-opener');
	await opener.focus();
	await page.keyboard.press('Enter');
	await page.waitForFunction(() => document.querySelector('dialog')?.open === true);
	report(await page.evaluate(() => !!document.activeElement?.closest('dialog')), `${tag} 대화상자를 열면 포커스가 안으로`);
	let escaped = false;
	for (let i = 0; i < 8; i++) {
		await page.keyboard.press('Tab');
		const inside = await page.evaluate(() => !!document.activeElement?.closest('dialog') || document.activeElement === document.body);
		if (!inside) escaped = true;
	}
	report(!escaped, `${tag} 대화상자가 열린 동안 Tab이 밖 요소로 가지 않음`);
	await page.screenshot({ path: `${outDir}/${scheme}-components-dialog.png` });
	await page.keyboard.press('Escape');
	await page.waitForFunction(() => document.querySelector('dialog')?.open === false);
	const afterEscape = await page.evaluate(() => ({
		focus: document.activeElement?.getAttribute('data-testid'),
		confirmed: document.querySelector('[data-testid="dialog-confirmed"]')?.textContent,
		cancelled: document.querySelector('[data-testid="dialog-cancelled"]')?.textContent
	}));
	report(
		afterEscape.focus === 'dialog-opener' && afterEscape.confirmed === '0' && afterEscape.cancelled === '1',
		`${tag} Escape는 취소이고 포커스가 연 버튼으로 돌아옴`
	);

	// 스트리밍: 조각이 이어 붙고 진행 중 표시가 켜졌다 꺼짐
	const output = page.getByRole('region', { name: '스트리밍 결과' });
	await page.getByTestId('stream-ok').click();
	await page.waitForFunction(() => document.querySelector('[aria-label="스트리밍 결과"]')?.textContent?.includes('안녕'));
	const midway = await output.getAttribute('aria-busy');
	await page.waitForFunction(() => document.querySelector('[aria-label="스트리밍 결과"]')?.getAttribute('aria-busy') === 'false');
	report(
		midway === 'true' && (await output.textContent())?.trim() === '안녕하세요 스트리밍 시험입니다.',
		`${tag} 스트리밍 조각이 순서대로 이어지고 끝나면 진행 중 표시 꺼짐`
	);
	report((await output.getAttribute('aria-live')) === 'polite', `${tag} 스트리밍 영역은 aria-live=polite`);
	await page.getByTestId('stream-fail').click();
	await page.waitForFunction(() => document.querySelector('[aria-label="스트리밍 결과"]')?.getAttribute('aria-busy') === 'false' &&
		!!document.querySelector('[aria-label="스트리밍 결과"]')?.closest('.stream')?.querySelector('[role="alert"]'));
	report((await output.textContent())?.trim() === '안녕하세요', `${tag} 도중 오류에도 받은 글자 유지와 오류 알림`);

	// 글자 대비 4.5:1 이상: 본문, 흐린 글자, 기본·위험 버튼, 오류 알림
	const pairs = [
		['본문', '[data-testid="body-text"]'],
		['흐린 글자', '.lead'],
		['기본 버튼', '.work .button.primary'],
		['위험 버튼', '.work .button.danger'],
		['오류 알림', '.work .notice.error'],
		['메뉴 항목', '.menu a.nav-item:not(.active)']
	];
	for (const [name, selector] of pairs) {
		const { color, bg } = await colorsOf(page, selector);
		const ratio = contrast(color, bg);
		report(ratio >= 4.5, `${tag} ${name} 글자 대비 ${ratio.toFixed(2)}:1`);
	}

	await page.screenshot({ path: `${outDir}/${scheme}-components.png`, fullPage: true });
	await context.close();
}



// ---- 아래는 화면 묶음별 검사 ----

// 로컬 DB(Supabase 컨테이너 안의 psql). 이 검사가 만든 계정(ui-check-*@example.com)만 다룬다.
let dbUsed = false;
function sql(query) {
	dbUsed = true;
	return execFileSync('docker', ['exec', '-i', 'supabase_db_archi-studio', 'psql', '-U', 'postgres', '-tAc', query], {
		encoding: 'utf8'
	}).trim();
}

function cleanupDb() {
	sql("delete from auth.users where email like 'ui-check-%@example.com'");
	sql("delete from public.archi_login_attempts where ip in ('127.0.0.1', '::1', '::ffff:127.0.0.1')");
}

const PASSWORD = 'ui-check-password-1';
let runId = 0;
const newEmail = () => `ui-check-${Date.now()}-${runId++}@example.com`;

async function postJson(path, body) {
	return fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

// 승인된 계정을 만들고 그 계정으로 로그인한 브라우저 문맥을 돌려준다
async function loggedInContext(options) {
	const email = newEmail();
	const signup = await postJson('/api/auth/signup', { email, password: PASSWORD });
	if (signup.status !== 201) throw new Error(`가입 실패 ${signup.status}`);
	sql(`update public.archi_profiles set approved = true where user_id = (select id from auth.users where email = '${email}')`);
	const context = await browser.newContext(options);
	const login = await context.request.post(url + '/api/auth/login', { data: { email, password: PASSWORD } });
	if (login.status() !== 200) throw new Error(`로그인 실패 ${login.status()}`);
	return { context, email };
}

// 브라우저가 부르는 /api(인증 제외)를 가짜 응답으로 바꾼다. handlers는 "메서드 경로" → (URL, 요청) → {status, body, delay}
// 경로의 UUID는 :id로 바꿔 찾는다. 부른 기록을 돌려준다.
async function mockApi(page, handlers) {
	const calls = [];
	await page.route(
		(u) => u.pathname.startsWith('/api/') && !u.pathname.startsWith('/api/auth/'),
		async (route) => {
			const request = route.request();
			const u = new URL(request.url());
			const key = `${request.method()} ${u.pathname}`;
			const generic = `${request.method()} ${u.pathname.replace(/[0-9a-f-]{36}$/, ':id')}`;
			calls.push({ method: request.method(), path: u.pathname, params: u.searchParams, body: request.postData() });
			const handler = handlers[key] ?? handlers[generic];
			const result = handler ? await handler(u, request) : { status: 404, body: { error: { code: 'not_found', message: '' } } };
			if (result.delay) await new Promise((resolve) => setTimeout(resolve, result.delay));
			const status = result.status ?? 200;
			await route
				.fulfill(
					status === 204
						? { status, body: '' }
						: { status, contentType: 'application/json', body: JSON.stringify(result.body ?? null) }
				)
				.catch(() => {});
		}
	);
	return calls;
}

// docs/api/openapi.yaml의 PaperListItem, Collection, ZoteroStatus 형식을 따른 고정 데이터
const paperId = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const paper = (n, title, extra = {}) => ({
	id: paperId(n),
	title,
	authors: ['Ashish Vaswani', 'Noam Shazeer'],
	year: 2017,
	collections: [],
	hasPdf: false,
	hasMemo: false,
	...extra
});
const COLLECTIONS = [
	{ key: 'NLP00001', name: '자연어 처리', parentKey: null, paperCount: 2 },
	{ key: 'TRANS001', name: '트랜스포머', parentKey: 'NLP00001', paperCount: 1 },
	{ key: 'VISION01', name: '비전', parentKey: null, paperCount: 1 }
];
const CONNECTED = { connected: true, zoteroUsername: 'demo-user', lastSyncedAt: '2026-10-20T09:30:00Z' };
const list = (items, nextCursor = null) => ({ body: { items, nextCursor } });

async function openApp(page, path) {
	await page.goto(url + path);
	await page.waitForFunction(() => document.body.dataset.hydrated === '1', null, { timeout: 15000 });
}

const textOf = (page) => page.locator('main').innerText();

async function signupMock() {
	const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const page = await context.newPage();
	const tag = '가입(가짜 응답)';
	let requests = 0;
	await page.route('**/api/auth/signup', async (route) => {
		requests++;
		await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ status: 'pending_approval' }) });
	});
	await openApp(page, '/signup');
	report((await page.locator('main').innerText()).includes('8자 이상'), `${tag} 요청 전에 8자 이상 안내 표시`);

	await page.getByLabel('이메일').fill('new@example.com');
	await page.getByLabel('비밀번호').fill('1234567');
	await page.getByRole('button', { name: '가입하기' }).click();
	await page.waitForTimeout(300);
	const invalid = await page.getByLabel('비밀번호').getAttribute('aria-invalid');
	report(requests === 0 && invalid === 'true', `${tag} 7자 비밀번호는 요청 0번이고 입력창 오류 표시`);

	await page.getByLabel('비밀번호').fill('12345678');
	await page.getByRole('button', { name: '가입하기' }).click();
	await page.getByRole('heading', { name: '가입 신청이 접수되었습니다' }).waitFor();
	report(
		requests === 1 && new URL(page.url()).pathname === '/signup' && (await page.getByRole('link', { name: '로그인 화면으로' }).count()) === 1,
		`${tag} 201이면 승인 대기 안내와 로그인 링크, 주소는 /signup 그대로`
	);

	// 이미 가입된 이메일은 이메일 입력창에, 서버 오류는 알림으로
	await page.unroute('**/api/auth/signup');
	await page.route('**/api/auth/signup', (route) =>
		route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'email_taken', message: '' } }) })
	);
	await openApp(page, '/signup');
	await page.getByLabel('이메일').fill('taken@example.com');
	await page.getByLabel('비밀번호').fill('12345678');
	await page.getByRole('button', { name: '가입하기' }).click();
	await page.waitForFunction(() => document.querySelector('input[type="email"]')?.getAttribute('aria-invalid') === 'true');
	const emailDescribed = await page.getByLabel('이메일').getAttribute('aria-describedby');
	report(
		(await page.locator(`#${emailDescribed}`).innerText()).includes('이미 가입된 이메일'),
		`${tag} 409 email_taken은 이메일 입력창 근처에 안내`
	);

	await page.route('**/api/auth/login', (route) => route.fulfill({ status: 500, body: 'Internal Error' }));
	await openApp(page, '/login');
	await page.getByLabel('이메일').fill('a@example.com');
	await page.getByLabel('비밀번호').fill('whatever-password');
	await page.getByRole('button', { name: '로그인' }).click();
	await page.getByRole('alert').waitFor();
	report(
		(await page.getByRole('alert').innerText()).includes('서버에 연결하지 못했습니다') && (await page.getByLabel('비밀번호').inputValue()) === '',
		`${tag} 로그인 500은 서버 연결 안내와 비밀번호 비움`
	);
	let loginRequests = 0;
	page.on('request', (r) => r.url().includes('/api/auth/login') && loginRequests++);
	await page.getByLabel('비밀번호').fill('');
	await page.getByRole('button', { name: '로그인' }).click();
	await page.waitForTimeout(300);
	report(loginRequests === 0 && (await page.getByLabel('비밀번호').getAttribute('aria-invalid')) === 'true', `${tag} 빈 비밀번호는 요청 없이 필수 안내`);
	await context.close();
}

async function loginWith(page, email, password) {
	await page.getByLabel('이메일').fill(email);
	await page.getByLabel('비밀번호').fill(password);
	await page.getByRole('button', { name: '로그인' }).click();
}

async function alertText(page) {
	await page.getByRole('alert').first().waitFor({ timeout: 10000 });
	return page.getByRole('alert').first().innerText();
}

async function authFlow() {
	const tag = '로그인 흐름(실제 API)';
	cleanupDb();
	const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const page = await context.newPage();
	const email = newEmail();

	// 가입 → 승인 대기 안내, 세션 쿠키 없음
	await openApp(page, '/signup');
	await page.getByLabel('이메일').fill(email);
	await page.getByLabel('비밀번호').fill(PASSWORD);
	await page.getByRole('button', { name: '가입하기' }).click();
	await page.getByRole('heading', { name: '가입 신청이 접수되었습니다' }).waitFor();
	const cookies = await context.cookies();
	report(!cookies.some((c) => c.name === 'archi_session'), `${tag} 가입 뒤 승인 대기 안내, 세션 쿠키 없음`);

	// 승인 전 로그인
	await openApp(page, '/login');
	await loginWith(page, email, PASSWORD);
	report((await alertText(page)).includes('승인'), `${tag} 승인 전 로그인은 승인 대기 안내`);

	// 틀린 비밀번호와 없는 이메일은 같은 문구
	sql(`update public.archi_profiles set approved = true where user_id = (select id from auth.users where email = '${email}')`);
	await loginWith(page, email, 'wrong-password-1');
	const wrongPassword = await alertText(page);
	await loginWith(page, `nobody-${email}`, 'wrong-password-1');
	await page.waitForTimeout(500);
	const noEmail = await alertText(page);
	report(wrongPassword === noEmail && wrongPassword.includes('이메일 또는 비밀번호'), `${tag} 틀린 비밀번호와 없는 이메일은 같은 문구`);
	sql("delete from public.archi_login_attempts where ip in ('127.0.0.1', '::1', '::ffff:127.0.0.1')");

	// 보호 화면 → 로그인 → 원래 주소로
	await page.goto(url + '/library?query=attention');
	await page.waitForURL((u) => u.pathname === '/login');
	report(
		new URL(page.url()).pathname === '/login' && new URL(page.url()).searchParams.get('redirect') === '/library?query=attention',
		`${tag} 로그인 없이 /library를 열면 /login?redirect=…`
	);
	await page.waitForFunction(() => document.body.dataset.hydrated === '1');
	await loginWith(page, email, PASSWORD);
	await page.waitForURL((u) => u.pathname === '/library', { timeout: 10000 });
	report(
		new URL(page.url()).search === '?query=attention' && (await page.locator('.menu').isVisible()),
		`${tag} 로그인 뒤 원래 주소(/library?query=attention)로 이동하고 셸 표시`
	);
	report(
		(await page.locator('.menu a[aria-current="page"]').innerText()).includes('서재') &&
			(await page.locator('.menu [aria-current="page"]').count()) === 1,
		`${tag} 메뉴의 서재 항목만 현재 위치`
	);
	await page.locator('.menu [aria-disabled="true"]').first().click();
	report(new URL(page.url()).pathname === '/library', `${tag} 준비 중 메뉴 항목은 눌러도 이동하지 않음`);

	// 이미 로그인한 사용자가 /login을 열면 서재로
	await page.goto(url + '/login');
	report(new URL(page.url()).pathname === '/library', `${tag} 로그인 상태에서 /login을 열면 /library`);

	// 로그아웃 → /login, 뒤로 가기로 서재를 열면 다시 로그인 화면
	await page.waitForFunction(() => document.body.dataset.hydrated === '1');
	await page.getByRole('button', { name: '로그아웃' }).click();
	await page.waitForURL((u) => u.pathname === '/login');
	report(!(await context.cookies()).some((c) => c.name === 'archi_session'), `${tag} 로그아웃하면 /login으로 가고 세션 쿠키 삭제`);
	await page.goBack();
	await page.waitForURL((u) => u.pathname === '/login' && u.searchParams.get('redirect')?.startsWith('/library'), { timeout: 10000 });
	report(true, `${tag} 로그아웃 뒤 뒤로 가기로 서재를 열면 /login?redirect=/library…`);

	// 세션 만료 안내
	await openApp(page, '/login?expired=1');
	report((await textOf(page)).includes('세션이 끝났습니다'), `${tag} /login?expired=1에 세션 만료 안내`);

	// 같은 IP의 틀린 로그인 6번째는 시도 제한 안내
	sql("delete from public.archi_login_attempts where ip in ('127.0.0.1', '::1', '::ffff:127.0.0.1')");
	await openApp(page, '/login');
	let last = '';
	for (let i = 0; i < 6; i++) {
		await loginWith(page, email, `wrong-password-${i}`);
		await page.waitForFunction(() => !document.querySelector('button[aria-busy="true"]'));
		last = await alertText(page);
	}
	report(last.includes('시도가 너무 많습니다'), `${tag} 틀린 로그인 6번째에 시도 제한 안내`);
	sql("delete from public.archi_login_attempts where ip in ('127.0.0.1', '::1', '::ffff:127.0.0.1')");
	await context.close();
}

async function libraryMock() {
	const tag = '서재(가짜 응답)';
	const { context } = await loggedInContext({ viewport: { width: 1280, height: 900 } });
	const page = await context.newPage();
	const pageOne = [paper(1, 'Attention Is All You Need', { hasPdf: true, hasMemo: true }), paper(2, 'BERT', { hasPdf: true }), paper(3, 'ViT')];
	const pageTwo = [paper(4, 'GPT-3'), paper(5, 'T5')];
	let papersHandler = (u) => (u.searchParams.get('cursor') === 'c2' ? list(pageTwo) : list(pageOne, 'c2'));
	let zoteroHandler = () => ({ body: CONNECTED });
	const handlers = {
		'GET /api/papers': (u) => papersHandler(u),
		'GET /api/collections': () => ({ body: COLLECTIONS }),
		'GET /api/zotero/status': () => zoteroHandler()
	};
	const calls = await mockApi(page, handlers);
	const paperCalls = () => calls.filter((c) => c.method === 'GET' && c.path === '/api/papers');

	// 불러오는 중
	papersHandler = () => ({ ...list(pageOne, 'c2'), delay: 1500 });
	await openApp(page, '/library');
	report((await textOf(page)).includes('논문을 불러오는 중'), `${tag} 응답 전 불러오는 중 표시`);
	await page.locator('.paper').first().waitFor();
	papersHandler = (u) => (u.searchParams.get('cursor') === 'c2' ? list(pageTwo) : list(pageOne, 'c2'));

	// 목록과 표시
	const titles = await page.locator('.paper .title').allInnerTexts();
	const firstBadges = await page.locator('.paper').nth(0).locator('.badge').allInnerTexts();
	const secondBadges = await page.locator('.paper').nth(1).locator('.badge').allInnerTexts();
	report(
		titles.join('|') === 'Attention Is All You Need|BERT|ViT' && firstBadges.join() === 'PDF,메모' && secondBadges.join() === 'PDF',
		`${tag} 목록은 응답 순서대로, PDF·메모 표시 구분`
	);
	await page.screenshot({ path: `${outDir}/library-list.png`, fullPage: true });

	// 더 보기
	await page.getByRole('button', { name: '더 보기' }).click();
	await page.waitForFunction(() => document.querySelectorAll('.paper').length === 5);
	const moreCall = paperCalls().at(-1);
	report(
		moreCall.params.get('cursor') === 'c2' && (await page.getByRole('button', { name: '더 보기' }).count()) === 0,
		`${tag} 더 보기는 cursor=c2로 요청해 뒤에 이어 붙이고 마지막이면 버튼이 사라짐`
	);

	// 항목 열기
	await page.locator('.paper-link').nth(1).click();
	await page.waitForURL((u) => u.pathname.startsWith('/papers/'));
	report(new URL(page.url()).pathname === `/papers/${paperId(2)}`, `${tag} 항목을 누르면 /papers/<그 논문 id>`);

	// 오류 → 다시 시도
	papersHandler = () => ({ status: 500, body: { error: { code: 'internal_error', message: '' } } });
	await openApp(page, '/library');
	await page.getByRole('alert').waitFor();
	const retryButton = page.getByRole('button', { name: '다시 시도' });
	report((await retryButton.count()) === 1, `${tag} 목록 요청 실패는 다시 시도 버튼이 있는 오류 패널`);
	papersHandler = () => list(pageOne);
	await retryButton.click();
	await page.locator('.paper').first().waitFor();
	report((await page.locator('.paper').count()) === 3, `${tag} 다시 시도하면 목록 표시`);

	// 검색: 입력 후 280ms 멈추면 한 번만 요청
	papersHandler = (u) => {
		const q = u.searchParams.get('query') ?? '';
		if (q === 'att') return { ...list([paper(9, 'att 결과 (늦게 온 이전 응답)')]), delay: 1500 };
		if (q === 'attention') return list([pageOne[0]]);
		if (q === 'zzz') return list([]);
		return list(pageOne);
	};
	const search = page.getByRole('searchbox', { name: '논문 검색' });
	let before = paperCalls().length;
	await search.click();
	await page.keyboard.type('attention', { delay: 60 });
	await page.waitForURL((u) => u.searchParams.get('query') === 'attention');
	await page.waitForTimeout(600);
	const searchCalls = paperCalls().slice(before);
	report(
		searchCalls.length === 1 && searchCalls[0].params.get('query') === 'attention',
		`${tag} attention 입력 뒤 요청은 1번(query=attention)이고 주소에 반영`
	);

	// 새로 고침 뒤에도 검색어 유지
	await page.reload();
	await page.waitForFunction(() => document.body.dataset.hydrated === '1');
	await page.locator('.paper').first().waitFor();
	report((await search.inputValue()) === 'attention' && (await page.locator('.paper').count()) === 1, `${tag} 새로 고침 뒤 입력창 값과 결과 유지`);

	// 늦게 도착한 이전 응답이 새 결과를 덮지 않음
	await search.fill('');
	await page.waitForURL((u) => !u.searchParams.has('query'));
	await page.locator('.paper').nth(2).waitFor();
	await search.click();
	await page.keyboard.type('att');
	await page.waitForTimeout(450);
	await page.keyboard.type('ention');
	await page.waitForURL((u) => u.searchParams.get('query') === 'attention');
	await page.waitForTimeout(1800);
	const afterRace = await page.locator('.paper .title').allInnerTexts();
	report(afterRace.join('|') === 'Attention Is All You Need', `${tag} att의 늦은 응답이 와도 attention 결과 유지`);

	// 결과 없음과 검색어 지우기
	await search.fill('zzz');
	await page.getByText('검색어에 맞는 논문이 없습니다').waitFor();
	await page.getByRole('button', { name: '검색어 지우기' }).first().click();
	await page.waitForURL((u) => !u.searchParams.has('query'));
	report((await search.inputValue()) === '', `${tag} 결과 없음 문구와 검색어 지우기`);

	// 컬렉션: 들여쓰기, 선택과 해제, 검색과 함께
	await page.locator('.paper').nth(2).waitFor();
	await page.locator('details.collections summary').click();
	const pad = async (name) =>
		page.getByRole('button', { name }).evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
	report((await pad('트랜스포머 1')) > (await pad('자연어 처리 2')), `${tag} 하위 컬렉션은 들여쓰기`);
	await page.getByRole('button', { name: '트랜스포머 1' }).click();
	await page.waitForURL((u) => u.searchParams.get('collection') === 'TRANS001');
	before = paperCalls().length;
	await search.click();
	await page.keyboard.type('attention', { delay: 40 });
	await page.waitForURL((u) => u.searchParams.get('query') === 'attention');
	await page.waitForTimeout(500);
	const combined = paperCalls().slice(before).at(-1);
	report(
		combined?.params.get('collection') === 'TRANS001' && combined?.params.get('query') === 'attention',
		`${tag} 컬렉션과 검색을 함께 쓴 요청(collection=TRANS001&query=attention)`
	);
	if (!(await page.locator('details.collections').evaluate((d) => d.open))) await page.locator('details.collections summary').click();
	await page.getByRole('button', { name: '트랜스포머 1' }).click();
	await page.waitForURL((u) => !u.searchParams.has('collection'));
	report(new URL(page.url()).searchParams.get('query') === 'attention', `${tag} 같은 컬렉션을 다시 누르면 필터 해제(검색어는 유지)`);

	// 동기화 성공
	await search.fill('');
	await page.waitForURL((u) => !u.searchParams.has('query'));
	handlers['POST /api/zotero/sync'] = () => ({ body: { added: 3, updated: 1, removed: 0, syncedAt: '2026-10-23T10:00:00Z' } });
	before = paperCalls().length;
	await page.getByRole('button', { name: '동기화' }).click();
	await page.getByText('3건 추가, 1건 갱신, 0건 삭제').waitFor();
	await page.waitForTimeout(300);
	report(paperCalls().length > before, `${tag} 동기화 성공 문구 "3건 추가, 1건 갱신, 0건 삭제"와 목록 다시 불러옴`);

	// 웹페이지 추가: 400은 입력 유지, 201은 닫히고 목록 갱신
	handlers['POST /api/papers/webpage'] = (u, request) =>
		JSON.parse(request.postData()).url === 'not a url'
			? { status: 400, body: { error: { code: 'invalid_request', message: '' } } }
			: { status: 201, body: { ...paper(7, 'A Web Page'), itemKey: 'WEB00001', s2PaperId: null, attachment: { type: 'html' }, translationCount: 0, analysisCount: 0 } };
	await page.getByRole('button', { name: '웹페이지 추가' }).click();
	const urlField = page.getByLabel('웹페이지 주소');
	await urlField.fill('not a url');
	await page.getByRole('button', { name: '추가', exact: true }).click();
	await page.waitForFunction(() => document.querySelector('input[type="url"]')?.getAttribute('aria-invalid') === 'true');
	report(
		(await urlField.inputValue()) === 'not a url' && (await textOf(page)).includes('주소가 올바르지 않습니다'),
		`${tag} 웹페이지 추가 400은 입력 유지와 주소 안내`
	);
	papersHandler = () => list([paper(7, 'A Web Page'), ...pageOne]);
	await urlField.fill('https://example.com/post');
	await page.getByRole('button', { name: '추가', exact: true }).click();
	await page.getByText('A Web Page').waitFor();
	report((await page.getByLabel('웹페이지 주소').count()) === 0, `${tag} 웹페이지 추가 201은 입력이 닫히고 새 항목 표시`);

	// 삭제: 확인 문구, 실패는 대화상자 안 오류와 항목 유지, 성공은 목록에서 제거
	handlers['DELETE /api/papers/:id'] = () => ({ status: 502, body: { error: { code: 'zotero_unavailable', message: '' } } });
	const deleteButton = page.getByRole('button', { name: 'BERT 삭제' });
	await deleteButton.click();
	const dialog = page.locator('dialog[open]');
	await dialog.waitFor();
	report(
		(await dialog.innerText()).includes('Zotero 휴지통으로 이동하고 연결된 번역·분석 이력도 함께 삭제됩니다'),
		`${tag} 삭제 버튼은 휴지통 이동과 이력 삭제를 알리는 확인 대화상자`
	);
	await dialog.getByRole('button', { name: '삭제' }).click();
	await dialog.getByRole('alert').waitFor();
	report((await page.locator('.paper .title', { hasText: 'BERT' }).count()) === 1, `${tag} 삭제 실패는 대화상자 안 오류, 항목 유지`);
	handlers['DELETE /api/papers/:id'] = () => ({ status: 204 });
	await dialog.getByRole('button', { name: '삭제' }).click();
	await page.locator('dialog[open]').waitFor({ state: 'detached' }).catch(() => {});
	await page.waitForFunction(() => !document.querySelector('dialog')?.open);
	report(
		(await page.locator('.paper .title', { hasText: 'BERT' }).count()) === 0 &&
			calls.some((c) => c.method === 'DELETE' && c.path === `/api/papers/${paperId(2)}`),
		`${tag} 삭제 성공은 목록에서 제거`
	);

	// 동기화 409는 연결 안내로
	handlers['POST /api/zotero/sync'] = () => ({ status: 409, body: { error: { code: 'zotero_not_connected', message: '' } } });
	await page.getByRole('button', { name: '동기화' }).click();
	await page.getByText('Zotero가 연결되어 있지 않아').waitFor();
	report(
		(await page.getByRole('alert').count()) === 0 && (await page.getByRole('link', { name: '연결' }).getAttribute('href')) === '/api/zotero/connect',
		`${tag} 동기화 409는 오류가 아니라 연결 안내`
	);

	// 연결 전 빈 서재
	zoteroHandler = () => ({ body: { connected: false } });
	papersHandler = () => list([]);
	await openApp(page, '/library');
	await page.getByText('Zotero를 연결해 주세요').waitFor();
	report(
		(await page.getByRole('link', { name: 'Zotero 연결' }).getAttribute('href')) === '/api/zotero/connect' && (await page.locator('.paper').count()) === 0,
		`${tag} 연결 전 빈 서재는 연결 안내 패널과 연결 버튼`
	);
	await page.screenshot({ path: `${outDir}/library-connect.png`, fullPage: true });

	// 사용 중 세션 만료: 목록 요청이 401이면 로그인 화면과 만료 안내
	zoteroHandler = () => ({ body: CONNECTED });
	papersHandler = () => list(pageOne);
	await openApp(page, '/library');
	await page.locator('.paper').first().waitFor();
	await context.clearCookies();
	papersHandler = () => ({ status: 401, body: { error: { code: 'unauthenticated', message: '' } } });
	await search.click();
	await page.keyboard.type('x');
	await page.waitForURL((u) => u.pathname === '/login', { timeout: 10000 });
	await page.waitForFunction(() => document.body.dataset.hydrated === '1');
	const loginUrl = new URL(page.url());
	report(
		loginUrl.searchParams.get('expired') === '1' &&
			loginUrl.searchParams.get('redirect') === '/library?query=x' &&
			(await textOf(page)).includes('세션이 끝났습니다'),
		`${tag} 사용 중 401이면 /login?redirect=…&expired=1과 만료 안내`
	);
	await context.close();
}

async function settingsMock() {
	const tag = '설정(가짜 응답)';
	const { context } = await loggedInContext({ viewport: { width: 1280, height: 900 } });
	const page = await context.newPage();
	let status = CONNECTED;
	const handlers = { 'GET /api/zotero/status': () => ({ body: status }) };
	const calls = await mockApi(page, handlers);

	await openApp(page, '/settings');
	await page.getByText('demo-user').waitFor();
	const text = await textOf(page);
	report(text.includes('연결됨') && text.includes('2026년 10월 20일'), `${tag} 연결됨: 사용자명과 마지막 동기화 시각`);
	report(
		(await page.locator('.menu a[aria-current="page"]').innerText()).includes('설정'),
		`${tag} 셸의 설정 링크가 현재 위치`
	);

	handlers['DELETE /api/zotero/connection'] = () => ({ status: 204 });
	await page.getByRole('button', { name: '연결 해제' }).click();
	const dialog = page.locator('dialog[open]');
	await dialog.waitFor();
	report((await dialog.innerText()).includes('논문 목록은 서재에 그대로 남습니다'), `${tag} 해제 확인 대화상자에 논문 목록 유지 안내`);
	await page.screenshot({ path: `${outDir}/settings-confirm.png` });
	await dialog.getByRole('button', { name: '연결 해제' }).click();
	await page.getByText('연결되어 있지 않습니다').waitFor();
	report(
		calls.some((c) => c.method === 'DELETE' && c.path === '/api/zotero/connection') && (await textOf(page)).includes('논문 목록은 그대로'),
		`${tag} 해제 성공(204) 뒤 연결 안 됨 상태와 목록 유지 안내`
	);

	status = { connected: false };
	await openApp(page, '/settings');
	await page.getByText('연결되어 있지 않습니다').waitFor();
	report(
		(await page.getByRole('link', { name: 'Zotero 연결' }).getAttribute('href')) === '/api/zotero/connect',
		`${tag} 연결 안 됨: 연결 버튼`
	);

	for (const reason of ['denied', 'error']) {
		await openApp(page, `/settings?zotero=${reason}`);
		await page.getByRole('alert').waitFor();
		report(
			(await page.getByRole('alert').innerText()).includes('연결되지 않았습니다') &&
				(await page.getByRole('link', { name: 'Zotero 다시 연결' }).getAttribute('href')) === '/api/zotero/connect',
			`${tag} /settings?zotero=${reason}: 오류 안내와 다시 연결 버튼`
		);
	}
	await page.screenshot({ path: `${outDir}/settings-denied.png` });
	await context.close();
}

// 화면별 배치: 라이트·다크 × 1280·767·390에서 가로 넘침 0px, 셸 화면은 1280에서 세 영역 표시
async function layouts() {
	const screens = [
		{ name: 'login', path: '/login', shell: false },
		{ name: 'signup', path: '/signup', shell: false },
		{
			name: 'pending',
			path: '/signup',
			shell: false,
			prepare: async (page) => {
				await page.route('**/api/auth/signup', (route) =>
					route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ status: 'pending_approval' }) })
				);
				await page.getByLabel('이메일').fill('someone@example.com');
				await page.getByLabel('비밀번호').fill('12345678');
				await page.getByRole('button', { name: '가입하기' }).click();
				await page.getByRole('heading', { name: '가입 신청이 접수되었습니다' }).waitFor();
			}
		},
		{ name: 'library', path: '/library', shell: true, papers: () => list([paper(1, 'Attention Is All You Need: a very long title that should wrap instead of overflowing the narrow screen', { hasPdf: true, hasMemo: true }), paper(2, 'BERT', { hasPdf: true })], 'c2') },
		{ name: 'library-empty', path: '/library', shell: true, papers: () => list([]) },
		{ name: 'library-error', path: '/library', shell: true, papers: () => ({ status: 500, body: { error: { code: 'internal_error', message: '' } } }) },
		{ name: 'settings', path: '/settings', shell: true },
		{
			name: 'translate',
			path: '/translate',
			shell: true,
			prepare: async (page) => {
				await page.getByLabel('원문').fill('Attention is all you need, and a fairly long sentence to see how the result wraps on a narrow phone screen.');
				await page.getByRole('button', { name: '번역', exact: true }).click();
				await page.waitForFunction(() => document.querySelector('[aria-label="번역 결과"]')?.getAttribute('aria-busy') === 'false');
			}
		},
		{ name: 'analyze', path: `/analyze?paperId=${paperId(1)}`, shell: true, prepare: (page) => page.locator('#analysis-title').waitFor() },
		{ name: 'analyze-picker', path: '/analyze', shell: true, prepare: (page) => page.getByRole('option').first().waitFor() }
	];
	let session = null;
	for (const scheme of ['light', 'dark']) {
		for (const screen of screens) {
			let context;
			if (screen.shell) {
				// 한 계정을 만들어 저장된 쿠키로 다시 쓴다
				if (!session) {
					const made = await loggedInContext({});
					session = await made.context.storageState();
					await made.context.close();
				}
				context = await browser.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 800 }, storageState: session });
				await context.addInitScript(installFakeTranslate);
			} else {
				context = await browser.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 800 } });
			}
			const page = await context.newPage();
			if (screen.shell) {
				const handlers = {
					'GET /api/papers': () => (screen.papers ?? (() => list([paper(1, 'Attention Is All You Need'), paper(2, 'BERT')])))(),
					'GET /api/collections': () => ({ body: COLLECTIONS }),
					'GET /api/zotero/status': () => ({ body: CONNECTED }),
					'GET /api/translate/history': () => ({ body: { items: Array.from({ length: 3 }, (_, i) => historyRecord(i + 1)) } }),
					'GET /api/papers/:id': () => ({ body: { ...paper(1, 'Attention Is All You Need'), itemKey: 'K', s2PaperId: null, attachment: { type: 'pdf' }, translationCount: 0, analysisCount: 0 } })
				};
				const analysisPath = `GET /api/papers/${paperId(1)}/analysis`;
				handlers[analysisPath] = () => ({ body: analysisOf(paperId(1)) });
				await mockApi(page, handlers);
			}
			await openApp(page, screen.path);
			if (screen.prepare) await screen.prepare(page);
			await page.waitForTimeout(400);
			for (const width of [1280, 767, 390]) {
				await page.setViewportSize({ width, height: 800 });
				await page.waitForTimeout(150);
				const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
				let areas = '';
				if (screen.shell && width === 1280) {
					const visible = await Promise.all(['.menu', '.work', '.panel'].map((sel) => page.locator(sel).first().isVisible()));
					areas = visible.every(Boolean) ? ', 세 영역 표시' : ', 세 영역 중 빠짐';
					if (!visible.every(Boolean)) failed = true;
				}
				const text = (await page.locator('body').innerText()).trim().length;
				report(overflow <= 0 && text > 0, `${scheme} ${screen.name} ${width}px 가로 넘침 ${Math.max(overflow, 0)}px${areas}`);
				await page.screenshot({ path: `${outDir}/${scheme}-${screen.name}-${width}.png`, fullPage: true });
			}
			await context.close();
		}
	}
}

// 실제 서버: 논문 55건(한 쪽 50건), 그중 제목에 Attention이 든 6건, 컬렉션 REAL0001에 든 10건(그중 Attention 1건)
async function libraryReal() {
	const tag = '서재(실제 서버)';
	const { context, email } = await loggedInContext({ viewport: { width: 1280, height: 900 } });
	const userId = sql(`select id from auth.users where email = '${email}'`);
	sql(`insert into public.folio_users (id, zotero_username) values ('${userId}', 'ui-check')`);
	sql(`insert into public.archi_collections (user_id, key, name, parent_key) values
		('${userId}', 'REAL0001', '실험 컬렉션', null), ('${userId}', 'REAL0002', '하위 컬렉션', 'REAL0001')`);
	sql(`insert into public.papers (user_id, item_key, title, authors, year, collections, synced_at)
		select '${userId}', 'UICHK' || lpad(n::text, 3, '0'),
			case when n % 8 = 0 then 'Attention Study ' || n else 'Paper ' || lpad(n::text, 3, '0') end,
			'["Test Author"]'::jsonb, '2024',
			case when n <= 10 then '["REAL0001"]'::jsonb else '[]'::jsonb end,
			now() - (n || ' minutes')::interval
		from generate_series(1, 55) as n`);
	const page = await context.newPage();
	await openApp(page, '/library');
	await page.locator('.paper').first().waitFor();
	report((await page.locator('.paper').count()) === 50, `${tag} 첫 쪽 50건`);
	report((await page.locator('.paper .title').first().innerText()) === 'Paper 001', `${tag} 최근 동기화 순(가장 최근 Paper 001이 처음)`);
	await page.getByRole('button', { name: '더 보기' }).click();
	await page.waitForFunction(() => document.querySelectorAll('.paper').length === 55);
	const titles = await page.locator('.paper .title').allInnerTexts();
	report(new Set(titles).size === 55 && (await page.getByRole('button', { name: '더 보기' }).count()) === 0, `${tag} 더 보기로 55건, 중복 없음`);

	const search = page.getByRole('searchbox', { name: '논문 검색' });
	await search.click();
	await page.keyboard.type('attention', { delay: 40 });
	await page.waitForURL((u) => u.searchParams.get('query') === 'attention');
	await page.waitForFunction(() => document.querySelectorAll('.paper').length === 6);
	report(true, `${tag} attention 검색 6건`);

	await page.locator('details.collections summary').click();
	await page.getByRole('button', { name: /^실험 컬렉션/ }).click();
	await page.waitForURL((u) => u.searchParams.get('collection') === 'REAL0001');
	await page.waitForFunction(() => document.querySelectorAll('.paper').length === 1);
	report((await page.locator('.paper .title').innerText()) === 'Attention Study 8', `${tag} 검색과 컬렉션을 함께 쓰면 1건(Attention Study 8)`);

	await search.fill('');
	await page.waitForURL((u) => !u.searchParams.has('query'));
	await page.waitForFunction(() => document.querySelectorAll('.paper').length === 10);
	report(true, `${tag} 컬렉션만 고르면 10건`);
	await page.screenshot({ path: `${outDir}/library-real.png`, fullPage: true });
	await context.close();
}

// 브라우저의 fetch를 /api/translate에 한해 감싸 조각 응답을 흉내 낸다(route.fulfill은 조각으로 나눠 보내지 못한다).
// window.__fakeTranslate로 상황을 바꾸고 요청 본문과 취소 횟수를 읽는다.
function installFakeTranslate() {
	const realFetch = window.fetch.bind(window);
	const state = (window.__fakeTranslate = { mode: 'ok', delay: 150, status: 200, code: null, calls: [], aborted: 0 });
	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	window.fetch = async (input, init = {}) => {
		const target = typeof input === 'string' ? input : input.url;
		const path = new URL(target, location.href).pathname;
		if (path !== '/api/translate') return realFetch(input, init);
		const body = JSON.parse(init.body);
		state.calls.push(body);
		if (state.status !== 200) {
			return new Response(JSON.stringify({ error: { code: state.code, message: 'internal detail from server' } }), {
				status: state.status,
				headers: { 'content-type': 'application/json' }
			});
		}
		const enc = new TextEncoder();
		let parts;
		if (state.mode === 'split') {
			const all = enc.encode('안녕하세요');
			parts = [all.slice(0, 1), all.slice(1, 4), all.slice(4, 8), all.slice(8)];
		} else {
			parts = [`${body.text} → `, '번역', ' 결과'].map((t) => enc.encode(t));
		}
		let i = 0;
		const stream = new ReadableStream({
			async pull(controller) {
				await sleep(state.delay);
				if (init.signal?.aborted) {
					state.aborted++;
					controller.error(new DOMException('aborted', 'AbortError'));
					return;
				}
				if (state.mode === 'cut' && i === 2) {
					controller.error(new TypeError('network error'));
					return;
				}
				if (i >= parts.length) return controller.close();
				controller.enqueue(parts[i++]);
			}
		});
		return new Response(stream, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-cache': 'MISS' } });
	};
}

const fake = (page, patch) => page.evaluate((p) => Object.assign(window.__fakeTranslate, p), patch);
const fakeState = (page) => page.evaluate(() => ({ ...window.__fakeTranslate, calls: [...window.__fakeTranslate.calls] }));
const resultText = (page) => page.getByRole('region', { name: '번역 결과' }).innerText();
const historyRecord = (n, paperId = null) => ({
	id: `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
	sourceText: `source sentence ${n}`,
	translatedText: `번역문 ${n}`,
	type: 'sentence',
	paperId,
	createdAt: new Date(Date.UTC(2026, 9, 23, 9, 0) - n * 60000).toISOString()
});

async function translateScreens() {
	const tag = '번역';
	const { context } = await loggedInContext({ viewport: { width: 1280, height: 900 } });
	await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url });
	await context.addInitScript(installFakeTranslate);
	const page = await context.newPage();
	let history = [];
	const linked = paper(1, 'Attention Is All You Need');
	const handlers = {
		'GET /api/translate/history': (u) => ({
			body: { items: u.searchParams.get('paperId') ? history.filter((h) => h.paperId === u.searchParams.get('paperId')) : history }
		}),
		'GET /api/papers/:id': (u) =>
			u.pathname.endsWith(linked.id)
				? { body: { ...linked, itemKey: 'ITEM0001', s2PaperId: null, attachment: { type: 'pdf' }, translationCount: 0, analysisCount: 0 } }
				: { status: 404, body: { error: { code: 'paper_not_found', message: '' } } }
	};
	const calls = await mockApi(page, handlers);
	const historyCalls = () => calls.filter((c) => c.path === '/api/translate/history');
	const input = page.getByLabel('원문');
	const button = (name) => page.getByRole('button', { name, exact: true });

	await openApp(page, '/translate');
	report((await page.locator('.menu a[aria-current="page"]').innerText()).includes('번역'), `${tag} 메뉴의 번역 항목이 현재 위치`);
	report((await textOf(page)).includes('아직 번역한 기록이 없습니다'), `${tag} 이력이 비면 안내`);

	// 빈 입력
	await input.fill('   ');
	await input.press('Control+Enter');
	await page.waitForTimeout(300);
	report((await button('번역').isDisabled()) && (await fakeState(page)).calls.length === 0, `${tag} 빈 입력이면 버튼 비활성, Ctrl+Enter 요청 0번`);

	// 기본 흐름: 첫 조각 뒤 표시, 복사 비활성 → 완료 후 복사 활성
	await fake(page, { delay: 400 });
	await input.fill('attention is all you need');
	await input.press('Control+Enter');
	await page.waitForFunction(() => document.querySelector('[aria-label="번역 결과"]')?.textContent?.includes('→'));
	const midText = await resultText(page);
	report(
		midText.includes('attention is all you need →') && !midText.includes('결과') && (await button('복사').isDisabled()) && (await textOf(page)).includes('번역 중'),
		`${tag} 첫 조각 뒤 글자가 보이고 "번역 중", 복사 버튼 비활성`
	);
	report((await page.locator('#translate-input').inputValue()) === 'attention is all you need', `${tag} Ctrl+Enter로 실행해도 입력 유지`);
	await page.waitForFunction(() => document.querySelector('[aria-label="번역 결과"]')?.textContent?.includes('결과'));
	await page.waitForFunction(() => !document.querySelector('[aria-label="번역 결과"]')?.getAttribute('aria-busy')?.includes('true'));
	const status = page.locator('p.sr-only[role="status"]');
	report(
		(await status.innerText()) === '번역이 완료되었습니다' &&
			(await page.getByRole('region', { name: '번역 결과' }).getAttribute('aria-live')) === 'off',
		`${tag} 완료 안내는 상태 영역에 한 번, 결과 영역은 조각마다 읽지 않음(aria-live=off)`
	);
	report((await fakeState(page)).calls.length === 1, `${tag} Ctrl+Enter 한 번에 요청 1번`);
	await button('복사').click();
	await page.getByRole('button', { name: '복사됨' }).waitFor();
	const clip = await page.evaluate(() => navigator.clipboard.readText());
	report(clip === 'attention is all you need → 번역 결과', `${tag} 완료 후 복사하면 전체가 클립보드에 들어가고 "복사됨"`);
	report(historyCalls().length >= 2, `${tag} 번역이 끝나면 이력을 다시 불러옴`);

	// 한글 바이트 분할
	await fake(page, { mode: 'split', delay: 60 });
	await button('번역').click();
	await page.waitForFunction(() => document.querySelector('[aria-label="번역 결과"]')?.getAttribute('aria-busy') === 'false');
	const split = await resultText(page);
	report(split.trim() === '안녕하세요' && !split.includes('\uFFFD'), `${tag} 한글이 조각 경계에서 쪼개져도 깨진 글자 없음`);

	// 중지
	await fake(page, { mode: 'ok', delay: 500 });
	await button('번역').click();
	await page.waitForFunction(() => document.querySelector('[aria-label="번역 결과"]')?.textContent?.includes('→'));
	await button('중지').click();
	await page.getByText('중단됨').waitFor();
	const afterStop = await resultText(page);
	report(
		afterStop.includes('attention is all you need →') && !afterStop.includes('결과') && !(await button('번역').isDisabled()),
		`${tag} 중지하면 받은 글자는 남고 "중단됨", 번역 버튼 다시 활성`
	);
	await input.focus();
	await button('번역').click();
	await page.waitForFunction(() => document.querySelector('[aria-label="번역 결과"]')?.textContent?.includes('→'));
	await input.press('Escape');
	await page.getByText('중단됨').waitFor();
	report(true, `${tag} Escape로도 중지`);

	// 연속 실행
	await fake(page, { delay: 300 });
	await input.fill('first sentence');
	await button('번역').click();
	await page.waitForFunction(() => document.querySelector('[aria-label="번역 결과"]')?.textContent?.includes('first sentence'));
	await input.fill('second sentence');
	await button('번역').click();
	await page.waitForFunction(() => document.querySelector('[aria-label="번역 결과"]')?.getAttribute('aria-busy') === 'false', null, { timeout: 5000 });
	const consecutive = await resultText(page);
	report(
		consecutive.trim() === 'second sentence → 번역 결과' && !consecutive.includes('first'),
		`${tag} 진행 중 새로 실행하면 이전 요청 취소, 이전 글자 섞이지 않음`
	);

	// 5000자 자르기
	await input.fill('a'.repeat(5001));
	report(
		(await page.locator('#translate-input').inputValue()).length === 5000 && (await textOf(page)).includes('5000 / 5000'),
		`${tag} 5000자에서 잘리고 글자 수 5000 / 5000`
	);

	// 오류 상태
	await input.fill('error case');
	const errorCases = [
		[401, 'unauthenticated', '로그인이 필요합니다', { retry: false, login: true }],
		[500, 'internal_error', '일시적인 오류', { retry: true, login: false }],
		[502, 'ai_unavailable', '일시적인 오류', { retry: true, login: false }],
		[400, 'invalid_request', '입력을 확인해 주세요', { retry: false, login: false }],
		[413, 'payload_too_large', '입력을 확인해 주세요', { retry: false, login: false }],
		[503, 'ai_not_configured', '관리자에게 문의', { retry: false, login: false }]
	];
	for (const [code, name, text, expected] of errorCases) {
		await fake(page, { status: code, code: name, mode: 'ok', delay: 50 });
		await button('번역').click();
		const alert = page.getByRole('alert').filter({ hasText: text });
		await alert.waitFor({ timeout: 5000 });
		const retry = (await alert.getByRole('button', { name: '다시 시도' }).count()) === 1;
		const login = alert.getByRole('link', { name: '로그인하기' });
		const loginOk = expected.login
			? (await login.getAttribute('href')) === '/login?redirect=%2Ftranslate'
			: (await login.count()) === 0;
		const body = await page.locator('body').innerText();
		report(
			retry === expected.retry &&
				loginOk &&
				new URL(page.url()).pathname === '/translate' &&
				(await page.locator('#translate-input').inputValue()) === 'error case' &&
				!body.includes(name) &&
				!body.includes('internal detail'),
			`${tag} ${code} ${name}: 안내 "${text}", 다시 시도 ${expected.retry ? '있음' : '없음'}${expected.login ? ', 로그인 링크' : ''}, 입력 유지, 코드 문자열 노출 없음`
		);
	}
	await fake(page, { status: 500, code: 'internal_error' });
	await button('번역').click();
	await page.getByRole('alert').filter({ hasText: '일시적인 오류' }).waitFor();
	const beforeRetry = (await fakeState(page)).calls.length;
	await fake(page, { status: 200, code: null, delay: 50 });
	await page.getByRole('button', { name: '다시 시도' }).click();
	await page.waitForFunction(() => document.querySelector('[aria-label="번역 결과"]')?.textContent?.includes('결과'));
	const retried = (await fakeState(page)).calls;
	report(retried.length === beforeRetry + 1 && retried.at(-1).text === 'error case', `${tag} 다시 시도는 같은 입력으로 다시 요청`);

	await fake(page, { mode: 'cut', delay: 80 });
	await button('번역').click();
	await page.getByRole('alert').filter({ hasText: '연결이 끊겨' }).waitFor();
	report(
		(await resultText(page)).includes('error case → 번역') &&
			(await page.getByRole('alert').filter({ hasText: '연결이 끊겨' }).getByRole('button', { name: '다시 시도' }).count()) === 1,
		`${tag} 도중 끊기면 받은 글자 유지와 "다시 시도"`
	);
	await fake(page, { mode: 'ok' });

	// 이력: 20개씩, 선택하면 요청 없이 채우기
	history = Array.from({ length: 45 }, (_, i) => historyRecord(i + 1));
	await openApp(page, '/translate');
	await page.locator('.record').first().waitFor();
	const count = () => page.locator('.record').count();
	const first = await count();
	await button('더 보기').click();
	const second = await count();
	await button('더 보기').click();
	report(first === 20 && second === 40 && (await count()) === 45 && (await button('더 보기').count()) === 0, `${tag} 이력 20개 → 더 보기 40개 → 45개`);
	const lastHistory = historyCalls().at(-1);
	report(lastHistory.params.get('limit') === '200' && !lastHistory.params.has('paperId'), `${tag} 이력은 limit=200, 연결 없으면 paperId 없이`);
	const callsBefore = (await fakeState(page)).calls.length;
	await page.locator('.record').nth(2).click();
	report(
		(await page.locator('#translate-input').inputValue()) === 'source sentence 3' &&
			(await resultText(page)).trim() === '번역문 3' &&
			(await fakeState(page)).calls.length === callsBefore,
		`${tag} 이력 항목을 고르면 요청 없이 원문과 번역문 채움`
	);

	// 논문 연결
	history = [historyRecord(1, linked.id), historyRecord(2)];
	await openApp(page, `/translate?paperId=${linked.id}`);
	await page.getByText('Attention Is All You Need').first().waitFor();
	await input.fill('linked sentence');
	await button('번역').click();
	await page.waitForFunction(() => document.querySelector('[aria-label="번역 결과"]')?.getAttribute('aria-busy') === 'false');
	report((await fakeState(page)).calls.at(-1).paperId === linked.id, `${tag} 연결된 논문 제목 표시, 요청 본문에 paperId`);

	// 설정 패널: 연결 논문과 이력 범위
	const panel = page.locator('.panel');
	report(
		(await panel.getByRole('switch', { name: '자동 번역' }).getAttribute('aria-checked')) === 'false' &&
			(await panel.getByRole('button', { name: '연결 해제' }).count()) === 1,
		`${tag} 패널에 자동 번역(꺼짐)과 연결 해제`
	);
	await panel.getByLabel('이 논문만').check();
	await page.waitForTimeout(300);
	report(historyCalls().at(-1).params.get('paperId') === linked.id && (await count()) === 1, `${tag} 이 논문만이면 history?paperId=로 다시 조회`);
	await panel.getByRole('button', { name: '연결 해제' }).click();
	await page.waitForURL((u) => !u.searchParams.has('paperId'));
	await input.fill('unlinked sentence');
	await button('번역').click();
	await page.waitForFunction(() => document.querySelector('[aria-label="번역 결과"]')?.getAttribute('aria-busy') === 'false');
	report(
		!('paperId' in (await fakeState(page)).calls.at(-1)) &&
			(await panel.getByRole('button', { name: '연결 해제' }).count()) === 0 &&
			(await panel.getByText('이력 범위').count()) === 0,
		`${tag} 연결 해제 뒤 주소와 요청에서 paperId가 빠지고 패널의 연결·범위 항목 숨김`
	);

	// UUID가 아닌 paperId와 없는 논문
	const paperCallsBefore = calls.filter((c) => c.path.startsWith('/api/papers/')).length;
	await openApp(page, '/translate?paperId=abc');
	await page.getByRole('alert').filter({ hasText: '논문을 찾을 수 없습니다' }).waitFor();
	report(calls.filter((c) => c.path.startsWith('/api/papers/')).length === paperCallsBefore, `${tag} UUID가 아닌 paperId는 API를 부르지 않고 "논문을 찾을 수 없음"`);
	await openApp(page, `/translate?paperId=${paperId(99)}`);
	await page.getByRole('alert').filter({ hasText: '논문을 찾을 수 없습니다' }).waitFor();
	await page.getByRole('button', { name: '연결 없이 계속' }).click();
	await page.waitForURL((u) => !u.searchParams.has('paperId'));
	await input.fill('after missing');
	await button('번역').click();
	await page.waitForFunction(() => document.querySelector('[aria-label="번역 결과"]')?.getAttribute('aria-busy') === 'false');
	report(!('paperId' in (await fakeState(page)).calls.at(-1)), `${tag} 없는 논문에서 연결 없이 계속하면 paperId 없이 번역`);

	// 자동 번역
	await openApp(page, '/translate');
	await input.fill('typing without auto');
	await page.waitForTimeout(700);
	report((await fakeState(page)).calls.length === 0, `${tag} 자동 번역 꺼짐이면 입력만으로 요청 0번`);
	await panel.getByRole('switch', { name: '자동 번역' }).click();
	await fake(page, { delay: 400 });
	await input.fill('');
	await input.pressSequentially('auto one', { delay: 40 });
	await page.waitForFunction(() => window.__fakeTranslate.calls.length === 1, null, { timeout: 3000 });
	await page.waitForTimeout(150);
	report((await fakeState(page)).calls.length === 1, `${tag} 자동 번역을 켜고 0.3초 멈추면 요청 1번`);
	await input.pressSequentially(' more', { delay: 40 });
	await page.waitForFunction(() => window.__fakeTranslate.calls.length === 2, null, { timeout: 3000 });
	const autoState = await fakeState(page);
	report(autoState.aborted >= 1 && autoState.calls.at(-1).text === 'auto one more', `${tag} 입력을 계속하면 이전 요청 취소 후 다시 요청`);
	await page.reload();
	await page.waitForFunction(() => document.body.dataset.hydrated === '1');
	report((await panel.getByRole('switch', { name: '자동 번역' }).getAttribute('aria-checked')) === 'true', `${tag} 새로 고침 뒤에도 자동 번역 켜짐`);
	await panel.getByRole('switch', { name: '자동 번역' }).click();
	await context.close();

	// 저장소를 막은 문맥
	const blocked = await loggedInContext({ viewport: { width: 1280, height: 900 } });
	await blocked.context.addInitScript(() => {
		Object.defineProperty(window, 'localStorage', {
			get() {
				throw new DOMException('denied', 'SecurityError');
			}
		});
	});
	const blockedPage = await blocked.context.newPage();
	await mockApi(blockedPage, { 'GET /api/translate/history': () => ({ body: { items: [] } }) });
	const errors = [];
	blockedPage.on('pageerror', (e) => errors.push(e.message));
	await openApp(blockedPage, '/translate');
	const blockedSwitch = blockedPage.locator('.panel').getByRole('switch', { name: '자동 번역' });
	const initial = await blockedSwitch.getAttribute('aria-checked');
	await blockedSwitch.click();
	report(
		initial === 'false' && (await blockedSwitch.getAttribute('aria-checked')) === 'true' && errors.length === 0 && (await blockedPage.getByRole('alert').count()) === 0,
		`${tag} 저장소가 막혀도 기본값(꺼짐)으로 열리고 오류 없음`
	);

	// Tab 순서: 입력창 → 번역 → 중지(진행 중일 때만 활성) → 복사 → 이력 항목
	await blockedPage.unrouteAll({ behavior: 'ignoreErrors' });
	await mockApi(blockedPage, { 'GET /api/translate/history': () => ({ body: { items: [historyRecord(1)] } }) });
	await openApp(blockedPage, '/translate');
	await blockedPage.locator('.record').first().waitFor();
	await blockedPage.locator('.record').first().click();
	await blockedPage.getByLabel('원문').focus();
	const order = [];
	for (let i = 0; i < 3; i++) {
		await blockedPage.keyboard.press('Tab');
		order.push(
			await blockedPage.evaluate(() => {
				const el = document.activeElement;
				const outline = getComputedStyle(el).outlineStyle !== 'none';
				return `${el.classList.contains('record') ? '이력' : el.textContent.trim()}${outline ? '' : '(윤곽 없음)'}`;
			})
		);
	}
	report(order.join(' → ') === '번역 → 복사 → 이력', `${tag} Tab 순서 입력창 → ${order.join(' → ')}(중지는 진행 중에만 활성이라 건너뜀), 포커스 윤곽 표시`);
	await blocked.context.close();

	// 390px: 설정 버튼으로 패널이 겹쳐 열리고 포커스가 안으로
	const narrow = await loggedInContext({ viewport: { width: 390, height: 800 } });
	const narrowPage = await narrow.context.newPage();
	await mockApi(narrowPage, { 'GET /api/translate/history': () => ({ body: { items: [] } }) });
	await openApp(narrowPage, '/translate');
	await narrowPage.getByRole('button', { name: '설정 열기' }).click();
	await narrowPage.waitForFunction(() => document.activeElement?.closest('.panel'));
	report(
		(await narrowPage.locator('.panel').isVisible()) && (await narrowPage.locator('.panel').getByRole('switch', { name: '자동 번역' }).isVisible()),
		`${tag} 390px에서 설정 버튼으로 패널이 겹쳐 열리고 포커스가 패널 안으로`
	);
	await narrow.context.close();
}

// openapi.yaml의 Analysis 형식을 따른 고정 데이터
const analysisOf = (id, extra = {}) => ({
	paperId: id,
	summary: '긴 문장 번역의 병렬화가 어렵다.\n어텐션만으로 인코더·디코더를 만든다.\n번역 품질과 학습 속도가 모두 좋아졌다.',
	keywords: ['Transformer', 'Attention'],
	domain: '자연어 처리',
	problemShort: '긴 문장 번역의 병렬화가 어렵다.',
	problem: '순환 신경망은 순서대로 계산해야 해서 학습을 병렬로 나누기 어렵다.',
	methodShort: '어텐션만으로 인코더·디코더를 만든다.',
	method: '셀프 어텐션과 멀티헤드 어텐션으로 순환 구조를 대신한다.',
	conclusionShort: '번역 품질과 학습 속도가 모두 좋아졌다.',
	conclusion: 'WMT 2014 영어-독일어에서 BLEU 28.4를 얻었다.',
	basic: { title: 'Attention Is All You Need', year: 2017, venue: 'NeurIPS', doi: '10.48550/arXiv.1706.03762', arxivId: '1706.03762', citationCount: 100000 },
	authors: [{ name: 'Ashish Vaswani', hIndex: 30, citationCount: 150000 }],
	journalScore: { matchedTitle: 'Nature Reviews Molecular Cell Biology', sjr: 35.568, quartile: 'Q1', issn: '14710072', type: 'journal', country: 'United Kingdom' },
	sources: { pdf: true, semanticScholar: true },
	...extra
});
const NULL_SCORE = { matchedTitle: null, sjr: null, quartile: null, issn: null, type: null, country: null };
const apiError = (status, code) => ({ status, body: { error: { code, message: 'internal detail from server' } } });

async function analyzeScreens() {
	const tag = '분석';
	const { context } = await loggedInContext({ viewport: { width: 1280, height: 900 } });
	await context.addInitScript(installFakeTranslate);
	const page = await context.newPage();
	const papers = [paper(1, 'Attention Is All You Need'), paper(2, 'BERT'), paper(3, 'ViT')];
	let papersHandler = (u) => list(u.searchParams.get('query') === 'attention' ? [papers[0], papers[1]] : papers);
	let getHandler = () => apiError(404, 'analysis_not_found');
	let postHandler = () => ({ body: analysisOf(paperId(1)) });
	const handlers = {
		'GET /api/papers': (u) => papersHandler(u),
		'GET /api/papers/:id': (u) => {
			const found = papers.find((p) => u.pathname.endsWith(p.id));
			return found
				? { body: { ...found, itemKey: 'K', s2PaperId: null, attachment: { type: 'pdf' }, translationCount: 0, analysisCount: 0 } }
				: apiError(404, 'paper_not_found');
		},
		'GET /api/papers/:id/analysis': () => getHandler(),
		'POST /api/papers/:id/analysis': () => postHandler(),
		'GET /api/translate/history': () => ({ body: { items: [] } }),
		'GET /api/collections': () => ({ body: [] }),
		'GET /api/zotero/status': () => ({ body: CONNECTED })
	};
	// 경로 끝 UUID만 :id로 바꾸는 mockApi와 달리 분석 경로는 가운데에 UUID가 있어 따로 맞춘다
	const calls = await mockApi(page, new Proxy(handlers, {
		get(target, key) {
			if (typeof key === 'string') {
				const m = key.match(/^(GET|POST) \/api\/papers\/[0-9a-f-]{36}\/analysis$/);
				if (m) return target[`${m[1]} /api/papers/:id/analysis`];
			}
			return target[key];
		}
	}));
	const count = (method, suffix) => calls.filter((c) => c.method === method && c.path.endsWith(suffix)).length;

	// 논문 선택기
	await openApp(page, '/analyze');
	await page.getByRole('option').first().waitFor();
	report((await page.getByRole('option').count()) === 3, `${tag} paperId 없이 열면 선택기에 최근 논문`);
	const search = page.getByRole('searchbox', { name: '분석할 논문 검색' });
	await search.click();
	await page.keyboard.type('attention', { delay: 40 });
	await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 2);
	const last = calls.filter((c) => c.path === '/api/papers').at(-1);
	report(last.params.get('query') === 'attention' && last.params.get('limit') === '20', `${tag} 검색 요청 query=attention&limit=20`);
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	await page.waitForURL((u) => u.searchParams.get('paperId') === paperId(2));
	report(true, `${tag} 화살표와 Enter로 고르면 /analyze?paperId=<id>`);

	papersHandler = (u) => list(u.searchParams.get('query') ? [] : []);
	await openApp(page, '/analyze');
	await page.getByText('아직 서재에 논문이 없습니다').waitFor();
	report((await page.getByRole('link', { name: '서재로 가기' }).getAttribute('href')) === '/library', `${tag} 서재가 비면 안내와 서재 링크`);
	await search.fill('zzz');
	await page.getByText('검색어에 맞는 논문이 없습니다').waitFor();
	report((await search.inputValue()) === 'zzz', `${tag} 검색 결과가 없으면 안내, 검색어 유지`);
	papersHandler = (u) => list(u.searchParams.get('query') === 'attention' ? [papers[0], papers[1]] : papers);

	// 분석되지 않은 논문: 열 때 POST 0번, 시작하면 POST 1번
	const target = `/analyze?paperId=${paperId(1)}`;
	const getsAtOpen = count('GET', '/analysis');
	await openApp(page, target);
	await page.getByRole('button', { name: '분석 시작' }).waitFor();
	await page.waitForTimeout(300);
	report(count('POST', '/analysis') === 0 && count('GET', '/analysis') === getsAtOpen + 1, `${tag} 열면 GET만 보내고 저장된 분석이 없으면 "분석 시작"`);
	postHandler = () => ({ body: analysisOf(paperId(1)), delay: 1500 });
	await page.getByRole('button', { name: '분석 시작' }).click();
	await page.getByText('분석 중입니다').waitFor();
	const busyButton = page.getByRole('button', { name: '분석 시작' });
	report((await busyButton.getAttribute('aria-busy')) === 'true', `${tag} 시작하면 "분석 중"과 버튼 진행 중 표시`);
	await busyButton.click({ force: true });
	await busyButton.click({ force: true });
	await page.locator('#analysis-title').waitFor();
	report(count('POST', '/analysis') === 1, `${tag} 분석 중에 여러 번 눌러도 POST 1번`);

	// 결과 표시
	const resultText = await page.locator('.result').innerText();
	report(
		resultText.includes('긴 문장 번역의 병렬화가 어렵다.') &&
			resultText.includes('어텐션만으로') &&
			(await page.locator('.quartile').innerText()) === 'Q1' &&
			resultText.includes('35.568') &&
			resultText.includes('Nature Reviews Molecular Cell Biology'),
		`${tag} 세 줄 요약, Q1 배지, SJR 35.568, 정식 이름 표시`
	);
	report(
		!(await page.locator('.result details').evaluate((d) => d.open)) && resultText.includes('자세히 보기'),
		`${tag} 자세한 설명은 접힌 채 펼쳐 보기`
	);
	report(
		(await page.getByRole('link', { name: '이 논문 번역하기' }).getAttribute('href')) === `/translate?paperId=${paperId(1)}` &&
			(await page.getByRole('link', { name: '논문 허브로' }).getAttribute('href')) === `/papers/${paperId(1)}`,
		`${tag} 번역 링크 /translate?paperId=<id>와 논문 허브 링크`
	);
	await page.screenshot({ path: `${outDir}/analyze-result.png`, fullPage: true });

	// 저장된 분석이 있으면 바로 결과, POST 0번
	getHandler = () => ({ body: analysisOf(paperId(1), { authors: [], basic: { ...analysisOf(paperId(1)).basic, doi: null }, journalScore: NULL_SCORE }) });
	const postsBefore = count('POST', '/analysis');
	await openApp(page, target);
	await page.locator('#analysis-title').waitFor();
	const saved = await page.locator('.result').innerText();
	report(count('POST', '/analysis') === postsBefore, `${tag} 저장된 분석이 있으면 바로 결과, POST 0번`);
	report(saved.includes('순위표에서 찾지 못한 학회·저널입니다') && (await page.locator('.quartile').count()) === 0, `${tag} 저널 점수 여섯 값이 모두 null이면 찾지 못했다는 안내`);
	report(!saved.includes('저자') && !saved.includes('DOI') && saved.includes('arXiv 1706.03762'), `${tag} 빈 저자와 null DOI는 숨기고 나머지는 표시`);

	// 설정 패널: 다시 불러오기, 변경
	const panel = page.locator('.panel');
	await panel.getByText('Attention Is All You Need').waitFor();
	const getsBefore = count('GET', '/analysis');
	await panel.getByRole('button', { name: '저장된 결과 다시 불러오기' }).click();
	await page.waitForTimeout(400);
	report(count('GET', '/analysis') === getsBefore + 1 && count('POST', '/analysis') === postsBefore, `${tag} 다시 불러오기는 GET 1번 추가, POST 0번`);
	await panel.getByRole('link', { name: '변경' }).click();
	await page.waitForURL((u) => u.pathname === '/analyze' && !u.searchParams.has('paperId'));
	await page.getByRole('option').first().waitFor();
	report(true, `${tag} 패널의 변경은 /analyze 선택기로`);

	// 새로 고침하면 GET부터 다시
	getHandler = () => apiError(404, 'analysis_not_found');
	postHandler = () => ({ body: analysisOf(paperId(1)), delay: 3000 });
	await openApp(page, target);
	await page.getByRole('button', { name: '분석 시작' }).click();
	await page.getByText('분석 중입니다').waitFor();
	const getsBeforeReload = count('GET', '/analysis');
	await page.reload();
	await page.waitForFunction(() => document.body.dataset.hydrated === '1');
	await page.getByRole('button', { name: '분석 시작' }).waitFor();
	report(count('GET', '/analysis') === getsBeforeReload + 1, `${tag} 분석 중 새로 고침하면 GET부터 다시, 저장 전이면 "분석 시작"`);

	// 오류 상태
	const cases = [
		[422, 'no_source_for_analysis', 'PDF나 외부 정보가 없는', { retry: false }],
		[500, 'internal_error', '일시적인 오류', { retry: true }],
		[502, 'upstream_unavailable', '일시적인 오류', { retry: true }],
		[401, 'unauthenticated', '로그인이 필요합니다', { retry: false, login: true }],
		[404, 'paper_not_found', '논문을 찾을 수 없습니다', { retry: false, picker: true }]
	];
	for (const [status, code, text, expected] of cases) {
		postHandler = () => apiError(status, code);
		await openApp(page, target);
		await page.getByRole('button', { name: '분석 시작' }).click();
		const alert = page.getByRole('alert').filter({ hasText: text });
		await alert.waitFor();
		const hasRetry = (await alert.getByRole('button', { name: '다시 시도' }).count()) === 1;
		let extra = true;
		if (expected.login) extra = (await alert.getByRole('link', { name: '로그인하기' }).getAttribute('href')) === `/login?redirect=${encodeURIComponent(target)}`;
		if (expected.picker) extra = (await alert.getByRole('link', { name: '다른 논문 고르기' }).getAttribute('href')) === '/analyze';
		const body = await page.locator('body').innerText();
		report(
			hasRetry === expected.retry && extra && new URL(page.url()).pathname === '/analyze' && !body.includes(code) && !body.includes('internal detail'),
			`${tag} ${status} ${code}: "${text}", 다시 시도 ${expected.retry ? '있음' : '없음'}${expected.login ? ', 로그인 링크(이동 없음)' : ''}${expected.picker ? ', 선택기 링크' : ''}`
		);
	}
	postHandler = () => apiError(500, 'internal_error');
	await openApp(page, target);
	await page.getByRole('button', { name: '분석 시작' }).click();
	await page.getByRole('button', { name: '다시 시도' }).waitFor();
	const postsBeforeRetry = count('POST', '/analysis');
	postHandler = () => ({ body: analysisOf(paperId(1)) });
	await page.getByRole('button', { name: '다시 시도' }).click();
	await page.locator('#analysis-title').waitFor();
	report(count('POST', '/analysis') === postsBeforeRetry + 1, `${tag} 다시 시도는 분석을 다시 요청`);

	await openApp(page, '/analyze?paperId=not-a-uuid');
	await page.getByRole('alert').filter({ hasText: '논문을 찾을 수 없습니다' }).waitFor();
	report(true, `${tag} UUID가 아닌 paperId는 "논문을 찾을 수 없음"`);

	// 화면을 옮기면 패널 내용이 바뀜
	getHandler = () => ({ body: analysisOf(paperId(1)) });
	await openApp(page, '/translate');
	await panel.getByRole('switch', { name: '자동 번역' }).waitFor();
	await page.locator('.menu').getByRole('link', { name: '분석' }).click();
	await page.waitForURL((u) => u.pathname === '/analyze');
	await panel.getByText('분석할 논문을 고르면').waitFor();
	report((await panel.getByRole('switch').count()) === 0, `${tag} 번역 → 분석으로 가면 패널이 분석 설정으로 바뀜`);
	await page.locator('.menu').getByRole('link', { name: '서재' }).click();
	await page.waitForURL((u) => u.pathname === '/library');
	await panel.getByText('선택한 도구의 설정이 여기에 표시됩니다.').waitFor();
	report(true, `${tag} 서재로 가면 패널이 기본 안내문으로 돌아옴`);
	await context.close();
}

// ---- 실행 ----

for (const scheme of ['light', 'dark']) {
	if (want('components')) await components(scheme);
}
if (want('signup')) await signupMock();
if (want('auth')) await authFlow();
if (want('library')) await libraryMock();
if (want('settings')) await settingsMock();
if (want('layout')) await layouts();
if (want('library-real')) await libraryReal();
if (want('translate')) await translateScreens();
if (want('analyze')) await analyzeScreens();
if (dbUsed) cleanupDb();

await browser.close();
process.exit(failed ? 1 : 0);

// 화면 검사(Playwright, Chromium). 실행 중인 개발 서버 주소와 스크린샷 폴더를 받는다.
// 사용: node scripts/ui-screens.mjs http://127.0.0.1:5273 <저장 폴더> [검사 묶음,...]
// 검사 묶음: components(공통 부품), signup(가입 화면, 가짜 응답), auth(로그인 흐름, 실제 인증 API),
// library(서재, 가짜 응답), settings(설정, 가짜 응답), layout(화면 크기·테마별 배치),
// library-real(로컬 DB에 SQL로 넣은 논문으로 실제 서버의 목록·검색·컬렉션·더 보기). 아무것도 주지 않으면 모두 돈다.
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
		{ name: 'settings', path: '/settings', shell: true }
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
			} else {
				context = await browser.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 800 } });
			}
			const page = await context.newPage();
			if (screen.shell) {
				await mockApi(page, {
					'GET /api/papers': () => (screen.papers ?? (() => list([])))(),
					'GET /api/collections': () => ({ body: COLLECTIONS }),
					'GET /api/zotero/status': () => ({ body: CONNECTED })
				});
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
if (dbUsed) cleanupDb();

await browser.close();
process.exit(failed ? 1 : 0);

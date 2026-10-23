// 셸 레이아웃 확인용 스크린샷. 실행 중인 서버 주소와 저장 폴더를 받는다.
// 사용: node scripts/shell-screens.mjs http://127.0.0.1:5273/dev/components <저장 폴더>
// 셸이 있으면서 로그인 없이 열리는 화면은 개발 서버의 /dev/components뿐이다.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [url = 'http://127.0.0.1:5273/dev/components', outDir = '.'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
let failed = false;
const report = (ok, text) => {
	if (!ok) failed = true;
	console.log(`${ok ? 'OK  ' : 'FAIL'} ${text}`);
};

for (const scheme of ['light', 'dark']) {
	const context = await browser.newContext({
		colorScheme: scheme,
		viewport: { width: 1280, height: 800 }
	});
	const page = await context.newPage();
	await page.goto(url);
	await page.waitForLoadState('networkidle');

	// 클라이언트 연결(하이드레이션)이 끝나기 전의 클릭은 무시될 수 있다.
	// 열림 상태(aria-expanded)가 될 때까지 다시 누른다.
	const pressUntilExpanded = async (name) => {
		const button = page.getByRole('button', { name });
		for (let i = 0; i < 6; i++) {
			await button.click();
			try {
				await page.waitForFunction(
					(label) =>
						document.querySelector(`[aria-label="${label}"]`)?.getAttribute('aria-expanded') === 'true',
					name,
					{ timeout: 1500 }
				);
				return;
			} catch {
				await page.waitForTimeout(500);
			}
		}
	};

	// 1280px: 세 영역이 모두 보이는지
	const visible = async (sel) => (await page.locator(sel).first().isVisible());
	report(
		(await visible('.menu')) && (await visible('.work')) && (await visible('.panel')),
		`${scheme} 1280 세 영역 표시`
	);
	const texts = await page.evaluate(() => ({
		menu: document.querySelectorAll('.menu-item').length,
		work: document.querySelector('.work')?.textContent?.trim().length ?? 0,
		panel: document.querySelector('.panel')?.textContent?.trim().length ?? 0
	}));
	report(texts.menu === 5 && texts.work > 0 && texts.panel > 0, `${scheme} 1280 메뉴 항목 5개와 빈 상태 문구 존재`);
	await page.screenshot({ path: `${outDir}/${scheme}-1280.png` });

	// 768px 경계: 767에서는 접힘
	await page.setViewportSize({ width: 767, height: 800 });
	report(!(await visible('.menu')) && !(await visible('.panel')), `${scheme} 767 두 패널 접힘`);

	// 390px: 가로 스크롤 없음, 버튼으로 열림
	await page.setViewportSize({ width: 390, height: 800 });
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	report(overflow <= 0, `${scheme} 390 가로 스크롤 없음 (넘침 ${overflow}px)`);
	await page.screenshot({ path: `${outDir}/${scheme}-390.png` });

	// 포커스 검사용 도우미: 지금 포커스가 선택자 안에 있는지, 어느 열기 버튼인지
	const activeIn = (sel) => page.evaluate((s) => !!document.activeElement?.closest(s), sel);
	const activeLabel = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
	// 배경(.work)에 포커스를 줄 수 있는 요소를 하나 심어 inert 가 막는지 본다
	await page.evaluate(() => {
		const probe = document.createElement('button');
		probe.id = 'focus-probe';
		probe.textContent = 'probe';
		document.querySelector('.work')?.append(probe);
	});
	const probeFocusable = () =>
		page.evaluate(() => {
			const probe = document.getElementById('focus-probe');
			probe?.focus();
			return document.activeElement === probe;
		});

	// 접힌 상태: 탭 순서에 두 패널이 들어오지 않는다
	await page.evaluate(() => document.body.focus());
	let strayInCollapsed = false;
	for (let i = 0; i < 6; i++) {
		await page.keyboard.press('Tab');
		if (await activeIn('.menu, .panel')) strayInCollapsed = true;
	}
	report(!strayInCollapsed, `${scheme} 390 접힌 패널은 탭 순서에 없음`);
	await page.evaluate(() => document.activeElement?.blur());
	report(await probeFocusable(), `${scheme} 390 닫힌 동안 본문 요소는 포커스 가능(검사 도구 확인)`);
	await page.evaluate(() => document.activeElement?.blur());

	await pressUntilExpanded('메뉴 열기');
	report(await visible('.menu'), `${scheme} 390 메뉴 버튼으로 열림`);
	report(await activeIn('.menu'), `${scheme} 390 메뉴 열기 → 포커스가 메뉴 안`);
	report(!(await probeFocusable()), `${scheme} 390 메뉴 열린 동안 배경 요소에 포커스 불가`);
	await page.screenshot({ path: `${outDir}/${scheme}-390-menu.png` });

	// 안쪽 닫기 버튼 → 열기 버튼으로 복귀
	await page.locator('.menu .overlay-close').click();
	report(!(await visible('.menu')) && (await activeLabel()) === '메뉴 열기', `${scheme} 390 메뉴 닫기 버튼 → 메뉴 열기 버튼으로 복귀`);

	// 배경 면(scrim) 클릭 → 열기 버튼으로 복귀
	await pressUntilExpanded('메뉴 열기');
	await page.mouse.click(385, 700);
	report(!(await visible('.menu')) && (await activeLabel()) === '메뉴 열기', `${scheme} 390 배경 면 클릭 → 메뉴 열기 버튼으로 복귀`);

	await pressUntilExpanded('설정 열기');
	report((await visible('.panel')) && !(await visible('.menu')), `${scheme} 390 설정 버튼으로 열림`);
	report(await activeIn('.panel'), `${scheme} 390 설정 열기 → 포커스가 패널 안`);
	report(!(await probeFocusable()), `${scheme} 390 설정 열린 동안 배경 요소에 포커스 불가`);
	await page.screenshot({ path: `${outDir}/${scheme}-390-panel.png` });

	await page.keyboard.press('Escape');
	report(!(await visible('.panel')), `${scheme} 390 Escape로 닫힘`);
	report((await activeLabel()) === '설정 열기', `${scheme} 390 Escape → 설정 열기 버튼으로 복귀`);

	// 닫힌 뒤에는 배경 요소가 다시 포커스 가능
	report(await probeFocusable(), `${scheme} 390 닫힌 뒤 배경 요소 포커스 복구`);

	// 넓은 화면에서는 안쪽 닫기 버튼이 보이지 않는다
	await page.setViewportSize({ width: 1280, height: 800 });
	report(!(await visible('.overlay-close')), `${scheme} 1280 안쪽 닫기 버튼 숨김`);

	await context.close();
}

await browser.close();
process.exit(failed ? 1 : 0);

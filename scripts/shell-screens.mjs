// 셸 레이아웃 확인용 스크린샷. 실행 중인 서버 주소와 저장 폴더를 받는다.
// 사용: node scripts/shell-screens.mjs http://127.0.0.1:4173 <저장 폴더>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [url = 'http://127.0.0.1:4173', outDir = '.'] = process.argv.slice(2);
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

	await page.getByRole('button', { name: '메뉴 열기' }).click();
	report(await visible('.menu'), `${scheme} 390 메뉴 버튼으로 열림`);
	await page.screenshot({ path: `${outDir}/${scheme}-390-menu.png` });

	await page.getByRole('button', { name: '설정 열기' }).click();
	report((await visible('.panel')) && !(await visible('.menu')), `${scheme} 390 설정 버튼으로 열림`);
	await page.screenshot({ path: `${outDir}/${scheme}-390-panel.png` });

	await page.keyboard.press('Escape');
	report(!(await visible('.panel')), `${scheme} 390 Escape로 닫힘`);

	await context.close();
}

await browser.close();
process.exit(failed ? 1 : 0);

// 라이트와 다크 토큰 이름 목록을 비교해 한쪽에만 있는 토큰을 보고한다.
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'src/lib/styles/tokens.css';
const css = readFileSync(file, 'utf8');

// `/* @name */` 표시부터 다음 표시 전까지를 한 구역으로 본다.
function names(section) {
	const start = css.indexOf(`/* @${section} */`);
	if (start === -1) throw new Error(`${file}: "/* @${section} */" 구역이 없다`);
	const next = css.indexOf('/* @', start + 1);
	const body = css.slice(start, next === -1 ? undefined : next);
	return new Set([...body.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
}

const light = names('light');
const dark = names('dark');
const onlyLight = [...light].filter((n) => !dark.has(n));
const onlyDark = [...dark].filter((n) => !light.has(n));

console.log(`light ${light.size}개, dark ${dark.size}개`);
for (const n of onlyLight) console.log(`다크에 없음: ${n}`);
for (const n of onlyDark) console.log(`라이트에 없음: ${n}`);
console.log(`누락 ${onlyLight.length + onlyDark.length}건`);
process.exit(onlyLight.length + onlyDark.length === 0 ? 0 : 1);

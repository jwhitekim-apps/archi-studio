// 앱은 브리핑을 읽기만 한다(archi-studio-briefing design 결정 4). 서비스 키는 DB가 쓰기를 막지 못하므로,
// 테스트 파일을 뺀 src/ 소스에서 두 브리핑 테이블에 쓰기 호출이 붙으면 이 테스트가 실패한다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
const isTest = (f: string) => /\.(test|integration)\.ts$/.test(f) || f.endsWith('auth-harness.ts');

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return /\.(ts|js|svelte)$/.test(name) && !isTest(name) ? [path] : [];
	});
}

// from('archi_briefings' 또는 'archi_briefing_papers') 뒤 다음 from( 전까지에 쓰기 메서드가 있으면 위반이다.
const WRITE = /\.\s*(insert|update|upsert|delete)\s*\(/;
const FROM = /from\(\s*['"`](archi_briefings|archi_briefing_papers)['"`]\s*\)/g;

export function findBriefingWrites(text: string): string[] {
	const hits: string[] = [];
	for (const m of text.matchAll(FROM)) {
		const rest = text.slice((m.index ?? 0) + m[0].length);
		const nextFrom = rest.search(/\.from\(/);
		const chain = nextFrom === -1 ? rest : rest.slice(0, nextFrom);
		const stmt = chain.split(/;\s*\n/)[0];
		const w = WRITE.exec(stmt);
		if (w) hits.push(`${m[1]}.${w[1]}`);
	}
	return hits;
}

describe('5.1 브리핑 읽기 전용', () => {
	it('검사기가 쓰기 호출을 잡는다', () => {
		expect(findBriefingWrites(`admin.from('archi_briefings').insert({})`)).toEqual(['archi_briefings.insert']);
		expect(findBriefingWrites(`admin\n  .from("archi_briefing_papers")\n  .delete().eq('x', 1)`)).toEqual(['archi_briefing_papers.delete']);
		expect(findBriefingWrites(`admin.from('archi_briefings').select('id').eq('user_id', u);\nx.update()`)).toEqual([]);
	});

	it('src/ 소스는 두 브리핑 테이블에 insert/update/upsert/delete를 호출하지 않는다', () => {
		const violations = sourceFiles(SRC).flatMap((f) =>
			findBriefingWrites(readFileSync(f, 'utf8')).map((h) => `${relative(process.cwd(), f)}: ${h}`)
		);
		expect(violations).toEqual([]);
	});
});

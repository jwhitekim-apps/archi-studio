// 저널 점수: venue → 별칭 → SCImago 순위표. 벨루 core/journal_quality.py와 같은 규칙이다.
// 다른 점: 벨루는 요청마다 전체 행을 훑었다. 여기서는 처음 쓸 때 한 번 읽어 "소문자 제목 → 행"과 "단어 → 행 번호" 색인을 만든다.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EMPTY_JOURNAL_SCORE, type JournalScore } from './types';

// 실행 위치 기준. 데이터 파일은 서버 번들에 넣지 않고 배포 이미지에 data/analysis/로 함께 둔다.
export const DEFAULT_DATA_DIR = join(process.cwd(), 'data', 'analysis');
const CSV_NAME = 'scimagojr 2025.csv';
const ALIAS_NAME = 'venue_aliases.json';
const MIN_OVERLAP = 0.6;

interface Row {
	title: string;
	sjr: string;
	quartile: string;
	issn: string;
	type: string;
	country: string;
}

// 세미콜론 구분, 큰따옴표로 감싼 칸(안의 ""는 따옴표 하나)
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				cell += '"';
				i++;
			} else if (c === '"') quoted = false;
			else cell += c;
		} else if (c === '"') quoted = true;
		else if (c === ';') {
			row.push(cell);
			cell = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(cell);
			rows.push(row);
			row = [];
			cell = '';
		} else cell += c;
	}
	if (cell || row.length) {
		row.push(cell);
		rows.push(row);
	}
	return rows.filter((r) => r.length > 1 || r[0] !== '');
}

const words = (s: string) => new Set(s.toLowerCase().split(/\s+/).filter(Boolean));

// 소수점이 쉼표인 숫자("35,568")
export function toNumber(value: string): number | null {
	const n = Number(value.replace(',', '.'));
	return value.trim() && Number.isFinite(n) ? n : null;
}

const orNull = (value: string) => (value.trim() ? value : null);

function toScore(row: Row): JournalScore {
	return {
		matchedTitle: orNull(row.title),
		sjr: toNumber(row.sjr),
		quartile: orNull(row.quartile),
		issn: orNull(row.issn),
		type: orNull(row.type),
		country: orNull(row.country)
	};
}

export interface JournalScorer {
	lookup(venue: string | null | undefined): JournalScore;
}

export function createJournalScorer(csvText: string, aliases: Record<string, string>): JournalScorer {
	const [header, ...data] = parseCsv(csvText);
	const col = (name: string) => header.indexOf(name);
	const c = { title: col('Title'), sjr: col('SJR'), quartile: col('SJR Best Quartile'), issn: col('Issn'), type: col('Type'), country: col('Country') };
	const rows: Row[] = data.map((r) => ({
		title: r[c.title] ?? '',
		sjr: r[c.sjr] ?? '',
		quartile: r[c.quartile] ?? '',
		issn: r[c.issn] ?? '',
		type: r[c.type] ?? '',
		country: r[c.country] ?? ''
	}));

	const exact = new Map<string, number>();
	const byWord = new Map<string, number[]>();
	rows.forEach((row, i) => {
		const key = row.title.toLowerCase();
		if (!exact.has(key)) exact.set(key, i);
		for (const w of words(row.title)) {
			const list = byWord.get(w);
			if (list) list.push(i);
			else byWord.set(w, [i]);
		}
	});

	// 정확히 같은 이름, 없으면 단어 겹침(자카드) 0.6 이상 중 최고. 같은 점수면 순위표에서 먼저 나온 행(벨루와 같다).
	function match(query: string): Row | null {
		const hit = exact.get(query.toLowerCase());
		if (hit !== undefined) return rows[hit];
		const q = words(query);
		const candidates = new Set<number>();
		for (const w of q) for (const i of byWord.get(w) ?? []) candidates.add(i);
		let best: number | null = null;
		let bestScore = 0;
		for (const i of [...candidates].sort((a, b) => a - b)) {
			const t = words(rows[i].title);
			let common = 0;
			for (const w of q) if (t.has(w)) common++;
			const score = common / (q.size + t.size - common);
			if (score > bestScore && score >= MIN_OVERLAP) {
				bestScore = score;
				best = i;
			}
		}
		return best === null ? null : rows[best];
	}

	const aliasEntries = Object.entries(aliases);
	const cache = new Map<string, JournalScore>();

	return {
		lookup(venue) {
			if (!venue) return { ...EMPTY_JOURNAL_SCORE };
			const resolved = aliasEntries.find(([abbr]) => abbr.toLowerCase() === venue.toLowerCase())?.[1] ?? venue;
			const key = resolved.toLowerCase();
			const cached = cache.get(key);
			if (cached) return { ...cached };
			const row = match(resolved) ?? (resolved !== venue ? match(venue) : null);
			const score = row ? toScore(row) : { ...EMPTY_JOURNAL_SCORE };
			cache.set(key, score);
			return { ...score };
		}
	};
}

let shared: JournalScorer | null = null;

// 서버 전체가 한 색인을 쓴다(처음 부를 때 만든다).
export function journalScorer(dataDir = DEFAULT_DATA_DIR): JournalScorer {
	if (!shared) {
		const csv = readFileSync(join(dataDir, CSV_NAME), 'utf8');
		const aliases = JSON.parse(readFileSync(join(dataDir, ALIAS_NAME), 'utf8')) as Record<string, string>;
		shared = createJournalScorer(csv, aliases);
	}
	return shared;
}

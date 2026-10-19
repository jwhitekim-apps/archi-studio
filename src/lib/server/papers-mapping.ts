// papers 행 → API 응답 변환과 목록 커서. 순수 함수만 둔다.
export interface PaperRow {
	id: string;
	item_key: string | null;
	s2_paper_id: string | null;
	title: string | null;
	authors: unknown;
	year: string | null;
	collections: unknown;
	attachment_key: string | null;
	attachment_type: 'pdf' | 'html' | null;
	has_memo: boolean;
	synced_at: string;
}

export interface PaperListItem {
	id: string;
	title: string;
	authors: string[];
	year: number | null;
	collections: string[];
	hasPdf: boolean;
	hasMemo: boolean;
}

export interface PaperDetail extends PaperListItem {
	itemKey: string | null;
	s2PaperId: string | null;
	attachment: { type: 'pdf' | 'html' | null };
	translationCount: number;
	analysisCount: number;
}

const stringArray = (value: unknown): string[] =>
	Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

// 저장된 연도 문자열에서 처음 나오는 네 자리 숫자. 없거나 비어 있으면 null.
export function parseYear(year: string | null): number | null {
	const match = year?.match(/\d{4}/);
	return match ? Number(match[0]) : null;
}

export function toPaperListItem(row: PaperRow): PaperListItem {
	return {
		id: row.id,
		title: row.title ?? '',
		authors: stringArray(row.authors),
		year: parseYear(row.year),
		collections: stringArray(row.collections),
		hasPdf: row.attachment_type === 'pdf',
		hasMemo: row.has_memo
	};
}

export function toPaperDetail(
	row: PaperRow,
	counts: { translationCount: number; analysisCount: number }
): PaperDetail {
	return {
		...toPaperListItem(row),
		itemKey: row.item_key,
		s2PaperId: row.s2_paper_id,
		attachment: { type: row.attachment_type },
		translationCount: counts.translationCount,
		analysisCount: counts.analysisCount
	};
}

export class InvalidCursorError extends Error {
	constructor() {
		super('커서가 올바르지 않습니다.');
		this.name = 'InvalidCursorError';
	}
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Cursor {
	syncedAt: string; // DB가 돌려준 문자열 그대로(마이크로초 정밀도를 잃지 않게 Date로 바꾸지 않는다)
	id: string;
}

// 불투명한 문자열: 마지막 항목의 (synced_at, id)를 base64url로 감싼다.
export function encodeCursor(cursor: Cursor): string {
	return Buffer.from(JSON.stringify([cursor.syncedAt, cursor.id]), 'utf8').toString('base64url');
}

export function decodeCursor(value: string): Cursor {
	try {
		const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
		if (Array.isArray(parsed) && parsed.length === 2) {
			const [syncedAt, id] = parsed;
			if (typeof syncedAt === 'string' && typeof id === 'string' && UUID_PATTERN.test(id) && !Number.isNaN(Date.parse(syncedAt))) {
				return { syncedAt, id };
			}
		}
	} catch {
		// 아래에서 오류를 던진다.
	}
	throw new InvalidCursorError();
}

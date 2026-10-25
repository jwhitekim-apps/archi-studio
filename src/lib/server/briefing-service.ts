// 브리핑 읽기 서비스(archi-studio-briefing design 결정 1~3). 앱은 읽기만 한다.
// 서비스 키로 접속하므로 모든 조회가 userId를 필수 인자로 받아 user_id 조건을 직접 건다.
import type { SupabaseClient } from '@supabase/supabase-js';
import { UUID_PATTERN } from './papers-mapping';

export const DEFAULT_BRIEFING_LIMIT = 30;
export const MAX_BRIEFING_LIMIT = 100;

export interface BriefingListItem {
	id: string;
	date: string;
	summary: string;
}

export interface BriefingDetail extends BriefingListItem {
	body: string;
	paperIds: string[];
}

export type BriefingListResult =
	| { ok: true; items: BriefingListItem[]; nextCursor: string | null }
	| { ok: false; code: 'invalid_request'; message: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// 불투명한 커서: 마지막 항목의 날짜를 base64url로 감싼다.
export function encodeBriefingCursor(date: string): string {
	return Buffer.from(JSON.stringify([date]), 'utf8').toString('base64url');
}

export function decodeBriefingCursor(value: string): string | null {
	try {
		const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
		if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === 'string') {
			const date = parsed[0];
			if (DATE_PATTERN.test(date) && !Number.isNaN(Date.parse(date))) return date;
		}
	} catch {
		// 아래에서 null을 돌려준다.
	}
	return null;
}

const invalid = (message: string): BriefingListResult => ({ ok: false, code: 'invalid_request', message });

export async function listBriefings(
	admin: SupabaseClient,
	userId: string,
	params: { limit?: string | null; cursor?: string | null }
): Promise<BriefingListResult> {
	let limit = DEFAULT_BRIEFING_LIMIT;
	if (params.limit !== undefined && params.limit !== null) {
		limit = /^\d+$/.test(params.limit) ? Number(params.limit) : NaN;
		if (!(limit >= 1 && limit <= MAX_BRIEFING_LIMIT)) {
			return invalid(`limit은 1 이상 ${MAX_BRIEFING_LIMIT} 이하의 정수여야 합니다.`);
		}
	}
	let cursorDate: string | null = null;
	if (params.cursor !== undefined && params.cursor !== null) {
		cursorDate = decodeBriefingCursor(params.cursor);
		if (!cursorDate) return invalid('cursor가 올바르지 않습니다.');
	}

	let query = admin.from('archi_briefings').select('id, date, summary').eq('user_id', userId);
	if (cursorDate) query = query.lt('date', cursorDate);
	// 다음 페이지가 있는지 알려고 하나 더 읽는다.
	const { data, error } = await query.order('date', { ascending: false }).limit(limit + 1);
	if (error) throw error;
	const rows = (data ?? []) as BriefingListItem[];
	const page = rows.slice(0, limit).map(({ id, date, summary }) => ({ id, date, summary }));
	const last = page[page.length - 1];
	return { ok: true, items: page, nextCursor: rows.length > limit && last ? encodeBriefingCursor(last.date) : null };
}

// 없는 브리핑, 남의 브리핑, UUID가 아닌 id는 모두 null이다(존재 여부를 드러내지 않는다).
export async function getBriefing(admin: SupabaseClient, userId: string, id: string): Promise<BriefingDetail | null> {
	if (!UUID_PATTERN.test(id)) return null;
	const { data, error } = await admin
		.from('archi_briefings')
		.select('id, date, summary, body')
		.eq('user_id', userId)
		.eq('id', id)
		.maybeSingle();
	if (error) throw error;
	if (!data) return null;
	const row = data as Omit<BriefingDetail, 'paperIds'>;
	const links = await admin.from('archi_briefing_papers').select('paper_id').eq('briefing_id', row.id).order('paper_id');
	if (links.error) throw links.error;
	const paperIds = ((links.data ?? []) as { paper_id: string }[]).map((l) => l.paper_id).sort();
	return { id: row.id, date: row.date, summary: row.summary, body: row.body, paperIds };
}

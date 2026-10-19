// 논문 조회 서비스. 서비스 키로 접속하므로 모든 쿼리에 user_id 조건을 직접 건다(접근 제어의 전부).
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	decodeCursor,
	encodeCursor,
	toPaperDetail,
	toPaperListItem,
	UUID_PATTERN,
	type PaperDetail,
	type PaperListItem,
	type PaperRow
} from './papers-mapping';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

export interface ListParams {
	query?: string;
	collection?: string;
	limit: number;
	cursor?: string; // 해독 실패는 InvalidCursorError
}

export async function listPapers(
	admin: SupabaseClient,
	userId: string,
	params: ListParams
): Promise<{ items: PaperListItem[]; nextCursor: string | null }> {
	const cursor = params.cursor ? decodeCursor(params.cursor) : null;
	// 다음 페이지가 있는지 알려고 하나 더 읽는다.
	const { data, error } = await admin.rpc('archi_list_papers', {
		p_user_id: userId,
		p_query: params.query || null,
		p_collection: params.collection || null,
		p_limit: params.limit + 1,
		p_cursor_synced_at: cursor?.syncedAt ?? null,
		p_cursor_id: cursor?.id ?? null
	});
	if (error) throw error;
	const rows = (data ?? []) as PaperRow[];
	const page = rows.slice(0, params.limit);
	const last = page[page.length - 1];
	return {
		items: page.map(toPaperListItem),
		nextCursor: rows.length > params.limit && last ? encodeCursor({ syncedAt: last.synced_at, id: last.id }) : null
	};
}

// 내 논문 한 행. 없는 논문, 남의 논문, UUID가 아닌 id는 모두 null이다(존재 여부를 드러내지 않는다).
export async function findOwnPaper(admin: SupabaseClient, userId: string, id: string): Promise<PaperRow | null> {
	if (!UUID_PATTERN.test(id)) return null;
	const { data, error } = await admin.from('papers').select('*').eq('user_id', userId).eq('id', id).maybeSingle();
	if (error) throw error;
	return (data as PaperRow | null) ?? null;
}

async function countRows(admin: SupabaseClient, table: 'archi_translations' | 'archi_analyses', userId: string, paperId: string) {
	const { count, error } = await admin
		.from(table)
		.select('id', { count: 'exact', head: true })
		.eq('user_id', userId)
		.eq('paper_id', paperId);
	if (error) throw error;
	return count ?? 0;
}

export async function paperDetail(admin: SupabaseClient, userId: string, row: PaperRow): Promise<PaperDetail> {
	const [translationCount, analysisCount] = await Promise.all([
		countRows(admin, 'archi_translations', userId, row.id),
		countRows(admin, 'archi_analyses', userId, row.id)
	]);
	return toPaperDetail(row, { translationCount, analysisCount });
}

export async function getPaperDetail(admin: SupabaseClient, userId: string, id: string): Promise<PaperDetail | null> {
	const row = await findOwnPaper(admin, userId, id);
	return row ? paperDetail(admin, userId, row) : null;
}

export interface CollectionItem {
	key: string;
	name: string;
	parentKey: string | null;
	paperCount: number;
}

export async function listCollections(admin: SupabaseClient, userId: string): Promise<CollectionItem[]> {
	const { data, error } = await admin.rpc('archi_collection_counts', { p_user_id: userId });
	if (error) throw error;
	return ((data ?? []) as { key: string; name: string; parent_key: string | null; paper_count: number }[]).map((c) => ({
		key: c.key,
		name: c.name,
		parentKey: c.parent_key,
		paperCount: Number(c.paper_count)
	}));
}

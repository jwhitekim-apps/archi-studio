// 번역 이력 DB 접근. 서비스 키로 접속하므로 모든 쿼리에 user_id 조건을 직접 건다(접근 제어의 전부).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TranslationType } from './input';

export interface SavedTranslation {
	translatedText: string;
	// 요청한 논문에 같은 원문 행이 이미 있는지
	paperLinked: boolean;
}

export interface NewTranslation {
	userId: string;
	paperId: string | null;
	sourceText: string;
	translatedText: string;
	type: TranslationType;
}

export interface HistoryItem {
	id: string;
	sourceText: string;
	translatedText: string;
	type: TranslationType;
	paperId: string | null;
	createdAt: string;
}

export interface TranslationRepository {
	findTranslation(userId: string, text: string, paperId: string | null): Promise<SavedTranslation | null>;
	saveTranslation(row: NewTranslation): Promise<void>;
	ownsPaper(userId: string, paperId: string): Promise<boolean>;
	listHistory(userId: string, options: { paperId: string | null; limit: number }): Promise<HistoryItem[]>;
}

interface HistoryRow {
	id: string;
	source_text: string;
	translated_text: string;
	type: TranslationType;
	paper_id: string | null;
	created_at: string;
}

export function toHistoryItem(row: HistoryRow): HistoryItem {
	return {
		id: row.id,
		sourceText: row.source_text,
		translatedText: row.translated_text,
		type: row.type,
		paperId: row.paper_id,
		createdAt: row.created_at
	};
}

export function supabaseTranslationRepository(admin: SupabaseClient): TranslationRepository {
	return {
		async findTranslation(userId, text, paperId) {
			const { data, error } = await admin.rpc('archi_find_translation', { p_user_id: userId, p_text: text, p_paper_id: paperId });
			if (error) throw error;
			const row = (data as { translated_text: string; paper_linked: boolean }[] | null)?.[0];
			return row ? { translatedText: row.translated_text, paperLinked: row.paper_linked } : null;
		},

		async saveTranslation(row) {
			const { error } = await admin.from('archi_translations').insert({
				user_id: row.userId,
				paper_id: row.paperId,
				source_text: row.sourceText,
				translated_text: row.translatedText,
				type: row.type
			});
			if (error) throw error;
		},

		async ownsPaper(userId, paperId) {
			const { data, error } = await admin.from('papers').select('id').eq('user_id', userId).eq('id', paperId).maybeSingle();
			if (error) throw error;
			return data !== null;
		},

		async listHistory(userId, { paperId, limit }) {
			let query = admin
				.from('archi_translations')
				.select('id, source_text, translated_text, type, paper_id, created_at')
				.eq('user_id', userId);
			if (paperId) query = query.eq('paper_id', paperId);
			const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
			if (error) throw error;
			return ((data ?? []) as HistoryRow[]).map(toHistoryItem);
		}
	};
}

// 시험 전용 메모리 저장소. 실제 저장소(SQL 함수 archi_find_translation)와 같은 규칙으로 동작한다.
import { randomUUID } from 'node:crypto';
import type { HistoryItem, NewTranslation, TranslationRepository } from './repository';

export interface MemoryTranslationRepository extends TranslationRepository {
	rows: (NewTranslation & { id: string; createdAt: string })[];
	papers: { userId: string; paperId: string }[];
	failSave: boolean;
	failFind: boolean;
}

export function memoryTranslationRepository(): MemoryTranslationRepository {
	let tick = 0;
	const repo: MemoryTranslationRepository = {
		rows: [],
		papers: [],
		failSave: false,
		failFind: false,
		async findTranslation(userId, text, paperId) {
			if (repo.failFind) throw new Error('find failed');
			const matches = repo.rows.filter((r) => r.userId === userId && r.sourceText === text);
			if (!matches.length) return null;
			const latest = matches.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b));
			return { translatedText: latest.translatedText, paperLinked: paperId !== null && matches.some((m) => m.paperId === paperId) };
		},
		async saveTranslation(row) {
			if (repo.failSave) throw Object.assign(new Error('insert failed: 원문 내용'), { name: 'PostgrestError' });
			repo.rows.push({ ...row, id: randomUUID(), createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString() });
		},
		async ownsPaper(userId, paperId) {
			return repo.papers.some((p) => p.userId === userId && p.paperId === paperId);
		},
		async listHistory(userId, { paperId, limit }): Promise<HistoryItem[]> {
			return repo.rows
				.filter((r) => r.userId === userId && (!paperId || r.paperId === paperId))
				.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
				.slice(0, limit)
				.map((r) => ({ id: r.id, sourceText: r.sourceText, translatedText: r.translatedText, type: r.type, paperId: r.paperId, createdAt: r.createdAt }));
		}
	};
	return repo;
}

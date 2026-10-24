// 메모 라우트가 쓰는 순서: 논문 소유 확인 → Zotero 연결 확인 → 노트 읽기·쓰기 → papers.has_memo 갱신(design 결정 5).
// 남의 논문과 없는 논문은 같은 null이다. 메모 본문은 로그에 남기지 않는다.
import { findOwnPaper } from '../papers-service';
import { apiFor, type ZoteroDeps } from '../papers-zotero';
import { zoteroMemoNotes, type MemoNotes } from './notes';
import { getMemo, saveMemo, type Memo } from './service';

export interface MemoDeps extends ZoteroDeps {
	notes?: MemoNotes; // 시험에서만 바꾼다
}

async function open(deps: MemoDeps, userId: string, id: string) {
	const paper = await findOwnPaper(deps.admin, userId, id);
	if (!paper) return null;
	const notes = deps.notes ?? zoteroMemoNotes(await apiFor(deps, userId));
	return { paper, notes };
}

export async function readPaperMemo(deps: MemoDeps, userId: string, id: string): Promise<Memo | null> {
	const found = await open(deps, userId, id);
	if (!found) return null;
	// Zotero 항목 키가 없는 논문(아직 동기화 전)은 메모도 없다.
	if (!found.paper.item_key) return { markdown: '', updatedAt: null };
	return getMemo(found.notes, found.paper.item_key);
}

export async function writePaperMemo(deps: MemoDeps, userId: string, id: string, markdown: string): Promise<Memo | null> {
	const found = await open(deps, userId, id);
	if (!found) return null;
	if (!found.paper.item_key) throw new Error('paper without item_key');
	// Zotero 쓰기가 성공한 뒤에만 has_memo를 바꾼다. 실패하면 예외가 그대로 나가고 값은 그대로다.
	const { hasMemo, ...memo } = await saveMemo(found.notes, found.paper.item_key, markdown);
	if (found.paper.has_memo !== hasMemo) {
		const { error } = await deps.admin.from('papers').update({ has_memo: hasMemo }).eq('user_id', userId).eq('id', id);
		if (error) throw error;
	}
	return memo;
}

// 메모 조회와 저장(design 결정 5~7). 본문은 DB에 두지 않고 Zotero 노트를 바로 읽고 쓴다.
import { markdownToNoteHtml, noteHtmlToMarkdown } from './convert';
import { ZoteroUnavailableError } from '../zotero/client';
import { NoteVersionConflict, type MemoNote, type MemoNotes } from './notes';

export const MAX_MEMO_BYTES = 1024 * 1024;
// 요청 본문 전체의 상한. JSON 이스케이프(줄바꿈 \n 등)로 본문보다 커지는 여유를 둔다. 서버의 BODY_SIZE_LIMIT는 이 값 이상이어야 한다.
export const MAX_MEMO_REQUEST_BYTES = 4 * MAX_MEMO_BYTES;

export interface Memo {
	markdown: string;
	updatedAt: string | null;
}

const toMemo = (note: MemoNote | null): Memo =>
	note ? { markdown: noteHtmlToMarkdown(note.html), updatedAt: note.dateModified } : { markdown: '', updatedAt: null };

export type MemoInput =
	| { ok: true; markdown: string }
	| { ok: false; code: 'invalid_request' | 'payload_too_large'; message: string };

// 크기는 UTF-8 바이트로 센다(design 결정 4).
export function parseMemoInput(body: unknown): MemoInput {
	const markdown = typeof body === 'object' && body !== null ? (body as { markdown?: unknown }).markdown : undefined;
	if (typeof markdown !== 'string') return { ok: false, code: 'invalid_request', message: 'markdown은 문자열이어야 합니다.' };
	if (Buffer.byteLength(markdown, 'utf8') > MAX_MEMO_BYTES) {
		return { ok: false, code: 'payload_too_large', message: '메모는 1 MB를 넘을 수 없습니다.' };
	}
	return { ok: true, markdown };
}

export async function getMemo(notes: MemoNotes, itemKey: string): Promise<Memo> {
	return toMemo(await notes.findMemoNote(itemKey));
}

// hasMemo는 papers.has_memo에 쓸 값이다. 공백뿐인 본문은 노트 삭제다.
export async function saveMemo(notes: MemoNotes, itemKey: string, markdown: string): Promise<Memo & { hasMemo: boolean }> {
	const empty = markdown.trim() === '';
	const html = empty ? '' : markdownToNoteHtml(markdown);
	// 버전 충돌(412)이면 다시 읽어 한 번만 다시 시도한다(결정 6).
	for (let attempt = 0; ; attempt++) {
		const existing = await notes.findMemoNote(itemKey);
		try {
			if (empty) {
				if (existing) await notes.deleteNote(existing.key, existing.version);
				return { markdown: '', updatedAt: null, hasMemo: false };
			}
			const saved = existing
				? await notes.updateNote(existing.key, existing.version, html)
				: await notes.createMemoNote(itemKey, html);
			return { ...toMemo(saved), hasMemo: true };
		} catch (err) {
			if (!(err instanceof NoteVersionConflict)) throw err;
			if (attempt >= 1) throw new ZoteroUnavailableError('메모 저장', 412);
		}
	}
}

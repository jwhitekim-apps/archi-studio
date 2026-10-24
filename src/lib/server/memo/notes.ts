// 메모 서비스가 쓰는 Zotero 노트 호출 경계(design 결정 1). 실제 구현은 Zotero Web API, 시험은 메모리 가짜를 쓴다.
import {
	createChildNote,
	deleteItem,
	fetchChildren,
	fetchItem,
	patchNote,
	ZoteroVersionConflictError,
	type ZoteroApi,
	type ZoteroItem
} from '../zotero/client';

export const MEMO_TAG = 'zotero-insight:memo';

export interface MemoNote {
	key: string;
	version: number;
	html: string;
	dateModified: string | null;
}

// 버전이 어긋나면(Zotero 412) NoteVersionConflict를 던진다.
export interface MemoNotes {
	findMemoNote(itemKey: string): Promise<MemoNote | null>;
	createMemoNote(itemKey: string, html: string): Promise<MemoNote>;
	updateNote(noteKey: string, version: number, html: string): Promise<MemoNote>;
	deleteNote(noteKey: string, version: number): Promise<void>;
}

export { ZoteroVersionConflictError as NoteVersionConflict };

const isMemoNote = (item: ZoteroItem) =>
	item.data.itemType === 'note' &&
	Array.isArray(item.data.tags) &&
	item.data.tags.some((t: { tag?: unknown }) => t?.tag === MEMO_TAG);

const toNote = (item: ZoteroItem): MemoNote => ({
	key: item.key,
	version: item.version,
	html: typeof item.data.note === 'string' ? item.data.note : '',
	dateModified: typeof item.data.dateModified === 'string' ? item.data.dateModified : null
});

export function zoteroMemoNotes(api: ZoteroApi): MemoNotes {
	return {
		async findMemoNote(itemKey) {
			const found = (await fetchChildren(api, itemKey)).find(isMemoNote);
			return found ? toNote(found) : null;
		},
		async createMemoNote(itemKey, html) {
			const created = await createChildNote(api, itemKey, html, [MEMO_TAG]);
			return toNote(await fetchItem(api, created.key));
		},
		async updateNote(noteKey, version, html) {
			await patchNote(api, noteKey, version, html);
			return toNote(await fetchItem(api, noteKey));
		},
		async deleteNote(noteKey, version) {
			// 이미 없으면('gone') 지워진 것과 같다.
			await deleteItem(api, noteKey, version);
		}
	};
}

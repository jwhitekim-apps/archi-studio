// 시험용 메모리 노트 저장소. Zotero처럼 버전이 어긋나면 412(NoteVersionConflict)를 던진다.
import { NoteVersionConflict, type MemoNote, type MemoNotes } from './notes';

export interface MemoryNotes extends MemoNotes {
	notes: Map<string, MemoNote & { parent: string }>;
	conflicts: number; // 이 횟수만큼 수정·삭제가 412로 실패하고 그때마다 노트 버전이 오른다
	failWrites: boolean; // 쓰기(생성·수정·삭제)가 모두 실패한다
	calls: string[];
}

export function memoryNotes(): MemoryNotes {
	let version = 1;
	let counter = 0;
	const now = () => new Date(Date.UTC(2026, 0, 1, 0, 0, version)).toISOString().replace('.000', '');
	const copy = ({ key, version, html, dateModified }: MemoNote): MemoNote => ({ key, version, html, dateModified });
	const self: MemoryNotes = {
		notes: new Map(),
		conflicts: 0,
		failWrites: false,
		calls: [],
		async findMemoNote(itemKey) {
			self.calls.push('find');
			const note = [...self.notes.values()].find((n) => n.parent === itemKey);
			return note ? copy(note) : null;
		},
		async createMemoNote(itemKey, html) {
			self.calls.push('create');
			if (self.failWrites) throw new Error('fake write failure');
			const note = { key: `N${String(++counter).padStart(7, '0')}`, version: ++version, html, dateModified: '', parent: itemKey };
			note.dateModified = now();
			self.notes.set(note.key, note);
			return copy(note);
		},
		async updateNote(noteKey, v, html) {
			self.calls.push('update');
			if (self.failWrites) throw new Error('fake write failure');
			const note = check(noteKey, v);
			note.html = html;
			note.version = ++version;
			note.dateModified = now();
			return copy(note);
		},
		async deleteNote(noteKey, v) {
			self.calls.push('delete');
			if (self.failWrites) throw new Error('fake write failure');
			check(noteKey, v);
			self.notes.delete(noteKey);
		}
	};
	function check(noteKey: string, v: number) {
		const note = self.notes.get(noteKey);
		if (!note) throw new Error('note not found');
		if (self.conflicts > 0) {
			self.conflicts--;
			note.version = ++version;
			throw new NoteVersionConflict();
		}
		if (note.version !== v) throw new NoteVersionConflict();
		return note;
	}
	return self;
}

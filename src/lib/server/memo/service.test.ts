import { describe, expect, it } from 'vitest';
import { ZoteroUnavailableError } from '../zotero/client';
import { memoryNotes } from './memory-notes';
import { NoteVersionConflict } from './notes';
import { getMemo, MAX_MEMO_BYTES, parseMemoInput, saveMemo } from './service';

const ITEM = 'ITEMKEY1';

describe('2.3 메모리 가짜 노트', () => {
	it('버전이 어긋나면 수정과 삭제가 412(NoteVersionConflict)다', async () => {
		const notes = memoryNotes();
		const created = await notes.createMemoNote(ITEM, '<p>a</p>');
		await expect(notes.updateNote(created.key, created.version - 1, '<p>b</p>')).rejects.toBeInstanceOf(NoteVersionConflict);
		await expect(notes.deleteNote(created.key, created.version + 5)).rejects.toBeInstanceOf(NoteVersionConflict);
		const updated = await notes.updateNote(created.key, created.version, '<p>b</p>');
		expect(updated.version).toBeGreaterThan(created.version);
		await expect(notes.updateNote(created.key, created.version, '<p>c</p>')).rejects.toBeInstanceOf(NoteVersionConflict);
	});
});

describe('2.4 메모 서비스', () => {
	it('노트가 없으면 { markdown: "", updatedAt: null }', async () => {
		expect(await getMemo(memoryNotes(), ITEM)).toEqual({ markdown: '', updatedAt: null });
	});

	it('새 저장 뒤 조회가 같은 본문이고 updatedAt이 있다', async () => {
		const notes = memoryNotes();
		const saved = await saveMemo(notes, ITEM, '# 제목\n\n- 항목');
		expect(saved.hasMemo).toBe(true);
		expect(saved.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(await getMemo(notes, ITEM)).toEqual({ markdown: '# 제목\n\n- 항목', updatedAt: saved.updatedAt });
	});

	it('같은 본문을 연속 5번 저장해도 노트는 1개이고 마지막 본문이다', async () => {
		const notes = memoryNotes();
		for (let i = 0; i < 5; i++) await saveMemo(notes, ITEM, '같은 본문');
		await saveMemo(notes, ITEM, '마지막 본문');
		expect(notes.notes.size).toBe(1);
		expect((await getMemo(notes, ITEM)).markdown).toBe('마지막 본문');
	});

	it('빈 문자열(공백뿐 포함)을 저장하면 노트 0개와 updatedAt null', async () => {
		const notes = memoryNotes();
		await saveMemo(notes, ITEM, '내용');
		expect(await saveMemo(notes, ITEM, '  \n ')).toEqual({ markdown: '', updatedAt: null, hasMemo: false });
		expect(notes.notes.size).toBe(0);
		expect(await getMemo(notes, ITEM)).toEqual({ markdown: '', updatedAt: null });
		// 노트가 없는데 빈 문자열이면 아무것도 쓰지 않는다
		notes.calls.length = 0;
		await saveMemo(notes, ITEM, '');
		expect(notes.calls).toEqual(['find']);
	});
});

describe('2.5 버전 충돌 재시도', () => {
	it('412가 한 번이면 다시 읽어 한 번만 다시 수정한다', async () => {
		const notes = memoryNotes();
		await saveMemo(notes, ITEM, '처음');
		notes.conflicts = 1;
		notes.calls.length = 0;
		await saveMemo(notes, ITEM, '두 번째');
		expect(notes.calls).toEqual(['find', 'update', 'find', 'update']);
		expect((await getMemo(notes, ITEM)).markdown).toBe('두 번째');
	});

	it('두 번째도 412면 Zotero 오류(412)이고 본문은 그대로다', async () => {
		const notes = memoryNotes();
		await saveMemo(notes, ITEM, '처음');
		notes.conflicts = 2;
		const err = await saveMemo(notes, ITEM, '두 번째').catch((e) => e);
		expect(err).toBeInstanceOf(ZoteroUnavailableError);
		expect(err.status).toBe(412);
		expect((await getMemo(notes, ITEM)).markdown).toBe('처음');
	});
});

describe('입력 검사', () => {
	it('문자열이 아니면 invalid_request, UTF-8 1 MB 초과면 payload_too_large', () => {
		expect(parseMemoInput({ markdown: 3 })).toMatchObject({ ok: false, code: 'invalid_request' });
		expect(parseMemoInput(null)).toMatchObject({ ok: false, code: 'invalid_request' });
		expect(parseMemoInput({ markdown: 'a'.repeat(MAX_MEMO_BYTES) })).toMatchObject({ ok: true });
		expect(parseMemoInput({ markdown: 'a'.repeat(MAX_MEMO_BYTES + 1) })).toMatchObject({ ok: false, code: 'payload_too_large' });
		// 한글은 3바이트: 349,525자 = 1,048,575바이트는 통과, 349,526자는 거부
		expect(parseMemoInput({ markdown: '가'.repeat(349525) })).toMatchObject({ ok: true });
		expect(parseMemoInput({ markdown: '가'.repeat(349526) })).toMatchObject({ ok: false, code: 'payload_too_large' });
	});
});

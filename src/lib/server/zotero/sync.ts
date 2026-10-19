// Zotero → 앱 동기화. 폴리오 server.js의 doSync를 옮겼다.
// Zotero에서 읽은 결과를 모은 뒤 SQL 함수 archi_apply_zotero_sync 한 번으로 반영한다(한 트랜잭션).
// 항목 하나의 자식 조회가 실패해도 전체를 멈추지 않고 실패 목록에 넣어 다음 동기화에서 다시 시도한다.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	fetchChangedAttachmentParentKeys,
	fetchChangedTopItems,
	fetchChildren,
	fetchCollections,
	fetchDeletedItemKeys,
	fetchItem,
	type ZoteroApi,
	type ZoteroItem
} from './client';
import { getCredentials } from './connection';

export const MEMO_TAG = 'zotero-insight:memo';

export class ZoteroNotConnectedError extends Error {
	constructor() {
		super('Zotero가 연결되어 있지 않습니다.');
		this.name = 'ZoteroNotConnectedError';
	}
}

export interface SyncResult {
	added: number;
	updated: number;
	removed: number;
	syncedAt: string;
}

export interface SyncDeps {
	admin: SupabaseClient;
	apiBaseUrl: string;
	encryptionSecret: string | undefined;
	fetch?: typeof fetch;
	now?: () => Date;
}

export function extractAuthors(creators: unknown): string[] {
	if (!Array.isArray(creators)) return [];
	return creators
		.map((c) => c.name || [c.firstName, c.lastName].filter(Boolean).join(' '))
		.filter(Boolean);
}

// 연도 문자열 규칙은 폴리오와 같다: 네 자리 숫자가 있으면 그것, 없으면 원문 그대로.
export function extractYear(dateStr: unknown): string | null {
	if (!dateStr || typeof dateStr !== 'string') return null;
	const match = dateStr.match(/\d{4}/);
	return match ? match[0] : dateStr;
}

// 브라우저 커넥터로 저장된 webpage 항목은 제목에 " | 사이트명" 같은 꼬리가 붙는다. 표시용으로만 자른다.
export function cleanTitle(title: string | undefined, itemType: string): string | undefined {
	if (itemType !== 'webpage' || !title) return title;
	const idx = title.indexOf(' | ');
	return idx > 0 ? title.slice(0, idx).trim() : title;
}

// PDF를 우선하고 없으면 HTML 스냅샷. 둘 다 없으면 null.
function readableAttachment(children: ZoteroItem[]): { key: string; type: 'pdf' | 'html' } | null {
	const attachments = children.filter((c) => c.data.itemType === 'attachment');
	const pdf = attachments.find((a) => a.data.contentType === 'application/pdf');
	if (pdf) return { key: pdf.data.key, type: 'pdf' };
	const html = attachments.find((a) => a.data.contentType === 'text/html');
	return html ? { key: html.data.key, type: 'html' } : null;
}

const hasMemoNote = (children: ZoteroItem[]) =>
	children.some((c) => c.data.itemType === 'note' && c.data.tags?.some((t: { tag: string }) => t.tag === MEMO_TAG));

async function readState(admin: SupabaseClient, userId: string) {
	const { data, error } = await admin
		.from('folio_sync_state')
		.select('key, value')
		.eq('user_id', userId)
		.in('key', ['lastVersion', 'failedItemKeys']);
	if (error) throw error;
	const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string | null]));
	let failed: string[] = [];
	try {
		const parsed: unknown = JSON.parse(map.get('failedItemKeys') ?? '[]');
		if (Array.isArray(parsed)) failed = parsed.filter((k): k is string => typeof k === 'string');
	} catch {
		failed = [];
	}
	return { lastVersion: Number(map.get('lastVersion')) || 0, failed };
}

async function runSync(deps: SyncDeps, userId: string): Promise<SyncResult> {
	const credentials = await getCredentials(deps.admin, userId, deps.encryptionSecret);
	if (!credentials) throw new ZoteroNotConnectedError();
	const api: ZoteroApi = {
		baseUrl: deps.apiBaseUrl,
		userId: credentials.zoteroUserId,
		apiKey: credentials.apiKey,
		fetch: deps.fetch
	};

	const { lastVersion, failed } = await readState(deps.admin, userId);
	const { items, newVersion } = await fetchChangedTopItems(api, lastVersion);
	const seen = new Set(items.map((i) => i.key));

	// 지난번에 반영하지 못한 항목은 버전과 무관하게 다시 조회한다. 조회가 실패하면 실패 목록에 그대로 남긴다.
	const failedKeys = new Set(failed);
	for (const key of failed) {
		if (seen.has(key)) continue;
		try {
			items.push(await fetchItem(api, key));
			seen.add(key);
		} catch {
			// 다음에도 다시 시도한다.
		}
	}

	// 첨부만 새로 붙은 부모를 합친다. 개별 부모 조회 실패는 건너뛰되, 변경 목록 자체를 못 받으면 전체가 실패한다.
	for (const key of await fetchChangedAttachmentParentKeys(api, lastVersion)) {
		if (seen.has(key)) continue;
		try {
			items.push(await fetchItem(api, key));
			seen.add(key);
		} catch {
			failedKeys.add(key);
		}
	}

	const records: Record<string, unknown>[] = [];
	for (const item of items) {
		// /items/top은 단독 노트와 첨부를 포함할 수 있어 방어적으로 거른다.
		if (item.data.itemType === 'attachment' || item.data.itemType === 'note') continue;
		try {
			const children = await fetchChildren(api, item.key);
			const attachment = readableAttachment(children);
			records.push({
				item_key: item.key,
				item_version: item.version,
				title: cleanTitle(item.data.title, item.data.itemType) || '(제목 없음)',
				authors: extractAuthors(item.data.creators),
				year: extractYear(item.data.date),
				attachment_key: attachment?.key ?? null,
				attachment_type: attachment?.type ?? null,
				collections: item.data.collections ?? [],
				has_memo: hasMemoNote(children)
			});
			failedKeys.delete(item.key);
		} catch {
			failedKeys.add(item.key);
		}
	}

	const deleted = await fetchDeletedItemKeys(api, lastVersion);
	for (const key of deleted) failedKeys.delete(key);

	const collections = (await fetchCollections(api)).map((c) => ({
		key: c.key,
		name: c.data.name,
		parent_key: c.data.parentCollection || null
	}));

	const syncedAt = (deps.now ?? (() => new Date()))().toISOString();
	const { data, error } = await deps.admin.rpc('archi_apply_zotero_sync', {
		p_user_id: userId,
		p_items: records,
		p_deleted: deleted,
		p_collections: collections,
		p_version: newVersion,
		p_failed: [...failedKeys],
		p_synced_at: syncedAt
	});
	if (error) throw error;
	const counts = data as { added: number; updated: number; removed: number };
	return { added: counts.added, updated: counts.updated, removed: counts.removed, syncedAt };
}

// 같은 사용자의 동기화는 서버 프로세스 안에서 순서대로 한다. 앞의 결과와 상관없이 뒤 요청은 이어서 시작한다.
const tails = new Map<string, Promise<unknown>>();

export function syncZotero(deps: SyncDeps, userId: string): Promise<SyncResult> {
	const previous = tails.get(userId) ?? Promise.resolve();
	const run = previous.catch(() => {}).then(() => runSync(deps, userId));
	const tail = run.catch(() => {});
	tails.set(userId, tail);
	void tail.then(() => {
		if (tails.get(userId) === tail) tails.delete(userId);
	});
	return run;
}

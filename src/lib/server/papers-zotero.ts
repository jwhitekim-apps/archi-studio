// Zotero 서버를 직접 부르는 논문 기능: 원문 파일, 웹페이지 추가, 삭제.
// 호출 전에 내 논문인지 먼저 확인한다(남의 논문은 없는 논문과 같은 null). 순서는 논문 확인 → 연결 확인 → Zotero 호출이다.
import type { SupabaseClient } from '@supabase/supabase-js';
import { unzipSync } from 'fflate';
import { findOwnPaper, paperDetail } from './papers-service';
import type { PaperDetail, PaperRow } from './papers-mapping';
import { assertPublicUrl, fetchPageTitle, type SsrfOptions } from './ssrf';
import {
	createWebpageItem,
	deleteItem,
	fetchAttachmentFile,
	fetchItem,
	ZoteroUnavailableError,
	ZoteroVersionConflictError,
	type ZoteroApi
} from './zotero/client';
import { getCredentials } from './zotero/connection';
import { cleanTitle, extractAuthors, extractYear } from './zotero/sync';

export interface ZoteroDeps {
	admin: SupabaseClient;
	apiBaseUrl: string;
	encryptionSecret: string | undefined;
	fetch?: typeof fetch;
	ssrf?: SsrfOptions; // 시험에서만 바꾼다
}

// 연결하지 않은 사용자.
export class ZoteroNotConnected extends Error {}

async function apiFor(deps: ZoteroDeps, userId: string): Promise<ZoteroApi> {
	const credentials = await getCredentials(deps.admin, userId, deps.encryptionSecret);
	if (!credentials) throw new ZoteroNotConnected();
	return { baseUrl: deps.apiBaseUrl, userId: credentials.zoteroUserId, apiKey: credentials.apiKey, fetch: deps.fetch };
}

// 스크립트 실행과 외부 요청을 막는다(폴리오 동작 유지). 같은 출처 <iframe>은 허용한다.
export const HTML_FILE_HEADERS = {
	'content-type': 'text/html; charset=utf-8',
	'content-security-policy':
		"default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data:; frame-ancestors 'self'",
	'x-content-type-options': 'nosniff'
} as const;

// Zotero가 저장한 HTML 스냅샷은 zip이다(앞 두 바이트가 PK). 안의 첫 .html을 꺼낸다.
export function extractHtml(buffer: Uint8Array): Uint8Array {
	if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) return buffer;
	const files = unzipSync(buffer);
	const name = Object.keys(files)
		.filter((n) => /\.html?$/i.test(n))
		.sort()[0];
	if (!name) throw new ZoteroUnavailableError('HTML 스냅샷 해석', null);
	return files[name];
}

export type FileResult =
	| { kind: 'ok'; response: Response }
	| { kind: 'paper_not_found' }
	| { kind: 'attachment_not_found' };

export async function getPaperFile(deps: ZoteroDeps, userId: string, id: string): Promise<FileResult> {
	const paper = await findOwnPaper(deps.admin, userId, id);
	if (!paper) return { kind: 'paper_not_found' };
	if (!paper.attachment_key || !paper.attachment_type) return { kind: 'attachment_not_found' };

	const api = await apiFor(deps, userId);
	let upstream: Response;
	try {
		upstream = await fetchAttachmentFile(api, paper.attachment_key);
	} catch (err) {
		// Zotero에 파일이 올라가 있지 않으면 첨부가 없는 것과 같다.
		if (err instanceof ZoteroUnavailableError && err.status === 404) return { kind: 'attachment_not_found' };
		throw err;
	}

	if (paper.attachment_type === 'pdf') {
		// 메모리에 통째로 올리지 않고 스트림 그대로 전달한다.
		const headers: Record<string, string> = {
			'content-type': 'application/pdf',
			'content-disposition': 'inline',
			'x-content-type-options': 'nosniff'
		};
		const length = upstream.headers.get('content-length');
		if (length) headers['content-length'] = length;
		return { kind: 'ok', response: new Response(upstream.body, { status: 200, headers }) };
	}

	const html = extractHtml(new Uint8Array(await upstream.arrayBuffer()));
	return { kind: 'ok', response: new Response(html as BodyInit, { status: 200, headers: HTML_FILE_HEADERS }) };
}

// 분석용 PDF 바이트. PDF 첨부가 없거나 Zotero에 파일이 없으면 null이다. 크기 상한을 넘으면 본문을 읽지 않고 TooLargeError를 던진다.
export class PaperPdfTooLargeError extends Error {
	name = 'PaperPdfTooLargeError';
}

export async function fetchPaperPdf(deps: ZoteroDeps, userId: string, paper: PaperRow, maxBytes: number): Promise<Uint8Array | null> {
	if (!paper.attachment_key || paper.attachment_type !== 'pdf') return null;
	const api = await apiFor(deps, userId);
	let upstream: Response;
	try {
		upstream = await fetchAttachmentFile(api, paper.attachment_key);
	} catch (err) {
		if (err instanceof ZoteroUnavailableError && err.status === 404) return null;
		throw err;
	}
	if (Number(upstream.headers.get('content-length')) > maxBytes) {
		await upstream.body?.cancel().catch(() => {});
		throw new PaperPdfTooLargeError();
	}
	const bytes = new Uint8Array(await upstream.arrayBuffer());
	if (bytes.byteLength > maxBytes) throw new PaperPdfTooLargeError();
	return bytes;
}

export type AddWebpageResult =
	| { kind: 'created'; detail: PaperDetail }
	| { kind: 'invalid'; message: string };

// http(s) URL만 받는다. 호스트가 사설 주소로 해석되면 거부한다.
export async function addWebpage(deps: ZoteroDeps, userId: string, rawUrl: unknown): Promise<AddWebpageResult> {
	const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
	if (!/^https?:\/\//i.test(url)) {
		return { kind: 'invalid', message: 'url은 http:// 또는 https://로 시작하는 주소여야 합니다.' };
	}
	try {
		await assertPublicUrl(url, deps.ssrf);
	} catch {
		return { kind: 'invalid', message: '내부망 또는 사설 주소로는 웹페이지를 추가할 수 없습니다.' };
	}

	const api = await apiFor(deps, userId);
	const pageTitle = await fetchPageTitle(url, deps.ssrf);
	const created = await createWebpageItem(api, { url, title: pageTitle });

	// Zotero는 성공했는데 아래 삽입이 실패하면 500이 되지만, 다음 동기화가 같은 (user_id, item_key)를 채워 넣는다.
	const { data, error } = await deps.admin
		.from('papers')
		.upsert(
			{
				user_id: userId,
				item_key: created.key,
				item_version: created.version,
				title: cleanTitle(created.data.title, created.data.itemType) || '(제목 없음)',
				authors: extractAuthors(created.data.creators),
				year: extractYear(created.data.date),
				collections: created.data.collections ?? [],
				attachment_key: null,
				attachment_type: null,
				has_memo: false,
				synced_at: new Date().toISOString()
			},
			{ onConflict: 'user_id,item_key' }
		)
		.select('*')
		.single();
	if (error) throw error;
	return { kind: 'created', detail: await paperDetail(deps.admin, userId, data as PaperRow) };
}

// 순서: 논문 확인 → Zotero 현재 버전 조회 → Zotero 휴지통 → 앱 행 삭제(이력은 DB 연쇄 삭제).
// Zotero 단계가 실패하면 앱 행은 그대로 둔다. 반대 순서는 다음 동기화 때 되살아난다.
export async function deletePaper(deps: ZoteroDeps, userId: string, id: string): Promise<'deleted' | 'paper_not_found'> {
	const paper = await findOwnPaper(deps.admin, userId, id);
	if (!paper) return 'paper_not_found';

	if (paper.item_key) {
		const api = await apiFor(deps, userId);
		await trashInZotero(api, paper.item_key);
	}

	const { error } = await deps.admin.from('papers').delete().eq('user_id', userId).eq('id', id);
	if (error) throw error;
	// 비서가 읽는 캐시도 같이 정리한다. 없어도 괜찮다.
	if (paper.item_key) {
		const cache = await deps.admin.from('folio_papers').delete().eq('user_id', userId).eq('item_key', paper.item_key);
		if (cache.error) throw cache.error;
	}
	return 'deleted';
}

async function trashInZotero(api: ZoteroApi, itemKey: string): Promise<void> {
	// 412(그새 바뀜)이면 버전을 다시 읽어 한 번만 재시도한다. 404는 이미 지워진 것이라 성공으로 본다.
	for (let attempt = 0; attempt < 2; attempt++) {
		let version: number;
		try {
			version = (await fetchItem(api, itemKey)).version;
		} catch (err) {
			if (err instanceof ZoteroUnavailableError && err.status === 404) return;
			throw err;
		}
		try {
			await deleteItem(api, itemKey, version);
			return;
		} catch (err) {
			if (!(err instanceof ZoteroVersionConflictError) || attempt === 1) {
				if (err instanceof ZoteroVersionConflictError) throw new ZoteroUnavailableError('항목 삭제', 412);
				throw err;
			}
		}
	}
}

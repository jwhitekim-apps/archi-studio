// Zotero Web API 읽기 호출. 폴리오 zotero.js의 읽기 함수를 옮겼다.
// 실패는 ZoteroUnavailableError로 통일한다. 키와 Zotero 응답 원문은 오류에 넣지 않는다.

export interface ZoteroApi {
	baseUrl: string;
	userId: string;
	apiKey: string;
	fetch?: typeof fetch;
}

export interface ZoteroItem {
	key: string;
	version: number;
	data: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export class ZoteroUnavailableError extends Error {
	constructor(
		readonly what: string,
		readonly status: number | null
	) {
		super(`Zotero ${what} 실패${status ? `: ${status}` : ''}`);
		this.name = 'ZoteroUnavailableError';
	}
}

async function get(api: ZoteroApi, url: string, what: string): Promise<Response> {
	let res: Response;
	try {
		res = await (api.fetch ?? fetch)(url, {
			headers: { 'Zotero-API-Key': api.apiKey, 'Zotero-API-Version': '3' }
		});
	} catch {
		throw new ZoteroUnavailableError(what, null);
	}
	if (!res.ok) {
		await res.body?.cancel().catch(() => {});
		throw new ZoteroUnavailableError(what, res.status);
	}
	return res;
}

async function json<T>(res: Response, what: string): Promise<T> {
	try {
		return (await res.json()) as T;
	} catch {
		throw new ZoteroUnavailableError(what, null);
	}
}

const prefix = (api: ZoteroApi) => `${api.baseUrl}/users/${api.userId}`;

function nextLink(res: Response): string | null {
	const match = res.headers.get('Link')?.match(/<([^>]+)>;\s*rel="next"/);
	return match ? match[1] : null;
}

// Link 헤더를 따라 모든 페이지를 모은다.
async function getAllPages(api: ZoteroApi, firstUrl: string, what: string) {
	const items: ZoteroItem[] = [];
	let version: number | null = null;
	let url: string | null = firstUrl;
	while (url) {
		const res = await get(api, url, what);
		const modified = res.headers.get('Last-Modified-Version');
		if (modified) version = Math.max(version ?? 0, Number(modified));
		items.push(...(await json<ZoteroItem[]>(res, what)));
		url = nextLink(res);
	}
	return { items, version };
}

// 마지막 동기화 버전 이후 바뀐 최상위 항목과 새 라이브러리 버전.
export async function fetchChangedTopItems(api: ZoteroApi, sinceVersion: number) {
	const { items, version } = await getAllPages(
		api,
		`${prefix(api)}/items/top?since=${sinceVersion}&format=json&limit=100`,
		'항목 조회'
	);
	return { items, newVersion: Math.max(sinceVersion, version ?? sinceVersion) };
}

// 첨부만 새로 붙은 부모는 부모 버전이 안 바뀌어 top 조회에 걸리지 않는다. 바뀐 첨부의 부모 키를 모은다.
export async function fetchChangedAttachmentParentKeys(api: ZoteroApi, sinceVersion: number): Promise<string[]> {
	const { items } = await getAllPages(
		api,
		`${prefix(api)}/items?since=${sinceVersion}&itemType=attachment&format=json&limit=100`,
		'첨부 변경 조회'
	);
	const parents = new Set<string>();
	for (const item of items) if (item.data.parentItem) parents.add(item.data.parentItem);
	return [...parents];
}

export async function fetchDeletedItemKeys(api: ZoteroApi, sinceVersion: number): Promise<string[]> {
	const res = await get(api, `${prefix(api)}/deleted?since=${sinceVersion}`, '삭제 목록 조회');
	const body = await json<{ items?: string[] }>(res, '삭제 목록 조회');
	return body.items ?? [];
}

export async function fetchItem(api: ZoteroApi, itemKey: string): Promise<ZoteroItem> {
	const res = await get(api, `${prefix(api)}/items/${itemKey}?format=json`, '항목 조회');
	return json<ZoteroItem>(res, '항목 조회');
}

export async function fetchChildren(api: ZoteroApi, itemKey: string): Promise<ZoteroItem[]> {
	const res = await get(api, `${prefix(api)}/items/${itemKey}/children?format=json`, '자식 항목 조회');
	return json<ZoteroItem[]>(res, '자식 항목 조회');
}

export async function fetchCollections(api: ZoteroApi): Promise<ZoteroItem[]> {
	const { items } = await getAllPages(api, `${prefix(api)}/collections?format=json&limit=100`, '컬렉션 조회');
	return items;
}

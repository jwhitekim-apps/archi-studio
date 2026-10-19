// 시험 전용 가짜 Zotero 서버. 실제 Zotero에 접속하지 않고 OAuth와 Web API 일부를 흉내 낸다.
// 라이브러리 내용은 시험이 직접 바꾼다(addItem, bumpItem, removeItem, addAttachment, failChildren 등).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeItem {
	key: string;
	version: number;
	data: Record<string, unknown>;
}

export interface FakeZoteroOptions {
	userId?: string;
	username?: string;
	apiKey?: string;
	pageSize?: number;
}

export interface FakeZotero {
	url: string; // API와 OAuth가 같은 서버를 쓴다
	userId: string;
	username: string;
	apiKey: string;
	version: number; // 라이브러리 전체 버전
	failStatus: number | null; // 값이 있으면 모든 API 요청이 이 상태로 실패
	items: FakeItem[]; // 최상위 항목
	children: Map<string, FakeItem[]>; // 부모 key -> 자식(첨부, 노트)
	collections: FakeItem[];
	deleted: { key: string; version: number }[];
	failChildrenFor: Set<string>;
	calls: string[]; // "METHOD path" 기록
	files: Map<string, { body: Buffer; contentType: string }>; // 첨부 key -> 파일
	deleteConflicts: number; // 이 횟수만큼 삭제 요청에 412를 돌려준다(그때마다 항목 버전이 오른다)
	setFile(attachmentKey: string, body: Buffer, contentType: string): void;
	acceptUser(zoteroUserId: string): void; // 이 번호의 /users/<번호>/ 경로도 같은 라이브러리로 받는다
	addItem(data: Record<string, unknown>, key?: string): FakeItem;
	bumpItem(key: string, patch: Record<string, unknown>): FakeItem;
	removeItem(key: string): void;
	addChild(parentKey: string, data: Record<string, unknown>): FakeItem;
	addCollection(key: string, name: string, parentKey?: string): FakeItem;
	close(): Promise<void>;
}

export async function startFakeZotero(opts: FakeZoteroOptions = {}): Promise<FakeZotero> {
	const pageSize = opts.pageSize ?? 100;
	let counter = 0;
	const state = {
		userId: opts.userId ?? '4242',
		username: opts.username ?? 'fake-user',
		apiKey: opts.apiKey ?? 'fake-api-key-secret',
		version: 1,
		failStatus: null as number | null,
		items: [] as FakeItem[],
		children: new Map<string, FakeItem[]>(),
		collections: [] as FakeItem[],
		deleted: [] as { key: string; version: number }[],
		failChildrenFor: new Set<string>(),
		calls: [] as string[],
		files: new Map<string, { body: Buffer; contentType: string }>(),
		deleteConflicts: 0,
		extraUserIds: new Set<string>()
	};
	const tokens = new Map<string, string>(); // request token -> secret
	let baseUrl = '';

	const nextKey = () => `K${String(++counter).padStart(7, '0')}`;
	const bump = () => ++state.version;

	function json(res: ServerResponse, body: unknown, headers: Record<string, string> = {}, status = 200) {
		res.writeHead(status, {
			'content-type': 'application/json',
			'Last-Modified-Version': String(state.version),
			...headers
		});
		res.end(JSON.stringify(body));
	}

	function paged(req: IncomingMessage, res: ServerResponse, url: URL, all: FakeItem[]) {
		const start = Number(url.searchParams.get('start') ?? 0);
		const limit = Math.min(Number(url.searchParams.get('limit') ?? pageSize), pageSize);
		const slice = all.slice(start, start + limit);
		const headers: Record<string, string> = { 'Total-Results': String(all.length) };
		if (start + limit < all.length) {
			const next = new URL(url);
			next.searchParams.set('start', String(start + limit));
			next.searchParams.set('limit', String(limit));
			headers.Link = `<${baseUrl}${next.pathname}${next.search}>; rel="next"`;
		}
		json(res, slice, headers);
	}

	async function handleOauth(req: IncomingMessage, res: ServerResponse, url: URL) {
		if (url.pathname === '/oauth/request' && req.method === 'POST') {
			const token = `req-${nextKey()}`;
			const secret = `reqsecret-${nextKey()}`;
			tokens.set(token, secret);
			res.writeHead(200, { 'content-type': 'application/x-www-form-urlencoded' });
			res.end(new URLSearchParams({ oauth_token: token, oauth_token_secret: secret, oauth_callback_confirmed: 'true' }).toString());
			return;
		}
		if (url.pathname === '/oauth/access' && req.method === 'POST') {
			const auth = String(req.headers.authorization ?? '');
			const verifier = /oauth_verifier="([^"]*)"/.exec(auth)?.[1];
			const token = /oauth_token="([^"]*)"/.exec(auth)?.[1];
			if (!verifier || !token || !tokens.has(decodeURIComponent(token))) {
				res.writeHead(401).end('bad token');
				return;
			}
			res.writeHead(200, { 'content-type': 'application/x-www-form-urlencoded' });
			res.end(
				new URLSearchParams({
					oauth_token: token,
					oauth_token_secret: state.apiKey,
					userID: state.userId,
					username: state.username
				}).toString()
			);
			return;
		}
		res.writeHead(404).end();
	}

	function handleApi(req: IncomingMessage, res: ServerResponse, url: URL, body: Buffer) {
		if (state.failStatus) {
			res.writeHead(state.failStatus).end('upstream failure body');
			return;
		}
		if (req.headers['zotero-api-key'] !== state.apiKey) {
			res.writeHead(403).end('forbidden');
			return;
		}
		const m = /^\/users\/([^/]+)\/(.*)$/.exec(url.pathname);
		if (!m || (m[1] !== state.userId && !state.extraUserIds.has(m[1]))) {
			res.writeHead(404).end();
			return;
		}
		const rest = m[2];

		if (req.method === 'POST' && rest === 'items') {
			const list = JSON.parse(body.toString('utf8')) as Record<string, unknown>[];
			const successful: Record<string, FakeItem> = {};
			list.forEach((data, i) => {
				successful[String(i)] = fake.addItem(data);
			});
			return json(res, { successful, failed: {} });
		}
		if (req.method === 'DELETE') {
			const dm = /^items\/([^/]+)$/.exec(rest);
			const item = dm ? state.items.find((i) => i.key === dm[1]) : undefined;
			if (!item) {
				res.writeHead(404).end();
				return;
			}
			if (state.deleteConflicts > 0) {
				state.deleteConflicts--;
				item.version = bump();
				res.writeHead(412).end();
				return;
			}
			if (req.headers['if-unmodified-since-version'] !== String(item.version)) {
				res.writeHead(412).end();
				return;
			}
			fake.removeItem(item.key);
			res.writeHead(204, { 'Last-Modified-Version': String(state.version) }).end();
			return;
		}

		const fm = /^items\/([^/]+)\/file$/.exec(rest);
		if (fm) {
			const file = state.files.get(fm[1]);
			if (!file) {
				res.writeHead(404).end();
				return;
			}
			res.writeHead(200, { 'content-type': file.contentType, 'content-length': String(file.body.length) }).end(file.body);
			return;
		}

		const since = Number(url.searchParams.get('since') ?? 0);

		if (rest === 'items/top') {
			return paged(req, res, url, state.items.filter((i) => i.version > since));
		}
		if (rest === 'items') {
			const type = url.searchParams.get('itemType');
			if (type === 'attachment') {
				const atts = [...state.children.values()].flat().filter((c) => c.data.itemType === 'attachment' && c.version > since);
				return paged(req, res, url, atts);
			}
			return paged(req, res, url, state.items.filter((i) => i.version > since));
		}
		if (rest === 'deleted') {
			return json(res, { items: state.deleted.filter((d) => d.version > since).map((d) => d.key) });
		}
		if (rest === 'collections') {
			return paged(req, res, url, state.collections);
		}
		let mm = /^items\/([^/]+)\/children$/.exec(rest);
		if (mm) {
			if (state.failChildrenFor.has(mm[1])) {
				res.writeHead(500).end('children failure');
				return;
			}
			return json(res, state.children.get(mm[1]) ?? []);
		}
		mm = /^items\/([^/]+)$/.exec(rest);
		if (mm) {
			const item = state.items.find((i) => i.key === mm![1]);
			if (!item) {
				res.writeHead(404).end();
				return;
			}
			return json(res, item);
		}
		res.writeHead(404).end();
	}

	const server: Server = createServer((req, res) => {
		const url = new URL(req.url ?? '/', baseUrl || 'http://localhost');
		state.calls.push(`${req.method} ${url.pathname}`);
		if (url.pathname.startsWith('/oauth/')) {
			void handleOauth(req, res, url);
			return;
		}
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => chunks.push(c));
		req.on('end', () => handleApi(req, res, url, Buffer.concat(chunks)));
	});

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

	const fake: FakeZotero = {
		url: baseUrl,
		get userId() { return state.userId; },
		set userId(v) { state.userId = v; },
		username: state.username,
		apiKey: state.apiKey,
		get version() { return state.version; },
		set version(v) { state.version = v; },
		get failStatus() { return state.failStatus; },
		set failStatus(v) { state.failStatus = v; },
		items: state.items,
		children: state.children,
		collections: state.collections,
		deleted: state.deleted,
		failChildrenFor: state.failChildrenFor,
		calls: state.calls,
		files: state.files,
		get deleteConflicts() { return state.deleteConflicts; },
		set deleteConflicts(v) { state.deleteConflicts = v; },
		acceptUser(zoteroUserId) {
			state.extraUserIds.add(zoteroUserId);
		},
		setFile(attachmentKey, body, contentType) {
			state.files.set(attachmentKey, { body, contentType });
		},
		addItem(data, key) {
			const item: FakeItem = { key: key ?? nextKey(), version: bump(), data: { itemType: 'journalArticle', ...data } };
			(item.data as Record<string, unknown>).key = item.key;
			state.items.push(item);
			return item;
		},
		bumpItem(key, patch) {
			const item = state.items.find((i) => i.key === key);
			if (!item) throw new Error(`no item ${key}`);
			item.version = bump();
			Object.assign(item.data, patch);
			return item;
		},
		removeItem(key) {
			const idx = state.items.findIndex((i) => i.key === key);
			if (idx >= 0) state.items.splice(idx, 1);
			state.children.delete(key);
			state.deleted.push({ key, version: bump() });
		},
		addChild(parentKey, data) {
			const child: FakeItem = { key: nextKey(), version: bump(), data: { parentItem: parentKey, ...data } };
			(child.data as Record<string, unknown>).key = child.key;
			state.children.set(parentKey, [...(state.children.get(parentKey) ?? []), child]);
			return child;
		},
		addCollection(key, name, parentKey) {
			const col = { key, version: bump(), data: { key, name, parentCollection: parentKey ?? false } };
			state.collections.push(col);
			return col;
		},
		close: () => new Promise<void>((resolve) => server.close(() => resolve()))
	};
	return fake;
}

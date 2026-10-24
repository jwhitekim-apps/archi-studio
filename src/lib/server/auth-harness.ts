// 통합 테스트용 가짜 브라우저. 가드(createApiHandle)와 auth 라우트를 실제로 거쳐 요청하고, 쿠키 저장소를 흉내 낸다.
import { createApiHandle } from './api-guard';
import { verifySession } from './session';
import { GET as meGet } from '../../routes/api/auth/me/+server';
import { POST as loginPost } from '../../routes/api/auth/login/+server';
import { POST as logoutPost } from '../../routes/api/auth/logout/+server';
import { POST as signupPost } from '../../routes/api/auth/signup/+server';
import { GET as zoteroConnectGet } from '../../routes/api/zotero/connect/+server';
import { GET as zoteroCallbackGet } from '../../routes/api/zotero/callback/+server';
import { GET as zoteroStatusGet } from '../../routes/api/zotero/status/+server';
import { POST as zoteroSyncPost } from '../../routes/api/zotero/sync/+server';
import { GET as papersGet } from '../../routes/api/papers/+server';
import { GET as paperGet } from '../../routes/api/papers/[id]/+server';
import { GET as collectionsGet } from '../../routes/api/collections/+server';
import { GET as paperFileGet } from '../../routes/api/papers/[id]/file/+server';
import { DELETE as paperDelete } from '../../routes/api/papers/[id]/+server';
import { POST as webpagePost } from '../../routes/api/papers/webpage/+server';
import { DELETE as zoteroConnectionDelete } from '../../routes/api/zotero/connection/+server';
import { POST as translatePost } from '../../routes/api/translate/+server';
import { GET as translateHistoryGet } from '../../routes/api/translate/history/+server';
import { GET as memoGet, PUT as memoPut } from '../../routes/api/papers/[id]/memo/+server';
import { GET as analysisGet, POST as analysisPost } from '../../routes/api/papers/[id]/analysis/+server';

export interface CookieOptions {
	path?: string;
	httpOnly?: boolean;
	sameSite?: string;
	secure?: boolean;
	maxAge?: number;
}

export interface SetCookie {
	name: string;
	value: string;
	options: CookieOptions;
}

export interface HarnessResponse {
	status: number;
	headers: Headers;
	body: unknown;
	bytes: Uint8Array; // JSON이 아닌 응답(PDF, HTML)은 body가 null이고 원본 바이트가 여기 있다
	setCookies: SetCookie[];
	deleted: string[];
}

type Handler = (event: never) => Promise<Response> | Response;

const routes: Record<string, Handler> = {
	'POST /api/auth/signup': signupPost as unknown as Handler,
	'POST /api/auth/login': loginPost as unknown as Handler,
	'POST /api/auth/logout': logoutPost as unknown as Handler,
	'GET /api/auth/me': meGet as unknown as Handler,
	'GET /api/zotero/connect': zoteroConnectGet as unknown as Handler,
	'GET /api/zotero/callback': zoteroCallbackGet as unknown as Handler,
	'GET /api/zotero/status': zoteroStatusGet as unknown as Handler,
	'POST /api/papers/webpage': webpagePost as unknown as Handler,
	'GET /api/papers': papersGet as unknown as Handler,
	'GET /api/collections': collectionsGet as unknown as Handler,
	'POST /api/zotero/sync': zoteroSyncPost as unknown as Handler,
	'DELETE /api/zotero/connection': zoteroConnectionDelete as unknown as Handler,
	'POST /api/translate': translatePost as unknown as Handler,
	'GET /api/translate/history': translateHistoryGet as unknown as Handler
};

// 경로 매개변수가 있는 라우트. 이름 있는 그룹이 event.params가 된다.
const paramRoutes: { method: string; pattern: RegExp; handler: Handler }[] = [
	{ method: 'GET', pattern: /^\/api\/papers\/(?<id>[^/]+)$/, handler: paperGet as unknown as Handler },
	{ method: 'DELETE', pattern: /^\/api\/papers\/(?<id>[^/]+)$/, handler: paperDelete as unknown as Handler },
	{ method: 'GET', pattern: /^\/api\/papers\/(?<id>[^/]+)\/file$/, handler: paperFileGet as unknown as Handler },
	{ method: 'GET', pattern: /^\/api\/papers\/(?<id>[^/]+)\/memo$/, handler: memoGet as unknown as Handler },
	{ method: 'PUT', pattern: /^\/api\/papers\/(?<id>[^/]+)\/memo$/, handler: memoPut as unknown as Handler },
	{ method: 'POST', pattern: /^\/api\/papers\/(?<id>[^/]+)\/analysis$/, handler: analysisPost as unknown as Handler },
	{ method: 'GET', pattern: /^\/api\/papers\/(?<id>[^/]+)\/analysis$/, handler: analysisGet as unknown as Handler }
];

const handle = createApiHandle({ verify: verifySession });

export class Browser {
	jar = new Map<string, string>();

	constructor(
		readonly ip: string,
		private readonly origin = 'http://localhost'
	) {}

	cookie(name: string): string | undefined {
		return this.jar.get(name);
	}

	// raw를 주면 body 대신 그 문자열을 그대로 보낸다(JSON이 아닌 본문 시험용).
	async request(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown, raw?: string): Promise<HarnessResponse> {
		const setCookies: SetCookie[] = [];
		const deleted: string[] = [];
		// 요청 안에서의 쿠키 읽기는 이 요청이 설정한 값을 먼저 보여 준다(SvelteKit과 같다).
		const live = new Map(this.jar);
		const cookies = {
			get: (name: string) => live.get(name),
			set: (name: string, value: string, options: CookieOptions) => {
				live.set(name, value);
				setCookies.push({ name, value, options });
			},
			delete: (name: string, _options?: CookieOptions) => {
				live.delete(name);
				deleted.push(name);
			}
		};
		const url = new URL(path, this.origin);
		const event = {
			request: new Request(url, {
				method,
				headers: body === undefined && raw === undefined ? {} : { 'content-type': 'application/json' },
				body: raw ?? (body === undefined ? undefined : JSON.stringify(body))
			}),
			url,
			cookies,
			locals: { user: null },
			getClientAddress: () => this.ip
		};
		const resolve = async (e: unknown): Promise<Response> => {
			const route = routes[`${method} ${url.pathname}`];
			if (route) return route(e as never);
			for (const r of paramRoutes) {
				const m = r.method === method ? r.pattern.exec(url.pathname) : null;
				if (m) return r.handler({ ...(e as object), params: m.groups ?? {} } as never);
			}
			return new Response('not found', { status: 404 });
		};
		const res = await handle({ event, resolve } as never);

		for (const c of setCookies) {
			if ((c.options.maxAge ?? 1) > 0) this.jar.set(c.name, c.value);
		}
		for (const name of deleted) this.jar.delete(name);

		const bytes = new Uint8Array(await res.arrayBuffer());
		const isJson = (res.headers.get('content-type') ?? '').includes('json');
		const text = new TextDecoder().decode(bytes);
		return { status: res.status, headers: res.headers, body: isJson && text ? JSON.parse(text) : null, bytes, setCookies, deleted };
	}
}

// 통합 테스트용 가짜 브라우저. 가드(createApiHandle)와 auth 라우트를 실제로 거쳐 요청하고, 쿠키 저장소를 흉내 낸다.
import { createApiHandle } from './api-guard';
import { verifySession } from './session';
import { GET as meGet } from '../../routes/api/auth/me/+server';
import { POST as loginPost } from '../../routes/api/auth/login/+server';
import { POST as logoutPost } from '../../routes/api/auth/logout/+server';
import { POST as signupPost } from '../../routes/api/auth/signup/+server';

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
	body: unknown;
	setCookies: SetCookie[];
	deleted: string[];
}

type Handler = (event: never) => Promise<Response> | Response;

const routes: Record<string, Handler> = {
	'POST /api/auth/signup': signupPost as unknown as Handler,
	'POST /api/auth/login': loginPost as unknown as Handler,
	'POST /api/auth/logout': logoutPost as unknown as Handler,
	'GET /api/auth/me': meGet as unknown as Handler
};

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

	async request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<HarnessResponse> {
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
			delete: (name: string) => {
				live.delete(name);
				deleted.push(name);
			}
		};
		const url = new URL(path, this.origin);
		const event = {
			request: new Request(url, {
				method,
				headers: body === undefined ? {} : { 'content-type': 'application/json' },
				body: body === undefined ? undefined : JSON.stringify(body)
			}),
			url,
			cookies,
			locals: { user: null },
			getClientAddress: () => this.ip
		};
		const resolve = async (e: unknown): Promise<Response> => {
			const route = routes[`${method} ${url.pathname}`];
			return route ? route(e as never) : new Response('not found', { status: 404 });
		};
		const res = await handle({ event, resolve } as never);

		for (const c of setCookies) {
			if ((c.options.maxAge ?? 1) > 0) this.jar.set(c.name, c.value);
		}
		for (const name of deleted) this.jar.delete(name);

		const text = await res.text();
		return { status: res.status, body: text ? JSON.parse(text) : null, setCookies, deleted };
	}
}

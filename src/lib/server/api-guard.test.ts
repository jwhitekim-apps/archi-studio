import { describe, expect, it, vi } from 'vitest';
import { createApiHandle } from './api-guard';
import { errorResponse } from './errors';
import type { SessionVerifier } from './session';

type Resolve = (event: unknown) => Response | Promise<Response>;

// 가짜 세션 검증: 'good'만 유효, 'expired'와 위조 값은 null, 'boom'은 서버 장애.
const verify: SessionVerifier = async (token) => {
	if (token === 'good') return { user: { id: 'user-1' } };
	if (token === 'renew') return { user: { id: 'user-1' }, renewedToken: 'new-token' };
	if (token === 'boom') throw new Error('db down: password=secret');
	return null;
};

function run(
	path: string,
	opts: {
		method?: string;
		cookie?: string;
		resolve?: Resolve;
		headers?: Record<string, string>;
		body?: string;
	} = {}
) {
	const handle = createApiHandle({ verify });
	const locals: { user: { id: string } | null } = { user: null };
	const resolve = vi.fn(opts.resolve ?? (() => new Response('ok')));
	const setCookie = vi.fn();
	const event = {
		url: new URL(`http://localhost${path}`),
		request: new Request(`http://localhost${path}`, {
			method: opts.method ?? 'GET',
			headers: opts.headers,
			body: opts.body
		}),
		cookies: {
			get: (name: string) => (name === 'archi_session' ? opts.cookie : undefined),
			set: setCookie
		},
		locals
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const res = (handle as any)({ event, resolve }) as Promise<Response>;
	return { res, resolve, locals, setCookie };
}

const healthOk: Resolve = () =>
	new Response(JSON.stringify({ status: 'ok' }), { headers: { 'content-type': 'application/json' } });

describe('3.1 공통 오류 형식', () => {
	it('없는 /api 경로는 404 not_found', async () => {
		const { res } = run('/api/nope', {
			cookie: 'good',
			resolve: () => new Response('Not found', { status: 404 })
		});
		const r = await res;
		expect(r.status).toBe(404);
		expect(await r.json()).toEqual({
			error: { code: 'not_found', message: expect.any(String) }
		});
	});

	it('허용되지 않는 메서드는 405 method_not_allowed (Allow 유지)', async () => {
		const { res } = run('/api/health', {
			method: 'DELETE',
			cookie: 'good',
			resolve: () => new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET' } })
		});
		const r = await res;
		expect(r.status).toBe(405);
		expect(r.headers.get('allow')).toBe('GET');
		expect((await r.json()).error.code).toBe('method_not_allowed');
	});

	it('처리하지 못한 예외는 500 internal_error이고 원문이 새지 않는다', async () => {
		const { res } = run('/api/x', {
			cookie: 'good',
			resolve: () => {
				throw new Error('SELECT * FROM secrets; at /srv/app/db.ts:12');
			}
		});
		const r = await res;
		const text = await r.text();
		expect(r.status).toBe(500);
		expect(JSON.parse(text).error.code).toBe('internal_error');
		expect(text).not.toMatch(/SELECT|secrets|\/srv|db\.ts|stack/i);
	});

	it('SvelteKit이 만든 500 응답도 공통 형식으로 바뀐다', async () => {
		const { res } = run('/api/x', {
			cookie: 'good',
			resolve: () => new Response('{"message":"Error: boom\\n at x.ts:1"}', { status: 500 })
		});
		const r = await res;
		const text = await r.text();
		expect(r.status).toBe(500);
		expect(JSON.parse(text).error.code).toBe('internal_error');
		expect(text).not.toMatch(/boom|x\.ts/);
	});

	it('라우트가 직접 만든 404(자기 code)는 그대로 나가고 표시 헤더는 없다', async () => {
		const { res } = run('/api/papers/1', {
			cookie: 'good',
			resolve: () => errorResponse(404, 'paper_not_found', '논문을 찾을 수 없습니다.')
		});
		const r = await res;
		expect(r.status).toBe(404);
		expect((await r.json()).error.code).toBe('paper_not_found');
		expect(r.headers.get('x-archi-error')).toBeNull();
	});
});

describe('3.2 세션 쿠키와 인증 차단', () => {
	it('쿠키 없음: 401 unauthenticated, 라우트는 호출되지 않는다', async () => {
		const { res, resolve, locals } = run('/api/papers');
		const r = await res;
		expect(r.status).toBe(401);
		expect((await r.json()).error.code).toBe('unauthenticated');
		expect(resolve).not.toHaveBeenCalled();
		expect(locals.user).toBeNull();
	});

	it('만료·위조 쿠키: 401이고 사용자 정보를 넘기지 않는다', async () => {
		for (const cookie of ['expired', 'forged.value.x']) {
			const { res, resolve, locals } = run('/api/papers', { cookie });
			const r = await res;
			expect(r.status).toBe(401);
			expect((await r.json()).error.code).toBe('unauthenticated');
			expect(resolve).not.toHaveBeenCalled();
			expect(locals.user).toBeNull();
		}
	});

	it('유효 쿠키: 요청을 처리하고 locals.user에 사용자를 넣는다', async () => {
		const { res, resolve, locals } = run('/api/papers', { cookie: 'good' });
		const r = await res;
		expect(r.status).toBe(200);
		expect(resolve).toHaveBeenCalledOnce();
		expect(locals.user).toEqual({ id: 'user-1' });
	});

	it('검증 중 서버 장애는 500이며 원문이 새지 않는다', async () => {
		const { res } = run('/api/papers', { cookie: 'boom' });
		const r = await res;
		const text = await r.text();
		expect(r.status).toBe(500);
		expect(text).not.toMatch(/password|secret|db down/i);
	});

	it('/api가 아닌 경로는 쿠키 없이도 통과한다', async () => {
		const { res, resolve } = run('/');
		expect((await res).status).toBe(200);
		expect(resolve).toHaveBeenCalledOnce();
	});

	it('목록에 없는 새 /api 경로는 기본적으로 보호된다', async () => {
		const { res } = run('/api/brand-new');
		expect((await res).status).toBe(401);
	});
});

describe('2.1 갱신된 세션 쿠키와 공개 경로', () => {
	it('검증이 renewedToken을 돌려주면 archi_session 쿠키를 새 값과 속성으로 다시 설정한다', async () => {
		const { res, resolve, setCookie } = run('/api/papers', { cookie: 'renew' });
		const r = await res;
		expect(r.status).toBe(200);
		expect(resolve).toHaveBeenCalledOnce();
		expect(setCookie).toHaveBeenCalledOnce();
		expect(setCookie).toHaveBeenCalledWith('archi_session', 'new-token', {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: false,
			maxAge: 30 * 24 * 60 * 60
		});
	});

	it('갱신이 없으면 쿠키를 건드리지 않는다', async () => {
		const { res, setCookie } = run('/api/papers', { cookie: 'good' });
		await res;
		expect(setCookie).not.toHaveBeenCalled();
	});

	it('가입과 로그인은 쿠키 없이 통과하고, 같은 경로의 다른 메서드는 막힌다', async () => {
		for (const path of ['/api/auth/signup', '/api/auth/login']) {
			const ok = run(path, { method: 'POST' });
			expect((await ok.res).status).toBe(200);
			expect(ok.resolve).toHaveBeenCalledOnce();
			const blocked = run(path, { method: 'GET' });
			expect((await blocked.res).status).toBe(401);
		}
	});

	it('로그아웃과 me는 공개가 아니다', async () => {
		expect((await run('/api/auth/me').res).status).toBe(401);
		expect((await run('/api/auth/logout', { method: 'POST' }).res).status).toBe(401);
	});
});

describe('3.3 GET /api/health', () => {
	it('쿠키 없이 200 {"status":"ok"}이고 사용자·DB 정보가 없다', async () => {
		const { res, resolve } = run('/api/health', { resolve: healthOk });
		const r = await res;
		expect(r.status).toBe(200);
		const body = await r.json();
		expect(body).toEqual({ status: 'ok' });
		expect(resolve).toHaveBeenCalledOnce();
	});

	it('공개 목록은 메서드까지 일치해야 한다 (쿠키 없는 POST는 401)', async () => {
		const { res } = run('/api/health', { method: 'POST' });
		expect((await res).status).toBe(401);
	});
});

describe('1.1 퍼센트 인코딩된 경로로 보호를 우회할 수 없다', () => {
	it('인코딩된 /api 경로도 쿠키 없이는 401이고 라우트는 호출되지 않는다', async () => {
		for (const [method, path] of [
			['POST', '/%61pi/auth/logout'],
			['GET', '/%61pi/papers'],
			['GET', '/%61%70%69/papers'],
			['GET', '/api/%70apers']
		] as const) {
			const { res, resolve } = run(path, { method });
			const r = await res;
			expect(r.status, `${method} ${path}`).toBe(401);
			expect((await r.json()).error.code).toBe('unauthenticated');
			expect(resolve, `${method} ${path}`).not.toHaveBeenCalled();
		}
	});

	it('디코딩에 실패하는 /api 경로는 쿠키 없이 401이다', async () => {
		const { res, resolve } = run('/api/%E0%A4%A');
		const r = await res;
		expect(r.status).toBe(401);
		expect((await r.json()).error.code).toBe('unauthenticated');
		expect(resolve).not.toHaveBeenCalled();
	});

	it('디코딩하면 공개 경로인 요청은 공개 경로로 판정한다', async () => {
		const { res, resolve } = run('/api/%68ealth', { resolve: healthOk });
		const r = await res;
		expect(r.status).toBe(200);
		expect(await r.json()).toEqual({ status: 'ok' });
		expect(resolve).toHaveBeenCalledOnce();
	});

	it('%25는 라우터처럼 그대로 두어 /api%2Fhealth 같은 값이 공개 경로로 오인되지 않는다', async () => {
		const { res, resolve } = run('/api%2Fhealth');
		// /api%2Fhealth는 /api 아래 경로가 아니므로 프레임워크가 처리한다(보호 대상이 아니다).
		expect((await res).status).toBe(200);
		expect(resolve).toHaveBeenCalledOnce();
		const nested = run('/api/%25/health');
		expect((await nested.res).status).toBe(401);
	});

	it('/api가 아닌 일반 경로는 인코딩돼 있어도 그대로 통과한다', async () => {
		const { res, resolve } = run('/%EB%A1%9C%EA%B7%B8%EC%9D%B8');
		expect((await res).status).toBe(200);
		expect(resolve).toHaveBeenCalledOnce();
	});
});

describe('2.2 CSRF: 다른 출처의 폼 형식 쓰기 요청', () => {
	const FORM = 'application/x-www-form-urlencoded';
	const EVIL = 'http://evil.example';
	const SAME = 'http://localhost';

	async function post(
		path: string,
		opts: { method?: string; origin?: string | null; type?: string | null; accept?: string } = {}
	) {
		const headers: Record<string, string> = {};
		if (opts.origin) headers.origin = opts.origin;
		if (opts.type) headers['content-type'] = opts.type;
		if (opts.accept) headers.accept = opts.accept;
		const method = opts.method ?? 'POST';
		const r = run(path, { method, headers, body: ['GET', 'HEAD'].includes(method) ? undefined : 'a=1' });
		return { ...r, response: await r.res };
	}

	it('다른 출처 + 폼 형식 + /api: 403 forbidden_origin JSON, 라우트 미실행, 표시 헤더 없음', async () => {
		const { response, resolve } = await post('/api/auth/login', { origin: EVIL, type: FORM });
		expect(response.status).toBe(403);
		expect(response.headers.get('content-type')).toContain('application/json');
		expect(response.headers.get('x-archi-error')).toBeNull();
		expect((await response.json()).error.code).toBe('forbidden_origin');
		expect(resolve).not.toHaveBeenCalled();
	});

	it('Origin 헤더가 없는 폼 형식 쓰기도 막는다 (프레임워크와 같음)', async () => {
		const { response, resolve } = await post('/api/auth/login', { origin: null, type: FORM });
		expect(response.status).toBe(403);
		expect((await response.json()).error.code).toBe('forbidden_origin');
		expect(resolve).not.toHaveBeenCalled();
	});

	it('같은 출처 + 폼 형식은 통과한다', async () => {
		const { response, resolve } = await post('/api/auth/login', { origin: SAME, type: FORM });
		expect(response.status).toBe(200);
		expect(resolve).toHaveBeenCalledOnce();
	});

	it('JSON 본문은 출처가 달라도, 없어도 통과한다 (프레임워크와 같음)', async () => {
		for (const origin of [EVIL, null]) {
			const { response, resolve } = await post('/api/auth/login', {
				origin,
				type: 'application/json'
			});
			expect(response.status).toBe(200);
			expect(resolve).toHaveBeenCalledOnce();
		}
	});

	it('본문과 Content-Type이 없는 요청은 폼이 아니므로 통과한다', async () => {
		const r = run('/api/auth/login', { method: 'POST', headers: { origin: EVIL } });
		expect((await r.res).status).toBe(200);
		expect(r.resolve).toHaveBeenCalledOnce();
	});

	it('폼으로 취급하는 모든 Content-Type을 막는다 (대소문자와 매개변수 포함)', async () => {
		for (const type of [
			'application/x-www-form-urlencoded',
			'APPLICATION/X-WWW-FORM-URLENCODED; charset=UTF-8',
			'multipart/form-data; boundary=x',
			'text/plain',
			'application/x-sveltekit-formdata'
		]) {
			const { response, resolve } = await post('/api/auth/login', { origin: EVIL, type });
			expect(response.status, type).toBe(403);
			expect(resolve, type).not.toHaveBeenCalled();
		}
	});

	it('쓰기 메서드(POST, PUT, PATCH, DELETE)만 막고 GET과 HEAD는 통과한다', async () => {
		for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
			const { response } = await post('/api/papers/1', { method, origin: EVIL, type: FORM });
			expect(response.status, method).toBe(403);
			expect((await response.json()).error.code, method).toBe('forbidden_origin');
		}
		for (const method of ['GET', 'HEAD']) {
			const { response } = await post('/api/health', { method, origin: EVIL, type: FORM });
			expect(response.status, method).not.toBe(403);
		}
	});

	it('CSRF 거부는 인증 검사보다 먼저다 (쿠키 없이도 403)', async () => {
		const { response } = await post('/api/papers', { origin: EVIL, type: FORM });
		expect(response.status).toBe(403);
	});

	it('/api가 아닌 경로는 지금처럼 일반 텍스트 403이고, Accept가 JSON이면 { message } JSON이다', async () => {
		const plain = await post('/login', { origin: EVIL, type: FORM });
		expect(plain.response.status).toBe(403);
		expect(plain.response.headers.get('content-type')).toContain('text/plain');
		expect(await plain.response.text()).toBe('Cross-site POST form submissions are forbidden');
		expect(plain.resolve).not.toHaveBeenCalled();

		const json = await post('/login', { origin: EVIL, type: FORM, accept: 'application/json' });
		expect(json.response.status).toBe(403);
		expect(await json.response.json()).toEqual({
			message: 'Cross-site POST form submissions are forbidden'
		});
	});

	it('인코딩된 /api 경로로 보내도 같은 거부가 적용된다', async () => {
		const { response } = await post('/%61pi/auth/login', { origin: EVIL, type: FORM });
		expect(response.status).toBe(403);
		expect((await response.json()).error.code).toBe('forbidden_origin');
	});
});

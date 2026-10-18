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

function run(path: string, opts: { method?: string; cookie?: string; resolve?: Resolve } = {}) {
	const handle = createApiHandle({ verify });
	const locals: { user: { id: string } | null } = { user: null };
	const resolve = vi.fn(opts.resolve ?? (() => new Response('ok')));
	const setCookie = vi.fn();
	const event = {
		url: new URL(`http://localhost${path}`),
		request: new Request(`http://localhost${path}`, { method: opts.method ?? 'GET' }),
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

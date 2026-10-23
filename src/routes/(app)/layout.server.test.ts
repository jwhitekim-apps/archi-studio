import { isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { load as appLoad } from './+layout.server';
import { load as authLoad } from '../(auth)/+layout.server';

const user = { id: '00000000-0000-4000-8000-000000000001', email: 'user@example.com', zoteroConnected: false };

function event(status: number, path = '/library?query=a&collection=K1') {
	const fetch = vi.fn(async () =>
		status === 200
			? new Response(JSON.stringify(user), { status, headers: { 'content-type': 'application/json' } })
			: new Response(JSON.stringify({ error: { code: 'x', message: '' } }), { status })
	);
	return { fetch, url: new URL(`http://localhost${path}`) } as never;
}

async function thrown(promise: unknown) {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	return undefined;
}

describe('(app) 로그인 확인', () => {
	it('401이면 경로와 쿼리를 인코딩해 로그인 화면으로 303', async () => {
		const error = await thrown(appLoad(event(401)));
		expect(isRedirect(error)).toBe(true);
		expect(error).toMatchObject({ status: 303, location: '/login?redirect=%2Flibrary%3Fquery%3Da%26collection%3DK1' });
	});

	it('200이면 사용자를 넘긴다', async () => {
		const e = event(200);
		expect(await appLoad(e)).toEqual({ user });
		expect((e as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch).toHaveBeenCalledWith('/api/auth/me');
	});

	it('/api/auth/me가 500이면 이동이 아니라 오류 페이지', async () => {
		const error = await thrown(appLoad(event(500)));
		expect(isRedirect(error)).toBe(false);
		expect(isHttpError(error)).toBe(true);
		expect(error).toMatchObject({ status: 503 });
	});
});

describe('(auth) 로그인 화면', () => {
	it('이미 로그인했으면 서재로 303', async () => {
		const error = await thrown(authLoad(event(200, '/login')));
		expect(error).toMatchObject({ status: 303, location: '/library' });
	});

	it('로그인하지 않았으면 화면을 연다', async () => {
		expect(await authLoad(event(401, '/login'))).toEqual({});
	});
});

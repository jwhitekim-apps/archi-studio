import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, fallbackCode, loginUrl } from './client';
import { errorMessage, GENERIC_MESSAGE, MESSAGES } from './messages';

const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function setup(response: () => Response | Promise<Response>) {
	const fetchMock = vi.fn(async () => response());
	const navigate = vi.fn();
	const api = createApiClient({
		fetch: () => fetchMock as unknown as typeof fetch,
		navigate,
		currentUrl: () => new URL('http://localhost/library?query=a b')
	});
	return { api, fetchMock, navigate };
}

describe('apiFetch', () => {
	it('정상 응답은 JSON을 돌려주고 본문은 JSON으로 보낸다', async () => {
		const { api, fetchMock } = setup(() => json(200, { id: '1' }));
		expect(await api('/api/papers', { method: 'POST', body: { url: 'x' } })).toEqual({ id: '1' });
		const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(init.method).toBe('POST');
		expect(init.body).toBe('{"url":"x"}');
		expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
	});

	it('204는 undefined', async () => {
		const { api } = setup(() => new Response(null, { status: 204 }));
		expect(await api('/api/zotero/connection', { method: 'DELETE' })).toBeUndefined();
	});

	it('공통 오류 형식은 코드와 문구를 그대로 쓴다', async () => {
		const { api } = setup(() => json(409, { error: { code: 'email_taken', message: '이미 있음' } }));
		await expect(api('/api/auth/signup')).rejects.toMatchObject({ status: 409, code: 'email_taken', message: '이미 있음' });
	});

	it('JSON이 아니거나 형식이 다른 오류는 상태 코드로 대체 코드를 만든다', async () => {
		const html = setup(() => new Response('<h1>Bad Gateway</h1>', { status: 502 }));
		await expect(html.api('/api/papers')).rejects.toMatchObject({ status: 502, code: 'internal_error' });
		const other = setup(() => json(400, { message: 'x' }));
		await expect(other.api('/api/papers')).rejects.toMatchObject({ status: 400, code: 'invalid_request' });
		expect(fallbackCode(418)).toBe('http_418');
	});

	it('네트워크 실패는 network_error', async () => {
		const { api } = setup(() => {
			throw new TypeError('fetch failed');
		});
		await expect(api('/api/papers')).rejects.toMatchObject({ status: 0, code: 'network_error' });
	});

	it('401이 동시에 여러 번 와도 로그인 화면 이동은 한 번', async () => {
		const { api, navigate } = setup(() => json(401, { error: { code: 'unauthenticated', message: '' } }));
		const results = await Promise.allSettled([api('/api/papers'), api('/api/collections'), api('/api/zotero/status')]);
		expect(results.every((r) => r.status === 'rejected')).toBe(true);
		expect(navigate).toHaveBeenCalledTimes(1);
		expect(navigate).toHaveBeenCalledWith('/login?redirect=%2Flibrary%3Fquery%3Da%2520b&expired=1');
	});

	it('인증 API의 401은 이동하지 않는다(로그인 실패를 화면이 보여준다)', async () => {
		const { api, navigate } = setup(() => json(401, { error: { code: 'invalid_credentials', message: '' } }));
		await expect(api('/api/auth/login', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError);
		expect(navigate).not.toHaveBeenCalled();
	});

	it('loginUrl은 경로와 쿼리를 인코딩한다', () => {
		expect(loginUrl(new URL('http://x/library'))).toBe('/login?redirect=%2Flibrary');
	});
});

describe('오류 문구', () => {
	// 서버가 실제로 내는 코드: 표준 오류 + 라우트가 만드는 오류(errorResponse 호출)
	const serverCodes = (() => {
		const codes = new Set<string>();
		const errors = readFileSync('src/lib/server/errors.ts', 'utf8');
		for (const m of errors.matchAll(/^\t([a-z_]+): \{ status/gm)) codes.add(m[1]);
		for (const m of errors.matchAll(/errorResponse\(\d+, '([a-z_]+)'/g)) codes.add(m[1]);
		return codes;
	})();

	it('과제가 정한 코드를 모두 가진다', () => {
		const required = [
			'invalid_credentials', 'pending_approval', 'too_many_attempts', 'email_taken', 'invalid_request',
			'unauthenticated', 'zotero_not_connected', 'paper_not_found', 'forbidden_origin', 'not_found',
			'method_not_allowed', 'internal_error'
		];
		expect(required.filter((code) => !MESSAGES[code])).toEqual([]);
	});

	it('openapi.yaml의 오류 예시 코드를 모두 가진다', () => {
		const doc = readFileSync('docs/api/openapi.yaml', 'utf8');
		const codes = [...doc.matchAll(/\d{3} `([a-z_]+)`/g)].map((m) => m[1]);
		expect(codes.length).toBeGreaterThan(10);
		expect(codes.filter((code) => !MESSAGES[code])).toEqual([]);
	});

	it('errors.ts의 표준 오류 코드를 모두 가진다', () => {
		expect(serverCodes.size).toBeGreaterThanOrEqual(5);
		expect([...serverCodes].filter((code) => !MESSAGES[code])).toEqual([]);
	});

	it('모르는 코드는 서버 문구, 그것도 없으면 공통 문구', () => {
		expect(errorMessage(new ApiError(400, 'something_new', '서버 문구'))).toBe('서버 문구');
		expect(errorMessage(new ApiError(400, 'something_new', ''))).toBe(GENERIC_MESSAGE);
		expect(errorMessage(new Error('x'))).toBe(GENERIC_MESSAGE);
		expect(errorMessage(new ApiError(401, 'invalid_credentials', ''))).toBe('이메일 또는 비밀번호가 맞지 않습니다.');
	});
});

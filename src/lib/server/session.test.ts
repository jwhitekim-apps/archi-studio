import { AuthApiError, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSessionVerifier } from './session';
import { encodeSessionTokens } from './session-cookie';

const cookie = encodeSessionTokens({ accessToken: 'access-old', refreshToken: 'refresh-old' });

// getUser와 refreshSession만 가진 가짜 Supabase 클라이언트.
function fakeClient(opts: { getUser?: 'ok' | 'expired'; refresh?: 'ok' | 'rejected' }) {
	const getUser = vi.fn(async () =>
		opts.getUser === 'ok'
			? { data: { user: { id: 'user-1' } }, error: null }
			: { data: { user: null }, error: new AuthApiError('jwt expired', 401, 'bad_jwt') }
	);
	const refreshSession = vi.fn(async () =>
		opts.refresh === 'ok'
			? {
					data: {
						user: { id: 'user-2' },
						session: { access_token: 'access-new', refresh_token: 'refresh-new' }
					},
					error: null
				}
			: {
					data: { user: null, session: null },
					error: new AuthApiError('refresh token not found', 400, 'refresh_token_not_found')
				}
	);
	return { client: { auth: { getUser, refreshSession } } as unknown as SupabaseClient, getUser, refreshSession };
}

describe('1.3 매 요청 승인 확인 (createSessionVerifier)', () => {
	it('승인된 사용자: 사용자를 돌려주고 사용자 ID로 승인 여부를 한 번 조회한다', async () => {
		const { client } = fakeClient({ getUser: 'ok' });
		const isApproved = vi.fn(async () => true);
		const verify = createSessionVerifier(() => client, isApproved);
		expect(await verify(cookie)).toEqual({ user: { id: 'user-1' } });
		expect(isApproved).toHaveBeenCalledOnce();
		expect(isApproved).toHaveBeenCalledWith('user-1');
	});

	it('승인 행이 없거나 approved가 false면 null이다 (유효한 토큰이어도)', async () => {
		const { client } = fakeClient({ getUser: 'ok' });
		const verify = createSessionVerifier(() => client, async () => false);
		expect(await verify(cookie)).toBeNull();
	});

	it('갱신에 성공해도 갱신된 사용자가 미승인이면 null이고 새 토큰을 내보내지 않는다', async () => {
		const { client, refreshSession } = fakeClient({ getUser: 'expired', refresh: 'ok' });
		const isApproved = vi.fn(async () => false);
		const verify = createSessionVerifier(() => client, isApproved);
		expect(await verify(cookie)).toBeNull();
		expect(refreshSession).toHaveBeenCalledOnce();
		expect(isApproved).toHaveBeenCalledWith('user-2');
	});

	it('갱신된 사용자가 승인됐으면 renewedToken과 함께 돌려준다', async () => {
		const { client } = fakeClient({ getUser: 'expired', refresh: 'ok' });
		const verify = createSessionVerifier(() => client, async () => true);
		const result = await verify(cookie);
		expect(result?.user).toEqual({ id: 'user-2' });
		expect(result?.renewedToken).toBe(
			encodeSessionTokens({ accessToken: 'access-new', refreshToken: 'refresh-new' })
		);
	});

	it('승인 조회 오류는 인증 거부(null)가 아니라 예외다 (실패하면 닫힌다)', async () => {
		const { client } = fakeClient({ getUser: 'ok' });
		const verify = createSessionVerifier(() => client, async () => {
			throw new Error('db down');
		});
		await expect(verify(cookie)).rejects.toThrow('db down');
	});

	it('토큰이 거부된 경우에는 승인 조회를 하지 않는다', async () => {
		const { client } = fakeClient({ getUser: 'expired', refresh: 'rejected' });
		const isApproved = vi.fn(async () => true);
		const verify = createSessionVerifier(() => client, isApproved);
		expect(await verify(cookie)).toBeNull();
		expect(isApproved).not.toHaveBeenCalled();
	});

	it('깨진 쿠키 값은 Supabase도 승인 조회도 부르지 않고 null이다', async () => {
		const { client, getUser } = fakeClient({ getUser: 'ok' });
		const isApproved = vi.fn(async () => true);
		const verify = createSessionVerifier(() => client, isApproved);
		expect(await verify('not-a-session')).toBeNull();
		expect(getUser).not.toHaveBeenCalled();
		expect(isApproved).not.toHaveBeenCalled();
	});
});

// 로컬 Supabase(npm run db:start)가 떠 있어야 하는 통합 테스트. 실행: npm run test:auth
// 가드와 auth 라우트를 실제로 거치고, 승인 행 실패와 세션 폐기 확인만 서비스 함수를 직접 부른다.
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { login, signup, type AuthDeps } from './auth-service';
import { Browser } from './auth-harness';
import { createLoginAttempts } from './login-attempts';
import { decodeSessionTokens, encodeSessionTokens } from './session-cookie';
import { supabaseClientOptions as options } from './supabase-options';

const env = import.meta.env;
const url: string = env.SUPABASE_URL;
const anonKey: string = env.SUPABASE_ANON_KEY;
const serviceKey: string = env.SUPABASE_SERVICE_ROLE_KEY;

const anon = (): SupabaseClient => createClient(url, anonKey, options);
const admin = createClient(url, serviceKey, options);

const runId = Date.now();
const prefix = `auth-it-${runId}`;
const mkEmail = (name: string) => `${prefix}-${name}@example.test`;
const password = 'password-ok-1';
const SESSION_COOKIE = 'archi_session';

let n = 0;
const ips: string[] = [];
const freshIp = () => {
	const ip = `it-${runId}-${n++}`;
	ips.push(ip);
	return ip;
};

async function findUser(email: string) {
	const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
	if (error) throw error;
	return data.users.find((u) => u.email === email);
}

async function createUser(name: string, approved: boolean) {
	const email = mkEmail(name);
	const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
	if (error || !data.user) throw error ?? new Error('테스트 계정 생성 실패');
	const profile = await admin.from('archi_profiles').insert({ user_id: data.user.id, approved });
	if (profile.error) throw profile.error;
	return { id: data.user.id, email };
}

let approved: { id: string; email: string };
let pending: { id: string; email: string };

beforeAll(async () => {
	approved = await createUser('approved', true);
	pending = await createUser('pending', false);
});

afterAll(async () => {
	if (ips.length) await admin.from('archi_login_attempts').delete().in('ip', ips);
	const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
	for (const u of data?.users ?? []) {
		if (u.email?.startsWith(prefix)) await admin.auth.admin.deleteUser(u.id);
	}
});

describe('3.1 POST /api/auth/signup', () => {
	it('가입 성공: 201 pending_approval, 쿠키 없음, 승인 전 행이 하나', async () => {
		const email = mkEmail('signup-ok');
		const b = new Browser(freshIp());
		const res = await b.request('POST', '/api/auth/signup', { email, password });
		expect(res.status).toBe(201);
		expect(res.body).toEqual({ status: 'pending_approval' });
		expect(res.setCookies).toEqual([]);
		expect(b.jar.size).toBe(0);

		const user = await findUser(email);
		expect(user).toBeDefined();
		const { data, error } = await admin.from('archi_profiles').select('approved').eq('user_id', user!.id);
		expect(error).toBeNull();
		expect(data).toEqual([{ approved: false }]);
	});

	it('이미 있는 이메일: 409 email_taken', async () => {
		const res = await new Browser(freshIp()).request('POST', '/api/auth/signup', {
			email: approved.email,
			password
		});
		expect(res.status).toBe(409);
		expect(res.body).toMatchObject({ error: { code: 'email_taken' } });
	});

	it('8자 미만 비밀번호와 필드 누락: 400 invalid_request, 계정이 만들어지지 않는다', async () => {
		const email = mkEmail('signup-weak');
		const b = new Browser(freshIp());
		for (const body of [{ email, password: 'short12' }, { email }, { password }, {}]) {
			const res = await b.request('POST', '/api/auth/signup', body);
			expect(res.status).toBe(400);
			expect(res.body).toMatchObject({ error: { code: 'invalid_request' } });
		}
		expect(await findUser(email)).toBeUndefined();
	});

	it('승인 행 삽입이 실패하면 계정이 남지 않는다', async () => {
		const email = mkEmail('signup-rollback');
		const deps: AuthDeps = {
			anon,
			admin,
			insertProfile: async () => ({ error: new Error('강제 실패') })
		};
		await expect(signup(deps, { email, password })).rejects.toThrow('강제 실패');
		expect(await findUser(email)).toBeUndefined();
	});
});

describe('3.2 로그인 시도 제한', () => {
	it('같은 IP의 실패 5번 뒤 6번째는 429, 다른 IP는 영향 없다', async () => {
		const ip = freshIp();
		const b = new Browser(ip);
		for (let i = 0; i < 5; i++) {
			const res = await b.request('POST', '/api/auth/login', { email: approved.email, password: 'wrong-pass-1' });
			expect(res.status).toBe(401);
		}
		// 올바른 비밀번호여도 제한이 먼저다.
		const sixth = await b.request('POST', '/api/auth/login', { email: approved.email, password });
		expect(sixth.status).toBe(429);
		expect(sixth.body).toMatchObject({ error: { code: 'too_many_attempts' } });
		expect(sixth.setCookies).toEqual([]);

		const other = await new Browser(freshIp()).request('POST', '/api/auth/login', {
			email: approved.email,
			password
		});
		expect(other.status).toBe(200);
	});

	it('서버 재시작을 흉내 내도(새 인스턴스) 제한이 유지된다', async () => {
		const ip = freshIp();
		const before = new Browser(ip);
		for (let i = 0; i < 5; i++) {
			await before.request('POST', '/api/auth/login', { email: approved.email, password: 'wrong-pass-1' });
		}
		const afterRestart = new Browser(ip);
		const res = await afterRestart.request('POST', '/api/auth/login', { email: approved.email, password });
		expect(res.status).toBe(429);
		expect(await createLoginAttempts(admin).isLimited(ip)).toBe(true);
	});

	it('예약할 때 24시간 지난 행이 지워진다', async () => {
		const ip = freshIp();
		const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
		const seeded = await admin.from('archi_login_attempts').insert({ ip, attempted_at: old });
		expect(seeded.error).toBeNull();

		const id = await createLoginAttempts(admin).reserve(ip);
		expect(id).not.toBeNull();

		const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
		const stale = await admin
			.from('archi_login_attempts')
			.select('id', { count: 'exact', head: true })
			.eq('ip', ip)
			.lt('attempted_at', cutoff);
		expect(stale.count).toBe(0);
		const fresh = await admin
			.from('archi_login_attempts')
			.select('id', { count: 'exact', head: true })
			.eq('ip', ip);
		expect(fresh.count).toBe(1);
	});

	it('같은 IP의 틀린 로그인 8건이 동시에 와도 401은 5건, 나머지 3건은 429', async () => {
		const ip = freshIp();
		const results = await Promise.all(
			Array.from({ length: 8 }, () =>
				new Browser(ip).request('POST', '/api/auth/login', { email: approved.email, password: 'wrong-pass-1' })
			)
		);
		const statuses = results.map((r) => r.status).sort();
		expect(statuses.filter((s) => s === 401)).toHaveLength(5);
		expect(statuses.filter((s) => s === 429)).toHaveLength(3);
		const rows = await admin
			.from('archi_login_attempts')
			.select('id', { count: 'exact', head: true })
			.eq('ip', ip);
		expect(rows.count).toBe(5);
	});

	it('실패 4번 뒤 성공한 로그인은 횟수를 늘리지 않는다', async () => {
		const ip = freshIp();
		const b = new Browser(ip);
		for (let i = 0; i < 4; i++) {
			const res = await b.request('POST', '/api/auth/login', { email: approved.email, password: 'wrong-pass-1' });
			expect(res.status).toBe(401);
		}
		const ok = await b.request('POST', '/api/auth/login', { email: approved.email, password });
		expect(ok.status).toBe(200);
		const rows = await admin
			.from('archi_login_attempts')
			.select('id', { count: 'exact', head: true })
			.eq('ip', ip);
		expect(rows.count).toBe(4);
		// 성공이 자리를 먹지 않았으니 다섯 번째 실패는 아직 401이고, 그다음이 429다.
		const fifth = await b.request('POST', '/api/auth/login', { email: approved.email, password: 'wrong-pass-1' });
		expect(fifth.status).toBe(401);
		const sixth = await b.request('POST', '/api/auth/login', { email: approved.email, password });
		expect(sixth.status).toBe(429);
	});

	it('release는 예약 행을 지운다', async () => {
		const ip = freshIp();
		const attempts = createLoginAttempts(admin);
		const id = await attempts.reserve(ip);
		expect(id).not.toBeNull();
		await attempts.release(id as number);
		const rows = await admin
			.from('archi_login_attempts')
			.select('id', { count: 'exact', head: true })
			.eq('ip', ip);
		expect(rows.count).toBe(0);
	});
});

describe('3.3 POST /api/auth/login', () => {
	it('승인된 계정: 200과 사용자 정보, 속성이 맞는 세션 쿠키', async () => {
		const b = new Browser(freshIp());
		const res = await b.request('POST', '/api/auth/login', { email: approved.email, password });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ id: approved.id, email: approved.email, zoteroConnected: false });
		expect(res.setCookies).toHaveLength(1);
		const [cookie] = res.setCookies;
		expect(cookie.name).toBe(SESSION_COOKIE);
		expect(cookie.options).toMatchObject({
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: false,
			maxAge: 30 * 24 * 60 * 60
		});
		expect(decodeSessionTokens(cookie.value)).not.toBeNull();
	});

	it('https에서는 쿠키에 Secure가 붙는다', async () => {
		const b = new Browser(freshIp(), 'https://archi.example.test');
		const res = await b.request('POST', '/api/auth/login', { email: approved.email, password });
		expect(res.status).toBe(200);
		expect(res.setCookies[0].options.secure).toBe(true);
	});

	it('틀린 비밀번호와 없는 이메일은 같은 401 본문', async () => {
		const b = new Browser(freshIp());
		const wrongPassword = await b.request('POST', '/api/auth/login', {
			email: approved.email,
			password: 'wrong-pass-1'
		});
		const unknownEmail = await b.request('POST', '/api/auth/login', {
			email: mkEmail('does-not-exist'),
			password
		});
		expect(wrongPassword.status).toBe(401);
		expect(unknownEmail.status).toBe(401);
		expect(wrongPassword.body).toMatchObject({ error: { code: 'invalid_credentials' } });
		expect(unknownEmail.body).toEqual(wrongPassword.body);
		expect(b.jar.size).toBe(0);
	});

	it('필드 누락: 400 invalid_request', async () => {
		const res = await new Browser(freshIp()).request('POST', '/api/auth/login', { email: approved.email });
		expect(res.status).toBe(400);
		expect(res.body).toMatchObject({ error: { code: 'invalid_request' } });
	});

	it('미승인 계정: 403 pending_approval, 쿠키 없음, 방금 만든 세션이 폐기된다', async () => {
		const b = new Browser(freshIp());
		const res = await b.request('POST', '/api/auth/login', { email: pending.email, password });
		expect(res.status).toBe(403);
		expect(res.body).toMatchObject({ error: { code: 'pending_approval' } });
		expect(res.setCookies).toEqual([]);
		expect(b.jar.size).toBe(0);

		// 서비스 함수를 직접 불러 방금 발급된 세션을 붙잡고, 폐기됐는지 확인한다.
		let captured: Session | undefined;
		const capturing = (): SupabaseClient => {
			const client = anon();
			const original = client.auth.signInWithPassword.bind(client.auth);
			client.auth.signInWithPassword = (async (credentials: Parameters<typeof original>[0]) => {
				const result = await original(credentials);
				if (result.data.session) captured = result.data.session;
				return result;
			}) as typeof client.auth.signInWithPassword;
			return client;
		};
		const direct = await login({ anon: capturing, admin }, { email: pending.email, password }, freshIp());
		expect(direct.response.status).toBe(403);
		expect(direct.tokens).toBeUndefined();
		expect(captured).toBeDefined();
		expect((await anon().auth.getUser(captured!.access_token)).error).not.toBeNull();
		expect((await anon().auth.refreshSession({ refresh_token: captured!.refresh_token })).error).not.toBeNull();
	});

	it('미승인 403은 실패 횟수에 넣지 않는다', async () => {
		const ip = freshIp();
		const b = new Browser(ip);
		for (let i = 0; i < 6; i++) {
			const res = await b.request('POST', '/api/auth/login', { email: pending.email, password });
			expect(res.status).toBe(403);
		}
		expect(await createLoginAttempts(admin).isLimited(ip)).toBe(false);
	});
});

describe('3.4 POST /api/auth/logout', () => {
	it('204와 쿠키 삭제, 같은 쿠키로 보낸 me는 401', async () => {
		const b = new Browser(freshIp());
		await b.request('POST', '/api/auth/login', { email: approved.email, password });
		const oldCookie = b.cookie(SESSION_COOKIE);
		expect(oldCookie).toBeDefined();

		const res = await b.request('POST', '/api/auth/logout');
		expect(res.status).toBe(204);
		expect(res.deleted).toContain(SESSION_COOKIE);
		expect(b.jar.size).toBe(0);

		const replay = new Browser(freshIp());
		replay.jar.set(SESSION_COOKIE, oldCookie!);
		const me = await replay.request('GET', '/api/auth/me');
		expect(me.status).toBe(401);
		expect(me.body).toMatchObject({ error: { code: 'unauthenticated' } });
	});

	it('세션 없이 로그아웃하면 401', async () => {
		const res = await new Browser(freshIp()).request('POST', '/api/auth/logout');
		expect(res.status).toBe(401);
	});
});

describe('3.5 GET /api/auth/me', () => {
	it('유효 세션: 200과 사용자 정보, zoteroConnected는 folio_users의 키 유무', async () => {
		const b = new Browser(freshIp());
		await b.request('POST', '/api/auth/login', { email: approved.email, password });

		const without = await b.request('GET', '/api/auth/me');
		expect(without.status).toBe(200);
		expect(without.body).toEqual({ id: approved.id, email: approved.email, zoteroConnected: false });

		const linked = await admin.from('folio_users').insert({ id: approved.id, zotero_api_key: 'test-key' });
		expect(linked.error).toBeNull();
		try {
			const withKey = await b.request('GET', '/api/auth/me');
			expect(withKey.body).toEqual({ id: approved.id, email: approved.email, zoteroConnected: true });
		} finally {
			await admin.from('folio_users').delete().eq('id', approved.id);
		}
	});

	it('세션 없음: 401 unauthenticated', async () => {
		const res = await new Browser(freshIp()).request('GET', '/api/auth/me');
		expect(res.status).toBe(401);
		expect(res.body).toMatchObject({ error: { code: 'unauthenticated' } });
	});
});

describe('1.4 직접 발급받은 Supabase 토큰과 승인 확인', () => {
	it('미승인 계정이 직접 받은 토큰은 401, 승인하면 200, 승인을 취소하면 다음 요청부터 401', async () => {
		const direct = await createUser('direct-token', false);
		// 앱의 로그인(403 pending_approval)을 거치지 않고 Supabase 비밀번호 로그인으로 토큰 쌍을 받는다.
		const { data, error } = await anon().auth.signInWithPassword({ email: direct.email, password });
		if (error || !data.session) throw error ?? new Error('세션 없음');
		const b = new Browser(freshIp());
		b.jar.set(
			SESSION_COOKIE,
			encodeSessionTokens({ accessToken: data.session.access_token, refreshToken: data.session.refresh_token })
		);

		const setApproved = async (value: boolean) => {
			const res = await admin.from('archi_profiles').update({ approved: value }).eq('user_id', direct.id);
			expect(res.error).toBeNull();
		};

		const before = await b.request('GET', '/api/auth/me');
		expect(before.status).toBe(401);
		expect(before.body).toMatchObject({ error: { code: 'unauthenticated' } });

		await setApproved(true);
		const approvedRes = await b.request('GET', '/api/auth/me');
		expect(approvedRes.status).toBe(200);
		expect(approvedRes.body).toMatchObject({ id: direct.id, email: direct.email });

		await setApproved(false);
		const revoked = await b.request('GET', '/api/auth/me');
		expect(revoked.status).toBe(401);
		expect(revoked.body).toMatchObject({ error: { code: 'unauthenticated' } });
	});

	it('승인 행이 없는 계정의 토큰도 401', async () => {
		const email = mkEmail('no-profile');
		const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
		if (created.error || !created.data.user) throw created.error ?? new Error('테스트 계정 생성 실패');
		const { data, error } = await anon().auth.signInWithPassword({ email, password });
		if (error || !data.session) throw error ?? new Error('세션 없음');
		const b = new Browser(freshIp());
		b.jar.set(
			SESSION_COOKIE,
			encodeSessionTokens({ accessToken: data.session.access_token, refreshToken: data.session.refresh_token })
		);
		const res = await b.request('GET', '/api/auth/me');
		expect(res.status).toBe(401);
	});
});

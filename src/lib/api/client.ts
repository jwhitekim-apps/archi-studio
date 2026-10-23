// 화면에서 /api를 부르는 얇은 fetch 래퍼(design 결정 3).
// 2xx가 아니면 ApiError를 던지고, 401이면 인증 API가 아닌 한 로그인 화면으로 한 번만 보낸다.
import { redirect } from '@sveltejs/kit';
import type { ErrorBody } from './types';

export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string
	) {
		super(message);
		this.name = 'ApiError';
	}
}

// 응답이 공통 오류 형식이 아닐 때 상태 코드로 정하는 대체 코드
export function fallbackCode(status: number): string {
	if (status === 0) return 'network_error';
	if (status >= 500) return 'internal_error';
	const known: Record<number, string> = {
		400: 'invalid_request',
		401: 'unauthenticated',
		403: 'forbidden',
		404: 'not_found',
		405: 'method_not_allowed',
		409: 'conflict',
		413: 'payload_too_large',
		429: 'too_many_attempts'
	};
	return known[status] ?? `http_${status}`;
}

function isErrorBody(value: unknown): value is ErrorBody {
	const error = (value as ErrorBody | null)?.error;
	return typeof error?.code === 'string' && typeof error.message === 'string';
}

export async function toApiError(response: Response): Promise<ApiError> {
	let body: unknown = null;
	try {
		body = await response.json();
	} catch {
		// JSON이 아닌 응답(프록시 오류 화면 등)
	}
	if (isErrorBody(body)) return new ApiError(response.status, body.error.code, body.error.message);
	return new ApiError(response.status, fallbackCode(response.status), '');
}

export function loginUrl(current: URL, expired = false): string {
	const params = new URLSearchParams({ redirect: current.pathname + current.search });
	if (expired) params.set('expired', '1');
	return `/login?${params}`;
}

export interface ApiOptions {
	method?: string;
	body?: unknown;
	signal?: AbortSignal;
	// SvelteKit load 함수의 fetch를 넘기면 서버 렌더링 중에도 쿠키가 전달된다
	fetch?: typeof fetch;
	// 지금 주소. 401일 때 돌아올 주소로 쓴다. 없으면 브라우저 주소
	url?: URL;
	// false면 401에도 로그인 화면으로 보내지 않는다(입력을 지켜야 하는 번역·분석 화면)
	redirectOn401?: boolean;
}

export interface ApiClientDeps {
	fetch: () => typeof fetch;
	// 브라우저에서 401일 때 로그인 화면으로 보내는 방법. 없으면(서버) redirect를 던진다
	navigate?: (href: string) => void;
	currentUrl?: () => URL | undefined;
}

export function createApiClient(deps: ApiClientDeps) {
	let redirecting = false;

	function onUnauthenticated(url: URL | undefined): never | void {
		const href = url ? loginUrl(url, true) : '/login?expired=1';
		if (!deps.navigate) redirect(303, href);
		if (redirecting) return;
		redirecting = true;
		deps.navigate(href);
	}

	return async function apiFetch<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
		const headers: Record<string, string> = { accept: 'application/json' };
		if (options.body !== undefined) headers['content-type'] = 'application/json';
		let response: Response;
		try {
			response = await (options.fetch ?? deps.fetch())(path, {
				method: options.method ?? 'GET',
				headers,
				body: options.body === undefined ? undefined : JSON.stringify(options.body),
				signal: options.signal
			});
		} catch (cause) {
			if ((cause as Error)?.name === 'AbortError') throw cause;
			throw new ApiError(0, 'network_error', '');
		}
		if (response.ok) {
			if (response.status === 204) return undefined as T;
			const text = await response.text();
			return (text ? JSON.parse(text) : undefined) as T;
		}
		const error = await toApiError(response);
		if (error.status === 401 && options.redirectOn401 !== false && !path.startsWith('/api/auth/')) {
			onUnauthenticated(options.url ?? deps.currentUrl?.());
		}
		throw error;
	};
}

const browser = typeof window !== 'undefined';

export const apiFetch = createApiClient({
	fetch: () => fetch,
	navigate: browser ? (href) => window.location.assign(href) : undefined,
	currentUrl: () => (browser ? new URL(window.location.href) : undefined)
});

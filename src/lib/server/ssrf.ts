// 사용자가 준 URL로 서버가 직접 접속할 때의 SSRF 방어(폴리오 방식을 옮김).
// 호스트가 사설망·루프백·링크 로컬 주소로 해석되면 거부한다. 실제 소켓이 붙는 주소가 검증을 통과한 주소가
// 되도록 lookup을 감싸서 DNS rebinding(검증과 접속 사이에 IP가 바뀌는 것)도 막는다.
// 리다이렉트는 자동으로 따라가지 않고 한 번 이동할 때마다 같은 검사를 다시 한다.
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

export const SSRF_MAX_REDIRECTS = 5;
export const SSRF_MAX_BYTES = 1024 * 1024; // 1MB. 제목은 <head>에 있어 이 정도면 충분하다.
export const SSRF_TIMEOUT_MS = 5000;

export class BlockedAddressError extends Error {
	constructor(message = '내부망 또는 사설 주소입니다.') {
		super(message);
		this.name = 'BlockedAddressError';
	}
}

function isBlockedIpv4(ip: string): boolean {
	const p = ip.split('.').map(Number);
	if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
	const [a, b] = p;
	if (a === 0) return true; // 0.0.0.0/8
	if (a === 10) return true; // 사설
	if (a === 127) return true; // 루프백
	if (a === 169 && b === 254) return true; // 링크 로컬(클라우드 메타데이터)
	if (a === 172 && b >= 16 && b <= 31) return true; // 사설
	if (a === 192 && b === 168) return true; // 사설
	if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
	return false;
}

export function isBlockedIp(ip: string): boolean {
	const family = net.isIP(ip);
	if (family === 4) return isBlockedIpv4(ip);
	if (family === 6) {
		const lower = ip.toLowerCase();
		// IPv4 매핑(::ffff:a.b.c.d)은 안쪽 주소로 판정한다.
		const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
		if (mapped) return isBlockedIpv4(mapped[1]);
		// URL 파서는 ::ffff:127.0.0.1을 ::ffff:7f00:1 꼴로 바꿔 돌려준다. 같은 주소이므로 v4로 풀어 판정한다.
		const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
		if (mappedHex) {
			const hi = parseInt(mappedHex[1], 16);
			const lo = parseInt(mappedHex[2], 16);
			return isBlockedIpv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
		}
		if (lower === '::1' || lower === '::') return true;
		if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7
		if (/^fe[89ab]/.test(lower)) return true; // fe80::/10
		return false;
	}
	return true; // IP 형식이 아니면 막는 쪽으로
}

export interface SsrfOptions {
	maxRedirects?: number;
	maxBytes?: number;
	timeoutMs?: number;
	// 시험에서만 바꾼다.
	resolve?: (hostname: string) => Promise<{ address: string; family: number }[]>;
	isBlocked?: (ip: string) => boolean;
}

const defaultResolve = (hostname: string) => dns.promises.lookup(hostname, { all: true });

async function pickAddress(hostname: string, opts: SsrfOptions): Promise<{ address: string; family: number }> {
	// URL의 [::1] 표기는 대괄호를 벗겨 IP로 본다.
	const host = hostname.replace(/^\[|\]$/g, '');
	const isBlocked = opts.isBlocked ?? isBlockedIp;
	const list = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await (opts.resolve ?? defaultResolve)(host);
	const ok = list.find((a) => !isBlocked(a.address));
	if (!ok) throw new BlockedAddressError();
	return ok;
}

// 사용자가 준 URL이 내부망으로 해석되는지 미리 검사한다(라우트의 400 응답용).
export async function assertPublicUrl(url: string, opts: SsrfOptions = {}): Promise<void> {
	await pickAddress(new URL(url).hostname, opts);
}

function get(urlStr: string, redirectsLeft: number, opts: SsrfOptions): Promise<string | null> {
	return new Promise((resolve, reject) => {
		let url: URL;
		try {
			url = new URL(urlStr);
		} catch {
			reject(new Error('URL을 해석할 수 없습니다.'));
			return;
		}
		if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			reject(new BlockedAddressError('http와 https만 허용됩니다.'));
			return;
		}
		pickAddress(url.hostname, opts).then(({ address, family }) => {
			const lib = url.protocol === 'https:' ? https : http;
			const maxBytes = opts.maxBytes ?? SSRF_MAX_BYTES;
			const req = lib.get(
				url,
				{
					// 검증을 통과한 바로 그 주소로만 접속한다.
					lookup: (_host, options, cb) => {
						// Node가 all: true로 부르면 배열을, 아니면 주소와 family를 기대한다.
						if (typeof options === 'object' && options.all) {
							(cb as unknown as (e: null, list: { address: string; family: number }[]) => void)(null, [{ address, family }]);
						} else {
							(cb as unknown as (e: null, a: string, f: number) => void)(null, address, family);
						}
					},
					headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ArchiStudio/1.0)' },
					timeout: opts.timeoutMs ?? SSRF_TIMEOUT_MS
				},
				(res) => {
					const status = res.statusCode ?? 0;
					if (status >= 300 && status < 400 && res.headers.location) {
						res.resume();
						if (redirectsLeft <= 0) {
							reject(new Error('리다이렉트가 너무 많습니다.'));
							return;
						}
						resolve(get(new URL(res.headers.location, url).toString(), redirectsLeft - 1, opts));
						return;
					}
					if (status < 200 || status >= 300) {
						res.resume();
						resolve(null);
						return;
					}
					let size = 0;
					const chunks: Buffer[] = [];
					res.on('data', (chunk: Buffer) => {
						chunks.push(chunk);
						size += chunk.length;
						if (size > maxBytes) {
							res.destroy();
							resolve(Buffer.concat(chunks).subarray(0, maxBytes).toString('utf8'));
						}
					});
					res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
					res.on('error', reject);
				}
			);
			req.on('timeout', () => req.destroy(new Error('요청 시간이 초과되었습니다.')));
			req.on('error', reject);
		}, reject);
	});
}

// 응답 본문(최대 maxBytes)을 문자열로 받는다. 2xx가 아니면 null이다.
export function safeGetText(url: string, opts: SsrfOptions = {}): Promise<string | null> {
	return get(url, opts.maxRedirects ?? SSRF_MAX_REDIRECTS, opts);
}

// 페이지 <title>. 어떤 이유로든 못 읽으면 null이다(사설 주소 거부 포함).
export async function fetchPageTitle(url: string, opts: SsrfOptions = {}): Promise<string | null> {
	try {
		const html = await safeGetText(url, opts);
		const match = html?.match(/<title[^>]*>([^<]*)<\/title>/i);
		return match ? match[1].trim().replace(/\s+/g, ' ') || null : null;
	} catch {
		return null;
	}
}

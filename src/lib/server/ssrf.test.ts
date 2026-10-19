import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertPublicUrl, BlockedAddressError, fetchPageTitle, isBlockedIp, safeGetText } from './ssrf';

describe('사설 주소 거부', () => {
	it.each([
		'http://127.0.0.1',
		'http://localhost',
		'http://10.0.0.1',
		'http://169.254.169.254/latest/meta-data',
		'http://[::1]/',
		'http://[::ffff:127.0.0.1]/',
		'http://192.168.0.5',
		'http://172.16.0.1',
		'http://0.0.0.0'
	])('%s는 거부된다', async (url) => {
		await expect(assertPublicUrl(url)).rejects.toBeInstanceOf(BlockedAddressError);
		await expect(safeGetText(url)).rejects.toBeInstanceOf(BlockedAddressError);
		expect(await fetchPageTitle(url)).toBeNull();
	});

	it('공개 주소는 통과하고 IP 형식이 아니면 막는다', () => {
		expect(isBlockedIp('93.184.216.34')).toBe(false);
		expect(isBlockedIp('2606:2800:220:1:248:1893:25c8:1946')).toBe(false);
		expect(isBlockedIp('not-an-ip')).toBe(true);
	});

	it('http와 https가 아닌 스킴은 거부된다', async () => {
		await expect(safeGetText('ftp://example.com/x')).rejects.toBeInstanceOf(BlockedAddressError);
	});
});

// 시험용 웹 서버는 루프백에 있다. 이름 → 주소를 시험이 정하고, 그 서버 주소만 공개로 본다.
describe('리다이렉트, 크기, 시간 제한', () => {
	let server: Server;
	let port: number;
	const hits: string[] = [];
	const resolveNames = async (host: string) => {
		if (host === 'private.test') return [{ address: '10.0.0.5', family: 4 }];
		return [{ address: '127.0.0.1', family: 4 }];
	};
	const opts = () => ({ resolve: resolveNames, isBlocked: (ip: string) => ip !== '127.0.0.1' && isBlockedIp(ip) });

	beforeAll(async () => {
		server = createServer((req, res) => {
			hits.push(req.url ?? '');
			if (req.url === '/title') {
				res.end('<html><head><title>  Hello \n World | Site </title></head></html>');
			} else if (req.url === '/to-private') {
				res.writeHead(302, { location: 'http://private.test/secret' }).end();
			} else if (req.url === '/loop') {
				res.writeHead(302, { location: '/loop' }).end();
			} else if (req.url === '/big') {
				res.end('x'.repeat(3 * 1024 * 1024));
			} else if (req.url === '/slow') {
				setTimeout(() => res.end('late'), 500);
			} else if (req.url === '/missing') {
				res.writeHead(404).end('nope');
			} else {
				res.end('ok');
			}
		});
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
		port = (server.address() as AddressInfo).port;
	});
	afterAll(() => new Promise<void>((r) => server.close(() => r())));

	const url = (path: string) => `http://public.test:${port}${path}`;

	it('<title>을 읽고 공백을 정리한다', async () => {
		expect(await fetchPageTitle(url('/title'), opts())).toBe('Hello World | Site');
	});

	it('공개 주소가 사설 주소로 리다이렉트하면 이동 시점에 거부되고 사설 주소로는 접속하지 않는다', async () => {
		await expect(safeGetText(url('/to-private'), opts())).rejects.toBeInstanceOf(BlockedAddressError);
		expect(hits).not.toContain('/secret');
		expect(await fetchPageTitle(url('/to-private'), opts())).toBeNull();
	});

	it('리다이렉트가 최대 횟수를 넘으면 중단된다', async () => {
		const before = hits.filter((h) => h === '/loop').length;
		await expect(safeGetText(url('/loop'), { ...opts(), maxRedirects: 3 })).rejects.toThrow(/리다이렉트/);
		expect(hits.filter((h) => h === '/loop').length - before).toBe(4);
	});

	it('응답 본문은 1MB에서 끊긴다', async () => {
		const body = await safeGetText(url('/big'), opts());
		expect(body).not.toBeNull();
		expect(body!.length).toBeLessThanOrEqual(1024 * 1024);
		expect(body!.length).toBeGreaterThan(1000);
	});

	it('2xx가 아니면 null, 시간이 넘으면 오류', async () => {
		expect(await safeGetText(url('/missing'), opts())).toBeNull();
		await expect(safeGetText(url('/slow'), { ...opts(), timeoutMs: 100 })).rejects.toThrow();
	});
});

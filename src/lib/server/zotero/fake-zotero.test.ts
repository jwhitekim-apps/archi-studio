import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startFakeZotero, type FakeZotero } from './fake-zotero';

let z: FakeZotero;
beforeEach(async () => {
	z = await startFakeZotero({ pageSize: 100 });
});
afterEach(() => z.close());

const get = (path: string) => fetch(`${z.url}${path}`, { headers: { 'Zotero-API-Key': z.apiKey } });

describe('가짜 Zotero 서버', () => {
	it('항목 250개가 페이지 3개로 나뉘고 Link 헤더를 따라가면 모두 모인다', async () => {
		for (let i = 0; i < 250; i++) z.addItem({ title: `t${i}` });
		let url: string | null = `/users/${z.userId}/items/top?since=0&limit=100`;
		let pages = 0;
		let total = 0;
		while (url) {
			const res: Response = await get(url);
			total += ((await res.json()) as unknown[]).length;
			pages++;
			const m = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('Link') ?? '');
			url = m ? m[1].replace(z.url, '') : null;
		}
		expect(pages).toBe(3);
		expect(total).toBe(250);
	});

	it('since보다 버전이 높은 항목만 돌려주고 Last-Modified-Version을 싣는다', async () => {
		z.addItem({ title: 'a' });
		const b = z.addItem({ title: 'b' });
		const res = await get(`/users/${z.userId}/items/top?since=${b.version - 1}`);
		const body = (await res.json()) as FakeZoteroItem[];
		expect(body.map((i) => i.key)).toEqual([b.key]);
		expect(res.headers.get('Last-Modified-Version')).toBe(String(z.version));
	});

	it('삭제 목록, 자식, 첨부 변경, 키 검사를 흉내 낸다', async () => {
		const a = z.addItem({ title: 'a' });
		z.addChild(a.key, { itemType: 'attachment', contentType: 'application/pdf' });
		z.removeItem(z.addItem({ title: 'gone' }).key);
		const del = await (await get(`/users/${z.userId}/deleted?since=0`)).json();
		expect(del.items).toHaveLength(1);
		const kids = await (await get(`/users/${z.userId}/items/${a.key}/children`)).json();
		expect(kids).toHaveLength(1);
		const atts = await (await get(`/users/${z.userId}/items?itemType=attachment&since=0`)).json();
		expect(atts[0].data.parentItem).toBe(a.key);
		expect((await fetch(`${z.url}/users/${z.userId}/items/top`)).status).toBe(403);
	});
});

interface FakeZoteroItem {
	key: string;
}

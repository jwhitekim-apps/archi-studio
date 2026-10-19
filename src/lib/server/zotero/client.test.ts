import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	fetchChangedAttachmentParentKeys,
	fetchChangedTopItems,
	fetchChildren,
	fetchCollections,
	fetchDeletedItemKeys,
	ZoteroUnavailableError,
	type ZoteroApi
} from './client';
import { startFakeZotero, type FakeZotero } from './fake-zotero';

let z: FakeZotero;
let api: ZoteroApi;
beforeEach(async () => {
	z = await startFakeZotero({ pageSize: 100 });
	api = { baseUrl: z.url, userId: z.userId, apiKey: z.apiKey };
});
afterEach(() => z.close());

describe('zotero client', () => {
	it('항목 200개가 페이지 3개로 나뉘어도 모두 모이고 새 버전을 돌려준다', async () => {
		await z.close();
		z = await startFakeZotero({ pageSize: 80 });
		api = { baseUrl: z.url, userId: z.userId, apiKey: z.apiKey };
		for (let i = 0; i < 200; i++) z.addItem({ title: `t${i}` });
		const { items, newVersion } = await fetchChangedTopItems(api, 0);
		expect(items).toHaveLength(200);
		expect(newVersion).toBe(z.version);
		expect(z.calls.filter((c) => c.endsWith('/items/top'))).toHaveLength(3);
	});

	it('since 이후만 가져오고 새 버전은 이전보다 작아지지 않는다', async () => {
		z.addItem({ title: 'a' });
		const { items, newVersion } = await fetchChangedTopItems(api, z.version + 10);
		expect(items).toEqual([]);
		expect(newVersion).toBe(z.version + 10);
	});

	it('삭제 키, 첨부 부모 키, 자식, 컬렉션을 가져온다', async () => {
		const a = z.addItem({ title: 'a' });
		z.addChild(a.key, { itemType: 'attachment', contentType: 'application/pdf' });
		z.removeItem(z.addItem({ title: 'gone' }).key);
		z.addCollection('COL1', 'Col');
		expect(await fetchDeletedItemKeys(api, 0)).toHaveLength(1);
		expect(await fetchChangedAttachmentParentKeys(api, 0)).toEqual([a.key]);
		expect(await fetchChildren(api, a.key)).toHaveLength(1);
		expect((await fetchCollections(api)).map((c) => c.key)).toEqual(['COL1']);
	});

	it.each([401, 403, 500])('%i 응답은 키와 응답 원문 없는 ZoteroUnavailableError가 된다', async (status) => {
		z.failStatus = status;
		const err = await fetchChangedTopItems(api, 0).catch((e) => e);
		expect(err).toBeInstanceOf(ZoteroUnavailableError);
		expect(err.status).toBe(status);
		expect(err.message).not.toContain(z.apiKey);
		expect(err.message).not.toContain('upstream failure body');
	});

	it('연결할 수 없으면 status null의 ZoteroUnavailableError', async () => {
		const err = await fetchChangedTopItems({ ...api, baseUrl: 'http://127.0.0.1:1' }, 0).catch((e) => e);
		expect(err).toBeInstanceOf(ZoteroUnavailableError);
		expect(err.status).toBeNull();
	});
});

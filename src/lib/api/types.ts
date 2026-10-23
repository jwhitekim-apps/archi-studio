// 화면이 쓰는 API 응답 타입. docs/api/openapi.yaml의 components.schemas를 손으로 옮겼다(코드 생성 도구는 쓰지 않는다).

export interface User {
	id: string;
	email: string;
	zoteroConnected: boolean;
}

export interface ZoteroStatus {
	connected: boolean;
	zoteroUsername?: string;
	lastSyncedAt?: string | null;
}

export interface SyncResult {
	added: number;
	updated: number;
	removed: number;
	syncedAt: string;
}

export interface PaperListItem {
	id: string;
	title: string;
	authors: string[];
	year: number | null;
	collections: string[];
	hasPdf: boolean;
	hasMemo: boolean;
}

export interface PaperList {
	items: PaperListItem[];
	nextCursor: string | null;
}

export interface PaperDetail extends PaperListItem {
	itemKey: string | null;
	s2PaperId: string | null;
	attachment: { type: 'pdf' | 'html' | null };
	translationCount: number;
	analysisCount: number;
}

export interface Collection {
	key: string;
	name: string;
	parentKey: string | null;
	paperCount: number;
}

export interface ErrorBody {
	error: { code: string; message: string };
}

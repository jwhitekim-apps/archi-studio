# 기존 경로 → 새 경로 대응표

폴리오(Express)와 벨루(FastAPI)의 기존 경로가 Archi Studio에서 어디로 가는지 정리한다.
새 경로는 `openspec/changes/archi-studio-api-spec`의 specs와 design.md에 있는 것만 쓴다.
기존 경로와의 호환은 제공하지 않는다(proposal.md). "뺌"은 이번 명세 범위 밖이라는 뜻이다.

## 1. 폴리오 (`zotero-folio/server/server.js`)

`/api/*`의 고유 경로 16개와 `/oauth/*` 1개, 모두 17개 그룹이다. 같은 경로의 메서드는 한 줄로 묶었다.

| # | 기존 경로 | 새 경로 | 비고 |
|---|---|---|---|
| 1 | `GET /oauth/login`, `GET /oauth/callback` | `GET /api/zotero/connect`, `GET /api/zotero/callback` | 로그인이 아니라 Zotero "연결"로 분리 |
| 2 | `GET /api/auth/status` | `GET /api/auth/me` | 응답에 `zoteroConnected` 포함 |
| 3 | `POST /api/auth/logout` | `POST /api/auth/logout` | 같음 |
| 4 | `POST /api/sync` | `POST /api/zotero/sync` | |
| 5 | `GET /api/papers` | `GET /api/papers` | `query`, `collection`, `limit`, `cursor` |
| 6 | `GET /api/papers/:key`, `DELETE /api/papers/:key` | `GET /api/papers/{id}`, `DELETE /api/papers/{id}` | `:key`(Zotero `item_key`)가 내부 UUID `{id}`로 바뀜 |
| 7 | `POST /api/papers/webpage` | `POST /api/papers/webpage` | 같음 |
| 8 | `PUT /api/papers/:key/memo` | `PUT /api/papers/{id}/memo` | 새로 `GET /api/papers/{id}/memo` 추가 |
| 9 | `GET /api/papers/:key/pdf` | `GET /api/papers/{id}/file` | PDF와 HTML을 한 경로로 합침 |
| 10 | `GET /api/papers/:key/html` | `GET /api/papers/{id}/file` | 위와 같음 |
| 11 | `POST /api/papers/:key/attachment` | 뺌 | 첨부 업로드는 스펙에 없음 |
| 12 | `GET`/`POST /api/papers/:key/highlights` | 뺌 | design.md Non-Goals |
| 13 | `DELETE /api/papers/:key/highlights/:annotationKey` | 뺌 | 위와 같음 |
| 14 | `GET`/`POST /api/papers/:key/ink` | 뺌 | design.md Non-Goals |
| 15 | `DELETE /api/papers/:key/ink/:annotationKey` | 뺌 | 위와 같음 |
| 16 | `GET /api/collections` | `GET /api/collections` | 같음 |
| 17 | `GET /api/collections/:key/papers` | `GET /api/papers?collection={key}` | 목록 API의 필터로 합침 |

대조 결과: `server.js`의 `/api` 라우트 19개(줄 468~955)와 `/oauth` 2개가 위 17개 그룹에 모두 들어 있다.
`app.use('/api', ...)` 두 줄(453, 483)은 인증 미들웨어라 경로가 아니며, 세션 쿠키 검사로 대체된다.

## 2. 벨루 (`veloo.2joon.com/server`)

`main.py`가 서브앱을 접두사로 마운트하므로 실제 경로는 접두사 + 경로다.

| # | 기존 경로 | 새 경로 | 비고 |
|---|---|---|---|
| 1 | `POST /register` | `POST /api/auth/signup` | 이메일 기반, 승인 전 상태로 생성 |
| 2 | `POST /login` | `POST /api/auth/login` | 사용자명 대신 이메일 |
| 3 | `DELETE /logout` | `POST /api/auth/logout` | 메서드가 바뀜 |
| 4 | `GET /api/me` | `GET /api/auth/me` | |
| 5 | `POST /paper/analyze`, `POST /paper/analyze-pdf` | `POST /api/papers/{id}/analysis` | `paper_id`/URL/PDF 입력이 논문 `{id}`로 통일됨 |
| 6 | `GET /paper/history` | `GET /api/papers/{id}/analysis` | 전체 이력 목록 경로는 스펙에 없고 논문별 조회로 대체 |
| 7 | `POST /paper/search` | 뺌 | Semantic Scholar 검색은 스펙에 없음 |
| 8 | `POST /translate/api/translate` | `POST /api/translate` | `text/plain` 스트리밍 유지, 선택 값 `paperId` 추가(없으면 논문과 무관하게 동작, 없는 id·남의 id는 404) |
| 9 | `GET /translate/api/history` | `GET /api/translate/history` | 선택 쿼리 `paperId`로 필터 |
| 10 | `POST /model-review/api/explain`, `POST /model-review/api/feedback`, `GET /model-review/api/history` | 뺌 | Model Review는 미룸 |
| 11 | `POST /contextor/api/lookup`, `GET /contextor/api/history` | 뺌 | Contextor는 미룸 |
| 12 | `GET /{path}` 캐치올, `/assets`, `/marketing` 정적 서빙 | 해당 없음 | SvelteKit이 맡음 |

참고: 프론트가 부르는 `/translate/api/naver-dict`(`web/src/features/translator/api.ts:29`)에 대응하는 서버 라우트는 찾지 못했다. 새 명세에도 없다.

## 3. 새로 생긴 경로 (기존에 대응이 없음)

- `GET /api/zotero/status`, `DELETE /api/zotero/connection`
- `GET /api/papers/{id}/memo`
- `GET /api/briefings`, `GET /api/briefings/{id}` (읽기 전용, 쓰기는 405)

# 브리핑 접점 계약 (비서 ↔ 앱)

비서(morning-desk)가 브리핑을 기록하고 Archi Studio 앱이 읽는 접점이다. 앱 change `archi-studio-briefing`이 이 문서를 만들고, 비서 change `briefing-store`가 그대로 따른다. 앱은 두 테이블에 쓰지 않는다(`src/lib/server/briefing-readonly.test.ts`가 고정).

## 테이블

정의: `supabase/migrations/20261018000500_briefings.sql`, 설명: `docs/api/data-model.md` 3.10.

`archi_briefings`

| 컬럼 | 타입 | 제약 | 누가 채우나 |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | DB |
| `user_id` | uuid | NN, FK `auth.users(id)` on delete cascade | 비서 |
| `date` | date | NN | 비서 |
| `summary` | text | NN | 비서 |
| `body` | text | NN | 비서 |
| `created_at` | timestamptz | NN, default `now()` | DB |

제약: unique `(user_id, date)`. 인덱스: `(user_id, date desc)`.

`archi_briefing_papers`

| 컬럼 | 타입 | 제약 |
|---|---|---|
| `briefing_id` | uuid | FK `archi_briefings(id)` on delete cascade |
| `paper_id` | uuid | FK `papers(id)` on delete cascade |

PK `(briefing_id, paper_id)`. 두 테이블 모두 RLS가 켜져 있고 정책이 없다. 비서와 앱 모두 서비스 키로 접속한다.

## 규칙

| 항목 | 값 |
|---|---|
| 기록하는 쪽 | 비서만, 서비스 키 |
| 한 건의 단위 | 사용자당 하루 한 건. 같은 날 다시 돌리면 비서가 `(user_id, date)` 기준으로 같은 행을 덮어쓴다(upsert) |
| `date` | 비서가 실행한 날짜, Asia/Seoul 기준 `YYYY-MM-DD` |
| `summary` | 목록에 보일 한 줄, 최대 200자. 비서가 만든다 |
| `body` | 비서가 카카오톡으로 보낸 조각(최대 3개)을 빈 줄 하나(`\n\n`)로 이은 일반 텍스트. 제목까지만 담는 개인정보 범위(메일 본문, 보낸 사람 제외)를 지킨다. 앱은 HTML로 해석하지 않고 글자로만 보여 준다 |
| 논문 연결 | 비서가 폴리오 구역의 `itemKey`(Zotero 항목 키)로 `papers`에서 `(user_id, item_key)`가 같은 행의 `id`를 찾아 `archi_briefing_papers`에 넣는다. 찾지 못하면 그 논문의 연결만 건너뛴다. 브리핑 기록은 실패하지 않는다 |
| 기록 대상 사용자 | 비서 환경 설정 `ARCHI_USER_ID`(앱 사용자 UUID 한 개). 비서는 1인용이다 |

## 앱이 읽는 방법

- `GET /api/briefings`: 본인 브리핑을 `date` 내림차순으로 `{ items: [{ id, date, summary }], nextCursor }`. `limit` 1~100(기본 30), `cursor`는 불투명 문자열.
- `GET /api/briefings/{id}`: `{ id, date, summary, body, paperIds }`. `paperIds`는 id 오름차순. 없는 브리핑, 남의 브리핑, UUID가 아닌 id는 모두 404 `briefing_not_found`.
- 논문이 삭제되면 연결 행이 연쇄 삭제되어 `paperIds`에서 빠진다.

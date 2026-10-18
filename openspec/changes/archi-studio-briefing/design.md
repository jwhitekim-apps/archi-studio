# Design

## Context

- 테이블 `archi_briefings`(브리핑 한 건, 사용자당 하루 한 건)와 `archi_briefing_papers`(브리핑이 언급한 논문 연결)는 이미 마이그레이션에 있다(`supabase/migrations/20261018000500_briefings.sql`, 설명은 `docs/api/data-model.md` 3.10). 두 테이블 모두 RLS(행 수준 접근 제한)가 켜져 있고 정책이 없어서, 서버가 서비스 키로 접속하고 `user_id`를 직접 걸러 쓴다. 다른 테이블과 같은 방식이다(`src/lib/server/supabase.ts`의 `createServiceClient`).
- 비서의 브리핑은 `buildReport`(`morning-desk/app/src/briefing/report.ts`)가 만드는 **여러 개의 문자열 조각**(카카오톡 한 통의 글자 수 제한 때문에 최대 3개)이다. 구역은 오늘 할 일, 마감, 메일·GitHub·폴리오(제목만), 집 서버 상태, 실패 같은 것이다. 이 내용은 이미 "제목까지만 카카오톡으로 보낸다"는 개인정보 범위를 지킨다.
- 폴리오 구역에는 논문의 `itemKey`(Zotero 항목 키)와 제목이 들어 있다. 앱의 `papers` 테이블은 `(user_id, item_key)`가 고유하므로 이 키로 논문을 찾을 수 있다.
- 오류는 `{ error: { code, message } }` 한 형식이고(`src/lib/server/errors.ts`), `/api` 요청은 `api-guard`가 먼저 로그인과 승인 여부를 확인한다. 라우트에 없는 메서드는 SvelteKit이 405로 거절하고 가드가 공통 형식으로 바꾼다.

## Goals / Non-Goals

**Goals:**
- 브리핑 목록과 상세를 본인 것만 읽기 전용으로 돌려준다.
- 비서와 앱의 접점을 한 문서로 고정해, 두 change를 따로 구현해도 맞물린다.
- 비서 없이 SQL 시험 데이터만으로 전부 검증할 수 있다.

**Non-Goals:**
- 브리핑 생성, 수정, 삭제, 재전송(비서 몫, 앱은 쓰지 않는다).
- 브리핑 검색, 읽음 표시, 보관 기간 정책.
- 본문을 구역별 구조(JSON)로 쪼개 돌려주는 것. 본문은 글자 그대로 돌려주고 화면이 보여 준다.

## Decisions

**1. 서비스 키로 읽되 `user_id`를 항상 조건에 넣는다.**
다른 테이블과 같은 방식이다. 대안인 "사용자 토큰 + RLS 정책"은 이 프로젝트가 정책을 쓰지 않기로 한 방침과 다르고, 정책을 새로 관리해야 한다. 대신 `user_id` 조건 누락을 막으려고 모든 조회 함수가 `userId`를 필수 인자로 받고, 통합 테스트가 "다른 사용자의 브리핑은 목록에 없고 상세는 404"를 확인한다.

**2. 목록은 날짜 기준 커서 페이지로 한다.**
`(user_id, date)`가 고유이므로 `date`만으로 순서가 정해진다. `cursor`는 마지막 항목의 날짜를 감싼 불투명한 문자열(base64url)이고, 서버는 `date < cursor`를 최신순으로 `limit + 1`개 읽어 다음 페이지가 있는지 판단한다. 대안인 offset 페이지는 새 브리핑이 쌓이면 중복·누락이 생긴다. 응답은 스펙대로 `{ items: [{ id, date, summary }], nextCursor }`이다.
- 스펙이 정하지 않은 세부(구현 선택, `openapi.yaml`에 적는다): `limit`은 1~100, 기본 30. 범위를 벗어나거나 숫자가 아니면 400 `invalid_request`. 읽을 수 없는 `cursor`도 400 `invalid_request`.

**3. 상세의 `paperIds`는 연결 테이블에서 읽고 id 오름차순으로 정렬한다.**
순서에 의미가 없어서 시험이 흔들리지 않게 정렬만 고정한다. 논문이 삭제되면 연결 행이 연쇄 삭제되어(`on delete cascade`) 목록에서 자연히 빠진다.
없는 브리핑, 다른 사용자의 브리핑, UUID 형식이 아닌 `id`는 모두 404 `briefing_not_found`로 같게 답한다(존재 여부를 숨긴다).

**4. 읽기 전용은 라우트 구조와 자동 검사 둘로 지킨다.**
라우트 파일에 `GET`만 두면 다른 메서드는 SvelteKit이 405로 거절한다(가드가 `Allow: GET`과 공통 오류 형식을 붙인다). 서비스 키는 DB가 쓰기를 막지 못하므로, 앱 소스에서 두 브리핑 테이블에 `insert/update/upsert/delete`를 호출하면 실패하는 단위 테스트를 둔다.

**5. 접점 계약은 `docs/dev/briefing-contract.md` 한 문서로 고정한다.**
이 문서를 앱 change(여기)가 만들고, 비서 change(`briefing-store`)가 그대로 따른다. 내용은 아래와 같다.

| 항목 | 값 |
|---|---|
| 테이블 | `archi_briefings`, `archi_briefing_papers` (`data-model.md` 3.10) |
| 기록하는 쪽 | 비서, 서비스 키 |
| 한 건의 단위 | 사용자당 하루 한 건(`unique (user_id, date)`). 같은 날 다시 돌리면 비서가 같은 행을 덮어쓴다(upsert) |
| `date` | 비서가 실행한 날짜(Asia/Seoul 기준 `YYYY-MM-DD`) |
| `summary` | 목록에 보일 한 줄(최대 200자). 비서가 만든다 |
| `body` | 비서가 카카오톡으로 보낸 조각들을 빈 줄 하나로 이은 **일반 텍스트**. 제목까지만 담는 개인정보 범위(메일 본문·보낸 사람 제외)를 그대로 지킨다. 화면은 이 글을 HTML로 해석하지 않고 글자로만 보여 준다 |
| 논문 연결 | 비서가 폴리오 구역의 `itemKey`로 `papers`에서 `(user_id, item_key)`가 같은 행의 `id`를 찾아 `archi_briefing_papers`에 넣는다. 찾지 못하면 그 논문의 연결만 건너뛴다(브리핑 기록은 실패하지 않는다) |
| 어느 사용자의 것인가 | 비서가 기록할 때 지정하는 `user_id`(비서 환경 설정 `ARCHI_USER_ID`, 추천안). 비서는 1인용이다 |

대안으로 비서가 논문 제목을 본문에서 파싱해 연결하는 방식이 있었으나 제목은 겹치거나 바뀔 수 있어서 키(`itemKey`)를 쓴다.

## Risks / Trade-offs

- **[`papers`가 아직 비어 있으면 연결이 없다]** → 연결은 선택 정보이고 본문 자체는 그대로 읽힌다. 논문 동기화(`archi-studio-zotero-connection`, `archi-studio-papers`)가 끝난 뒤 쌓이는 브리핑부터 연결이 생긴다. 이미 쌓인 옛 브리핑의 연결은 소급하지 않는다.
- **[본문에 개인 정보가 있을 수 있다]** → 비서가 카카오톡 범위(제목까지만)를 지키므로 같은 범위다. 앱은 본문을 로그에 남기지 않는다(오류 로그에도 `id`만).
- **[서비스 키로 읽으므로 `user_id` 조건 누락이 곧 정보 노출]** → 모든 조회 함수가 `userId`를 필수 인자로 받고, 다른 사용자 시험으로 고정한다.
- **[본문이 길면 응답이 커진다]** → 목록은 `summary`만 돌려주고 본문은 상세에서만 준다.

## Migration Plan

DB 변경이 없다. 로컬에서 `npm run db:reset`으로 시험하고, 운영 적용은 `archi-studio-deploy-cutover`가 한다. 되돌리기는 라우트와 서비스 파일을 지우는 것으로 충분하다.

## Open Questions

- 비서가 기록할 사용자를 정하는 방법. 추천: 비서 환경 설정 `ARCHI_USER_ID`(앱 사용자 UUID 한 개). 비서가 1인용이므로 충분하다. 바꿔도 이 change의 API는 영향이 없다.
- `body`에 구역 구조(JSON)를 남길지. 추천: 지금은 글자 그대로. 화면이 구역별 접기가 필요해지면 그때 `body`는 그대로 두고 컬럼을 추가한다.
- 브리핑 보관 기간과 삭제 정책. 추천: 정하지 않는다(데모 범위 밖).

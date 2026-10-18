# Design

## Context

- 인증은 끝났다. 보호 경로의 요청에는 `locals.user.id`(로그인한 사용자)가 항상 들어온다. 공통 오류 형식 `{error:{code,message}}`와 헬퍼(`standardError`)도 있다.
- DB에는 `papers`(논문), `archi_collections`(컬렉션), `archi_translations`와 `archi_analyses`(이력)가 이미 있다. 이력의 `paper_id`는 `papers(id)`를 `on delete cascade`로 참조하므로, 논문 행을 지우면 이력도 DB가 함께 지운다. 모든 테이블에 RLS(행 단위 접근 제한)가 켜져 있고 정책은 없다. 그래서 서버가 서비스 키로 접속해 **모든 쿼리에 `user_id` 조건을 직접 거는 것**이 접근 제어의 전부다.
- 논문 메타데이터(제목, 저자, 연도, 컬렉션, 첨부 종류)는 Zotero 동기화(선행 change)가 `papers`에 채운다. 이 change는 그 캐시를 읽는 쪽이다. 원문 파일, 웹페이지 추가, 삭제만 Zotero 서버를 직접 부른다.
- 참고 구현은 폴리오 `server/server.js`(논문 라우트 약 500~690줄, 컬렉션 945~965줄)와 `server/zotero.js`, `server/db.js`다. 폴리오 방식과 달라지는 점은 아래 결정에 적었다.
- 선행 change(`archi-studio-zotero-connection`)가 아직 구현되지 않았을 수 있다. 이 문서는 그 change가 아래 두 가지를 제공한다고 가정한다. 이름과 모양은 실제 구현을 확인해 맞춘다(Open Questions 3).
  - 사용자의 Zotero 자격 정보 조회: 연결되지 않았으면 `null`을 돌려준다.
  - Zotero API를 부르는 클라이언트(요청마다 사용자의 키를 붙임).

## Goals / Non-Goals

**Goals:**
- 메인 스펙 `papers`의 요구사항 8개와 `openapi.yaml`의 해당 경로를 그대로 만족한다.
- 어떤 경우에도 다른 사용자의 논문이 보이거나 바뀌지 않는다.
- Zotero가 없어도(가짜 응답으로) 모든 동작을 자동 테스트로 확인할 수 있다.

**Non-Goals:**
- Zotero 동기화, 메모, 화면(각각 다른 change).
- 첨부 업로드, 하이라이트·필기, 서지정보 수정.
- PDF의 부분 전송(HTTP Range 요청) 지원. 폴리오도 지원하지 않는다.

## Decisions

**1. 서비스 로직은 한 모듈로 모으고 의존성은 주입한다.**
`src/lib/server/papers-service.ts`에 목록, 상세, 컬렉션, 파일, 웹페이지 추가, 삭제를 함수로 두고, 라우트(`+server.ts`)는 요청을 읽어 서비스를 부르고 응답을 만들 뿐이다. 서비스는 Supabase 클라이언트와 Zotero 클라이언트를 인자로 받는다(인증 change의 `auth-deps.ts`와 같은 방식). 그래야 테스트에서 가짜 Zotero를 끼울 수 있다.

**2. 다른 사용자의 논문은 "없는 논문"과 똑같이 404로 답한다.**
모든 조회와 변경에 `user_id = locals.user.id` 조건을 건다. 남의 논문 `id`로 상세, 파일, 삭제를 요청하면 존재 여부가 드러나지 않도록 없는 논문과 같은 404 `paper_not_found`(파일은 `attachment_not_found`가 아니라 먼저 논문 확인)를 돌려준다. `id`가 UUID 형식이 아니면 DB 오류(500)가 아니라 404로 처리한다. 대안으로 403을 쓰면 남의 논문이 존재한다는 사실이 새므로 버렸다.

**3. 목록·검색·개수 계산은 SQL 함수로 한다.**
저자는 `authors` jsonb 배열(문자열 목록)이라서 PostgREST(Supabase의 REST 계층) 필터로는 제목과 저자를 한꺼번에 `ilike`로 찾을 수 없다. 새 마이그레이션 파일에 함수 세 개를 둔다. 기존 마이그레이션과 테이블은 건드리지 않는다.
- 목록 함수: 사용자, 검색어, 컬렉션 키, 개수, 커서를 받아 `(synced_at desc, id desc)` 순서로 돌려준다. 검색어의 `%`, `_`, `\`는 글자 그대로 찾도록 이스케이프한다(폴리오가 이미 하던 처리).
- 컬렉션 개수 함수: 컬렉션 목록과 `paperCount`(그 컬렉션 키를 가진 논문 수)를 한 번에 돌려준다.
- 상세 개수: 번역 개수와 분석 개수(`archi_analyses`는 `(user_id, paper_id)`가 유일해서 0 또는 1)를 상세 조회 때 센다.
`docs/api/data-model.md`의 "함수" 절에 이 함수들을 적는다.

**4. 페이지 나누기는 커서 방식이다.**
커서는 마지막 항목의 `(synced_at, id)`를 base64url로 감싼 불투명한 문자열이다. 다음 페이지 유무를 알려고 `limit + 1`개를 읽는다. 깨진 커서와 범위를 벗어난 `limit`(1~200 밖)은 400 `invalid_request`로 답한다(`openapi.yaml`이 `limit`을 1~200으로 정했으므로 값을 바꿔 받아 주지 않는다). 검색 결과 정렬은 스펙대로 최근 동기화 순이다. 폴리오는 검색 때 제목순으로 정렬했는데, 커서가 한 가지 정렬만 지원하므로 따르지 않는다(Open Questions 4).

**5. 응답 변환 규칙은 한 곳에서 한다.**
- 제목이 `null`이면 빈 문자열 `""`.
- `year`는 저장된 문자열에서 처음 나오는 네 자리 숫자를 정수로, 없거나 비어 있으면 `null`.
- `hasPdf`는 `attachment_type = 'pdf'`, `hasMemo`는 `has_memo`, `attachment.type`은 `pdf`, `html`, `null`.
이 변환은 순수 함수 하나(`toPaperListItem`)로 두고 단위 테스트한다.

**6. 원문 파일은 Zotero에서 받아 그대로 내려준다.**
- PDF: Zotero 응답의 본문을 `application/pdf`, `Content-Disposition: inline`으로 스트림 그대로 전달한다(메모리에 통째로 올리지 않는다).
- HTML 스냅샷: Zotero가 브라우저 커넥터로 저장한 스냅샷을 zip으로 묶어 두므로(앞 두 바이트가 `PK`), 압축을 풀어 첫 `.html` 파일을 꺼낸다. 이를 위해 작은 zip 라이브러리가 필요하고 추천은 `fflate`(의존성이 없고 ESM 지원)다. 폴리오가 쓰는 `adm-zip`도 가능하지만 오래된 CommonJS라 버렸다. 응답에는 `Content-Security-Policy: default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data:`와 `X-Content-Type-Options: nosniff`를 붙여 스크립트와 외부 요청을 막는다(폴리오 동작 유지).
- 인증은 앱 전체의 쿠키 가드가 이미 한다. `<iframe src="/api/papers/{id}/file">`처럼 브라우저가 쿠키를 자동으로 붙여 부르는 방식이 동작해야 하므로 `Authorization` 헤더 방식은 쓰지 않는다(인증 설계 결정 4). 같은 출처 `<iframe>`이 열리도록 `frame-ancestors 'self'`를 허용한다.
- 첨부가 없으면 404 `attachment_not_found`.

**7. 웹페이지 추가는 사설 주소를 막고, 제목은 최선만 한다.**
- 입력은 `http://`나 `https://`로 시작하는 URL만 받는다. 아니면 400 `invalid_request`.
- 서버가 그 URL로 직접 접속해 제목을 읽어 오므로, 호스트가 사설망·루프백·링크 로컬 주소로 해석되면 거부한다(SSRF 방어). 리다이렉트는 자동으로 따라가지 않고 한 번 이동할 때마다 같은 검사를 다시 한다. 응답 본문은 1MB, 대기는 시간 제한을 둔다. 폴리오의 방식을 TypeScript로 옮긴다.
- 제목을 못 읽어도 실패시키지 않고 URL을 제목으로 쓴다. 제목 끝에 붙는 `| 사이트명` 꼬리는 폴리오의 정리 규칙(`cleanTitle`)을 옮겨 표시용으로만 다듬는다(Zotero 원본 제목은 건드리지 않는다).
- Zotero에 항목을 만든 뒤 `papers`에 넣는다. Zotero는 성공했는데 DB 삽입이 실패하면 500을 돌려주지만, 다음 동기화가 `(user_id, item_key)` 기준으로 그 항목을 채워 넣으므로 데이터는 사라지지 않는다.

**8. 삭제는 Zotero를 먼저, 앱 DB는 그다음에 한다.**
순서는 (1) 논문 확인, (2) Zotero 항목의 현재 버전 조회, (3) Zotero 휴지통으로 이동(`If-Unmodified-Since-Version` 헤더, 버전이 어긋나 412가 나면 한 번만 다시 조회해 재시도), (4) `papers` 행 삭제(이력은 DB의 연쇄 삭제가 처리). Zotero에서 이미 없는 항목(404)이면 성공으로 보고 앱 쪽만 정리한다. Zotero 단계가 실패하면 앱 행을 지우지 않는다. 반대 순서(앱 먼저)는 Zotero 실패 시 앱에서만 사라진 논문이 다음 동기화 때 되살아나므로 버렸다.

**9. 테스트 구조.**
- 단위: 변환 규칙, 커서 인코딩, SSRF 방어(사설 IP, 리다이렉트로 사설 IP 이동, 크기 제한), HTML zip 해제, Zotero 호출 순서(가짜 클라이언트).
- 통합(로컬 Supabase, 기존 `auth-harness.ts`로 쿠키를 붙여 요청): 사용자 A·B 두 명을 만들고 `papers`를 서비스 키로 직접 채워서 목록·검색·커서 순회·컬렉션·상세·남의 자원 404·삭제 연쇄를 확인한다.

## Risks / Trade-offs

- 선행 change가 만들 Zotero 클라이언트의 모양을 지금 알 수 없다. → 첫 작업에서 실제 코드를 읽고 맞춘다. 맞지 않으면 이 change의 얇은 어댑터로 흡수한다.
- 서비스 키로 접속하므로 `user_id` 조건을 빠뜨린 쿼리 하나가 곧 데이터 유출이다. → 모든 쿼리를 서비스 함수 한 곳에 모으고, 남의 자원 404 통합 테스트를 모든 `{id}` 경로에 건다.
- 큰 PDF를 중계하면 서버 대역폭을 쓴다. → 스트림으로 전달하고 Range 요청은 후속 과제로 둔다.
- Zotero 서버가 느리거나 막히면 파일, 추가, 삭제가 실패한다. → 응답 코드는 Open Questions 2.
- 검색을 `ilike`로 하므로 논문이 수만 건이면 느려질 수 있다. 베타 규모(수백~수천 건)에서는 충분하다고 보고, 필요해지면 `pg_trgm` 색인을 추가한다.
- Zotero 키는 저장 시 암호화된다(선행 change가 방식을 정한다). 이 change는 복호화된 키를 요청마다 메모리에서만 쓰고 로그에 남기지 않는다.

## Migration Plan

1. 새 마이그레이션(함수만 추가)을 로컬에서 적용·검증한다. 운영 적용은 `archi-studio-deploy-cutover`에서 다른 마이그레이션과 함께 한다.
2. 롤백은 이 change로 만든 파일과 함수를 지우는 것으로 충분하다(기존 서비스와 테이블에 영향 없음).

## Open Questions

1. **Zotero가 연결되지 않은 사용자가 원문 파일을 요청하거나 논문을 삭제하면 어떤 응답인가?** 스펙에는 웹페이지 추가의 409 `zotero_not_connected`만 있다. 추천: 파일과 삭제도 같은 409로 통일하고, 구현 전에 `papers` 델타 스펙(MODIFIED)과 `openapi.yaml`을 보강한다.
2. **Zotero 서버가 오류를 돌려주거나 응답하지 않으면?** 스펙에 없다. 추천: 502 `zotero_unavailable`을 새로 정의하고 1번과 같은 보강에 넣는다.
3. **Zotero HTTP 클라이언트의 주인은 누구인가?** 추천: `archi-studio-zotero-connection`이 기본 클라이언트(요청마다 사용자 키 붙이기, 오류 변환)를 만들고, 이 change는 첨부 다운로드, 웹페이지 항목 생성, 항목 삭제 함수만 추가한다. 선행 change에 없다면 첫 작업에서 최소 클라이언트부터 만든다.
4. **검색 결과를 제목순으로 보여줄까, 최근 동기화 순으로 보여줄까?** 추천: 스펙대로 최근 동기화 순(커서 구현이 단순하고 목록과 같은 순서). 제목순이 필요하면 화면에서 정렬하거나 후속 change로 한다.
5. **큰 PDF를 부분 전송으로 지원할까?** 추천: 지금은 하지 않는다. pdf.js 뷰어가 느리다고 확인되면 후속 change로 한다.

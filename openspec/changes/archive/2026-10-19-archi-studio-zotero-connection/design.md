# Design

## Context

- **계약은 이미 있다.** 메인 스펙 `zotero-connection`(요구사항 5개), `docs/api/openapi.yaml`의 `/api/zotero/*` 5개 경로, `docs/api/data-model.md`의 테이블 정의가 정한다. 이 change는 그 계약을 구현한다.
- **다시 쓰는 대상은 폴리오다.** 기준 코드는 `zotero-folio/server/oauth1.js`(OAuth1 3단계 서명, 88줄), `zotero.js`(Zotero Web API 호출), `server.js`의 `/oauth/login`·`/oauth/callback`·`doSync`(약 300~440줄)다. 폴리오는 Express, 메모리 세션, 평문 키 저장, Zotero 로그인 = 앱 로그인이라는 구조였고, 새 앱은 Supabase Auth 로그인 위에 Zotero를 "연결"로 얹는다.
- **이미 있는 것.** 로그인된 사용자는 `event.locals.user.id`(= `auth.users.id`)로 주어진다. 서버 전용 Supabase 클라이언트 헬퍼(`createServiceClient`)와 오류 헬퍼(`errorResponse`)가 있고, `GET /api/auth/me`는 `folio_users.zotero_api_key`가 null이 아니면 `zoteroConnected: true`로 계산한다. 가입 시에는 `folio_users` 행을 만들지 않으므로 이 change가 연결할 때 처음 만든다.
- **제약.** 테스트는 실제 Zotero에 접속하지 않는다. 운영 DB에는 접속하지 않는다. Zotero 앱 키(등록 필요)는 배포 단계 전까지 없다.

## Goals / Non-Goals

**Goals:**
- 연결 → 동기화 → 상태 조회 → 해제의 전체 흐름이 로컬 Supabase와 가짜 Zotero 서버로 자동 시험된다.
- 동기화가 `folio_papers`, `papers`, `archi_collections`, 동기화 상태를 한 번에(같은 트랜잭션으로) 반영한다. 중간에 실패해도 절반만 반영된 상태가 남지 않는다.
- Zotero 키가 DB에 평문으로 남지 않고 어떤 응답·로그에도 나오지 않는다.

**Non-Goals:**
- 논문 목록·상세·검색·컬렉션 조회 API, 원문 파일, 메모, 웹페이지 추가·삭제(`archi-studio-papers`, `archi-studio-paper-notes`).
- 하이라이트, 필기, 첨부 업로드(이번 범위 밖으로 확정됨).
- 연결 화면과 설정 화면(`archi-studio-ui-auth-library`).
- 실제 Zotero 계정으로의 연결 시험과 앱 키 등록(배포 단계).
- 기존 폴리오 사용자의 이전.

## Decisions

**1. 코드는 `src/lib/server/zotero/` 아래 다섯 모듈로 나눈다.** `oauth1.ts`(서명과 3단계 호출), `client.ts`(Zotero Web API 호출: 변경 항목, 삭제 목록, 첨부 부모, 자식 항목, 컬렉션), `sync.ts`(동기화 알고리즘), `crypto.ts`(키 암호화), `connection.ts`(연결 저장·해제·상태). 라우트는 얇게 두고 이 모듈을 부른다. Zotero 호출은 함수 인자로 기본 주소를 받게 해서 테스트가 가짜 서버로 바꿀 수 있다(환경 변수 `ZOTERO_API_BASE_URL`, `ZOTERO_OAUTH_BASE_URL`, 기본은 실제 주소).

**2. OAuth 대기 상태는 짧은 쿠키에 암호화해 담는다.** 연결 시작에서 받은 request token과 secret은 시작과 콜백 사이(수 분)에만 필요하다. 쿠키 `archi_zotero_oauth`(`httpOnly`, `SameSite=Lax`, 10분, 경로 `/api/zotero`)에 암호화해 넣고, 콜백에서 지운다. 대안: DB 표(새 테이블이 필요해 버렸다), 서버 메모리(재시작하면 사라져서 버렸다). 로그인 세션 쿠키(`archi_session`)는 `SameSite=Lax`라 Zotero에서 돌아오는 최상위 이동(GET)에도 같이 오므로 콜백은 로그인한 사용자로 확인된다. 콜백의 `oauth_token`이 쿠키의 token과 다르면 400 계열 오류 안내로 보낸다.

**3. Zotero 키는 AES-256-GCM(인증이 붙는 대칭 암호)으로 암호화해 저장한다.** 형식은 `v1.<iv>.<tag>.<암호문>`(base64url)이고 접두사 `v1`은 나중에 키를 바꿀 때 구분하는 용도다. 암호화 키는 환경 변수 `ZOTERO_KEY_ENCRYPTION_SECRET`(32바이트를 base64로 쓴 값)에서 읽고, 없거나 길이가 틀리면 서버 시작이 아니라 첫 사용 때 명확한 오류로 실패한다(앱 전체가 죽지 않게). 복호화는 동기화 호출 직전 한 곳에서만 한다. 로그와 오류 메시지에는 키를 넣지 않는다. 키 보관과 교체 절차는 열린 질문 1.

**4. 연결 저장은 `folio_users`에 id 기준으로 upsert한다.** 가입 때는 행이 없으므로 처음 연결할 때 `{ id: 로그인 사용자 id, zotero_user_id, zotero_username, zotero_api_key(암호문) }`로 만든다. 같은 사용자가 다시 연결하면 키와 이름만 갱신한다. Zotero가 알려준 `zotero_user_id`가 이전과 다르면(다른 Zotero 계정으로 바꿈) 동기화 상태 `lastVersion`과 `failedItemKeys`를 지워 다음 동기화가 전체가 되게 한다. 이전 계정에서 가져온 논문은 지우지 않는다(열린 질문 3).

**5. 해제는 키만 비운다.** `zotero_api_key = null`로 만들고 행은 남긴다. 행을 지우면 `folio_papers`가 연쇄로 사라지기 때문이다(`data-model.md` 3.3). `zotero_user_id`와 이름은 남겨 두어 같은 계정으로 다시 연결하면 `lastVersion`부터 이어 간다. 해제 뒤 동기화는 409 `zotero_not_connected`, 상태 조회는 `{ "connected": false }`다.

**6. 동기화 알고리즘은 폴리오의 `doSync`를 그대로 옮긴다.**
- 마지막 `lastVersion` 이후 바뀐 최상위 항목(`/items/top?since=`, 페이지 100개씩, `Link` 헤더를 따라감)을 가져온다.
- 첨부만 새로 붙은 부모 항목(부모 버전은 안 바뀜)은 첨부 변경 목록(`/items?itemType=attachment&since=`)에서 부모 키를 찾아 합친다.
- 지난번 반영에 실패한 항목(`failedItemKeys`)은 버전과 무관하게 다시 조회해 재시도한다.
- 삭제된 항목은 `/deleted?since=`로 찾아 목록에서 지운다.
- 항목마다 자식 항목을 한 번 조회해 읽을 수 있는 첨부(PDF 우선, 없으면 HTML)와 메모(태그 `zotero-insight:memo` 노트가 있는지, `has_memo`용)를 함께 정한다. 항목 하나가 실패해도 전체를 멈추지 않고 실패 목록에 넣는다.
- 컬렉션 목록(`/collections`)도 가져와 `archi_collections`에 반영한다.
- 제목 정리(`webpage` 항목의 `" | "` 뒤 꼬리 제거), 저자 목록 만들기, 연도 문자열 규칙은 폴리오 함수를 그대로 옮긴다(`year`는 문자열 그대로 저장하고 응답 변환은 papers change가 한다).
- Zotero 호출은 한 사용자당 순차로 한다(폴리오와 같음). 속도 제한 응답 헤더(`Backoff`, `Retry-After`)는 지금은 따르지 않는다(위험 절 참고).

**7. 반영은 SQL 함수 하나로 한 트랜잭션에서 한다.** Supabase 클라이언트는 여러 표를 한 트랜잭션으로 쓸 수 없다. 새 마이그레이션 파일(`..._zotero_sync.sql`, 기존 파일은 고치지 않는다)에 `archi_apply_zotero_sync(p_user_id, p_items jsonb, p_deleted text[], p_collections jsonb, p_version bigint, p_failed text[], p_synced_at timestamptz)`를 추가한다. 이 함수는 `folio_papers`와 `papers`를 `(user_id, item_key)`로 upsert하되 `papers.s2_paper_id`와 `created_at`은 건드리지 않고, 삭제 키는 두 표에서 지우고(`papers`를 지우면 번역·분석 이력이 연쇄로 지워진다는 기존 결정이 그대로 적용된다), 컬렉션을 맞추고, `lastVersion`, `lastSyncedAt`, `failedItemKeys`를 쓰고, 추가·갱신·삭제 개수를 돌려준다. 실행 권한은 `anon`, `authenticated`에서 뺀다(로그인 시도 함수와 같은 방식).

**8. 한 사용자의 동기화는 서버 프로세스 안에서 순서대로 한다.** 같은 사용자의 `POST /api/zotero/sync`가 동시에 두 번 오면 뒤의 요청은 앞의 요청이 끝난 뒤 시작한다(프로세스 안 잠금). 서버가 한 대라는 현재 배포 가정에서 충분하다. 여러 대로 늘리면 DB 잠금으로 바꿔야 한다(위험 절).

**9. 오류.** 연결하지 않은 사용자의 동기화는 스펙대로 409 `zotero_not_connected`다. Zotero 쪽 실패(네트워크, 5xx, 키가 폐기돼 403)는 스펙에 없는 경우라 502 `zotero_unavailable`로 돌려주기로 가정하고, 이 코드를 `openapi.yaml`에 추가하는 문서 작업을 tasks에 넣는다(열린 질문 2). 오류 본문에는 Zotero의 응답 원문이나 키를 넣지 않는다.

**10. 연결이 끝난 뒤 이동할 곳은 상수 한 곳에서 정한다.** 성공은 `/library`, 승인 거부와 실패는 `/settings?zotero=denied`, `/settings?zotero=error`다. 두 화면은 `archi-studio-ui-auth-library`가 만든다. 그 전에는 이동한 곳이 비어 있어도 API 시험에는 지장이 없다.

## Risks / Trade-offs

- **첫 동기화가 오래 걸릴 수 있다.** 스펙은 `POST /api/zotero/sync`가 끝나면 결과를 돌려주는 동기 방식이다. 항목마다 자식 항목을 조회하므로 수백~수천 건 라이브러리는 수 분이 걸릴 수 있다. → 데모용 라이브러리 크기에서는 문제없다고 보고 그대로 두며, 열린 질문 4에 둔다. 폴리오도 같은 방식이었다.
- **Zotero 속도 제한.** `Backoff` 헤더를 무시하면 큰 라이브러리에서 429를 받을 수 있다. → 순차 호출과 폴리오의 기존 방식(제한 대응 없음, 지금까지 문제 없었음)을 따르고, 429가 확인되면 따로 다룬다.
- **프로세스 안 잠금은 서버가 여러 대면 소용없다.** → 한 대 배포가 가정이다. 늘어나면 SQL 쪽 잠금으로 교체한다.
- **암호화 키를 잃으면 모든 사용자가 다시 연결해야 한다.** 논문 목록은 남지만 새 동기화는 못 한다. → 키 백업과 교체 절차를 열린 질문 1에서 정한다.
- **다른 Zotero 계정으로 바꾸면 옛 논문이 섞인다.** → 열린 질문 3.
- **새 마이그레이션 파일이 늘어난다.** 운영 적용 전이라 기존 파일을 고쳐도 되지만, 이미 시험을 통과한 파일을 건드리지 않으려고 새 파일로 추가한다.

## Open Questions

1. **Zotero 키 암호화 방식(TODO.md 열린 질문 4).** 추천: 위 결정 3대로 앱 암호화 키 하나(AES-256-GCM)를 환경 변수로 두고, 서버의 `.env`에만 보관하며, 키 교체는 `v1` 접두사로 나중에 재암호화 스크립트를 만든다. 대안: Supabase Vault(DB 쪽 비밀 저장소)는 로컬 환경 설정이 복잡해 지금은 보류. 사용자가 확정해야 apply 때 키 보관 위치를 정한다.
2. **Zotero 쪽 오류의 응답 코드.** 스펙에 없다. 추천: 502 `zotero_unavailable`을 추가하고 `openapi.yaml`과 `zotero-connection` 스펙에 반영한다(스펙 반영은 이 change가 아니라 보관 때 델타로 하거나 별도 소규모 change).
3. **같은 Zotero 계정을 다른 사용자가 연결하려 할 때, 그리고 계정을 바꿀 때.** 현재 `zotero_user_id`가 unique라 두 번째 사용자는 저장 오류가 난다(`data-model.md` 5절 6번도 같은 지적). 추천: 409 `zotero_account_in_use`로 거부하고 안내한다. 계정을 바꿀 때 옛 논문은 지우지 않고 남겨 두되, 사용자가 원하면 나중에 정리 기능을 만든다.
4. **동기화를 요청 안에서 끝낼지 백그라운드로 돌릴지.** 추천: 지금은 요청 안에서 끝내고, 시간이 문제가 되면 `202`와 진행 상태 조회로 바꾸는 별도 change를 만든다.
5. **`APP_BASE_URL`과 Zotero 앱 등록.** 콜백 주소는 새 앱의 공개 주소(TODO.md 열린 질문 6)로 Zotero에 등록해야 한다. 개발 중에는 가짜 서버가 대신하므로 막히지 않는다.

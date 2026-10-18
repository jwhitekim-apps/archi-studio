# Tasks

모든 시험은 실제 Zotero 대신 시험 안에서 띄우는 가짜 Zotero 서버를 쓴다. 로컬 DB가 필요한 task에는 "(로컬 DB)"를 적었다. 시작 전에 `npm run db:start`로 로컬 Supabase를 올리고, 끝나면 `npm run db:stop`으로 내린다. 통합 시험은 기존대로 `npm run test:auth`로 돈다(`*.integration.ts`를 모두 포함한다).

## 1. 준비

- [ ] 1.1 `.env.example`에 `ZOTERO_CLIENT_KEY`, `ZOTERO_CLIENT_SECRET`, `APP_BASE_URL`, `ZOTERO_KEY_ENCRYPTION_SECRET`, `ZOTERO_API_BASE_URL`, `ZOTERO_OAUTH_BASE_URL`의 이름만 값 없이 추가하고, `git diff .env.example`에 `=` 뒤 값이 하나도 없는지 확인한다. 이 파일은 커밋 도구의 보안 장치가 막으므로 평범한 `git commit`으로 커밋한다
- [ ] 1.2 `src/lib/server/zotero/crypto.ts`에 `v1.<iv>.<tag>.<암호문>` 형식의 AES-256-GCM 암호화와 복호화를 만들고, 단위 시험(`npm test`)으로 왕복 복원, 암호문 한 글자 변조 시 복호화 실패, 키 길이가 32바이트가 아니거나 키가 없을 때 키 값을 포함하지 않는 명확한 오류, 같은 평문을 두 번 암호화하면 서로 다른 결과임을 확인한다
- [ ] 1.3 `src/lib/server/zotero/oauth1.ts`에 폴리오 `oauth1.js`와 같은 3단계 서명(요청 토큰, 인가 주소 만들기, 접근 토큰 교환)을 옮기고, 시간과 무작위 값을 주입할 수 있게 해서 고정 입력에서 폴리오 함수(`node -e`로 같은 고정 입력을 넣어 얻은 값)와 서명이 같은지 단위 시험(`npm test`)으로 확인한다
- [ ] 1.4 `.gitignore`와 `.env.example`을 건드리지 않고 `src/lib/server/zotero/`에 설정 읽기 함수(앱 키, 기본 주소, 시험용 주소 교체)를 만들고, `grep -rn "ZOTERO_CLIENT_SECRET\|ZOTERO_KEY_ENCRYPTION_SECRET" src build/client`로 키 값이 아니라 변수 이름만 서버 코드에 있고 `npm run build` 뒤 `build/client`에는 0건인지 확인한다

## 2. 가짜 Zotero와 DB 함수

- [ ] 2.1 시험 도구로 가짜 Zotero 서버(`src/lib/server/zotero/fake-zotero.ts`, Node `http`)를 만든다. OAuth 요청·인가·교환, `/users/:id/items/top`(`since`와 `Link` 헤더 페이지 나누기), `/items?itemType=attachment`, `/deleted`, `/items/:key`, `/items/:key/children`, `/collections`, `Last-Modified-Version` 헤더를 흉내 내고, 라이브러리 내용을 시험이 바꿀 수 있게 하며, 이 서버 자체의 단위 시험(`npm test`)으로 페이지 나누기와 `since` 필터가 맞는지 확인한다
- [ ] 2.2 (로컬 DB) 새 마이그레이션 `supabase/migrations/<날짜>_zotero_sync.sql`에 `archi_apply_zotero_sync`를 추가한다(기존 마이그레이션 파일은 수정하지 않는다). `npm run db:reset` 뒤 `docker exec supabase_db_archi-studio psql -U postgres`로 시험 데이터를 넣고 호출해, 두 표(`folio_papers`, `papers`)에 같은 항목이 반영되고 `papers.s2_paper_id`가 갱신 뒤에도 남고, 삭제 키가 두 표에서 지워지고 그 논문의 번역 이력이 연쇄 삭제되며, 반환된 추가·갱신·삭제 개수가 맞고, 중간에 일부러 잘못된 값(`item_version` null)을 넣으면 아무것도 바뀌지 않고, `anon`과 `authenticated` 역할로 호출하면 권한 오류가 나는지 확인한다

## 3. 연결

- [ ] 3.1 (로컬 DB) `GET /api/zotero/connect`를 만들고, 통합 시험(`npm run test:auth`)으로 로그인한 사용자는 302와 가짜 Zotero 인가 주소(`oauth_token` 포함)와 `archi_zotero_oauth` 쿠키(`httpOnly`, `SameSite=Lax`, 10분 안팎, 값에 request token secret이 평문으로 없음)를 받고, 로그인하지 않으면 401 `unauthenticated`인지 확인한다
- [ ] 3.2 (로컬 DB) `GET /api/zotero/callback`을 만들고, 통합 시험으로 ① 정상 승인은 302로 `/library`, `folio_users`에 `zotero_user_id`와 이름이 저장되고 `zotero_api_key`는 `v1.`로 시작하는 암호문(평문 아님), `GET /api/auth/me`의 `zoteroConnected`가 `true` ② 승인 거부(`oauth_verifier` 없음 또는 `oauth_problem` 파라미터, 실제 Zotero의 거부 신호는 구현 때 Zotero 문서로 확인)는 `folio_users` 행을 만들지 않고 `/settings?zotero=denied`로 302 ③ 쿠키의 token과 다른 `oauth_token`은 `/settings?zotero=error`로 302 ④ 어느 응답에도 키 값이 없음 ⑤ 다른 Zotero 계정으로 다시 연결하면 `lastVersion`과 `failedItemKeys`가 지워지고 같은 계정이면 유지됨을 확인한다
- [ ] 3.3 (로컬 DB) `GET /api/zotero/status`와 `DELETE /api/zotero/connection`을 만들고, 통합 시험으로 연결 전은 `{ "connected": false }`, 연결 후는 `connected`, `zoteroUsername`, `lastSyncedAt`을 돌려주고, 해제는 204와 `zotero_api_key`만 null이 되며(행과 `folio_papers`, `papers`는 그대로) 해제 뒤 상태는 `connected: false`, 해제 뒤 동기화는 409 `zotero_not_connected`인지 확인한다. 세션 없는 요청은 모두 401임도 확인한다

## 4. 동기화

- [ ] 4.1 `src/lib/server/zotero/client.ts`에 변경 항목(페이지 나누기 포함), 첨부 변경 부모 키, 삭제 목록, 단일 항목, 자식 항목, 컬렉션 조회를 만들고, 가짜 Zotero 서버를 대상으로 한 단위 시험(`npm test`)으로 200개 항목이 페이지 3개로 나뉘어도 모두 모이고 `Last-Modified-Version`의 최댓값을 새 버전으로 돌려주는지, 401·403·500 응답이 `zotero_unavailable`로 번역될 오류가 되는지(키 값과 응답 원문 없음) 확인한다
- [ ] 4.2 (로컬 DB) `src/lib/server/zotero/sync.ts`에 폴리오 `doSync` 알고리즘(첨부만 바뀐 부모 포함, 실패 항목 재시도, 삭제 반영, 웹페이지 제목 정리, 저자와 연도 규칙, PDF 우선 HTML 대체 첨부, 메모 태그 노트 유무로 `has_memo`, 컬렉션 반영)을 옮기고, 통합 시험으로 첫 동기화는 전체(`added` = 가짜 항목 수), 항목 하나만 바꾼 두 번째 동기화는 `updated: 1`, 가짜 서버에서 항목을 지우면 `removed: 1`과 두 표에서 사라짐, 첨부만 새로 붙은 부모가 갱신됨, 일부러 한 항목의 자식 조회를 실패시키면 나머지는 반영되고 다음 동기화에서 재시도되어 복구됨, 폴리오와 같은 입력에서 `title`, `authors`, `year` 값이 같음을 확인한다
- [ ] 4.3 (로컬 DB) `POST /api/zotero/sync`를 만들고, 통합 시험으로 200 본문이 `{ added, updated, removed, syncedAt }`, 연결하지 않은 사용자는 409 `zotero_not_connected`, 가짜 Zotero가 500을 돌려주면 502 `zotero_unavailable`이고 본문에 키나 Zotero 응답 원문이 없고 이전 목록이 그대로이며, 같은 사용자의 동기화 두 건을 동시에 보내면 순서대로 처리되어 둘 다 성공하고 최종 목록이 중복 없이 맞는지 확인한다

## 5. 마무리

- [ ] 5.1 `docs/api/openapi.yaml`의 `/api/zotero/sync`에 502 `zotero_unavailable`을 추가하고(열린 질문 2의 결정에 따라 코드 이름을 맞춘다) `/api/zotero/callback`의 이동 대상을 적은 뒤, `npx @redocly/cli lint docs/api/openapi.yaml`이 오류 없이 끝나는지 확인한다
- [ ] 5.2 `docs/dev/setup.md`에 Zotero 환경 변수 설명(암호화 키는 `openssl rand -base64 32`로 만들고 `.env`에만 넣는다), 가짜 Zotero 서버로 시험하는 방법, 실제 Zotero 앱 키 등록은 배포 단계에서 한다는 점을 적고, 문서의 순서만 따라 `.env`를 새로 만들어 `npm run test:auth`가 통과하는지 확인한다
- [ ] 5.3 (로컬 DB) `npm run db:reset` 뒤 `npm run check`(오류 0건), `npm test`, `npm run test:auth`, `npm run build`, `npm run check:tokens`, `openspec validate archi-studio-zotero-connection --strict`, `openspec validate --specs --strict`가 모두 통과하고, `git grep -nE "eyJ[A-Za-z0-9_-]{10}|oauth_token_secret=[A-Za-z0-9]{8}"`가 0건이며, `build/client`에 `ZOTERO_` 변수가 없음을 확인한 뒤 `npm run db:stop`으로 내린다

## Workflow follow-up

- 구현이 끝나면 `/opsx:archive`로 이 change를 보관한다. 델타 스펙이 없으므로 메인 스펙은 바뀌지 않는다.
- 다음 change는 `archi-studio-papers`(논문 목록·상세·컬렉션·원문 파일·웹페이지 추가·삭제)다. 이 change가 채워 둔 `papers`와 `archi_collections`를 읽는다.

# Proposal

선행: 없음. `archi-studio-auth`(로그인과 세션)는 이미 끝났다. 이 change가 끝나야 `archi-studio-papers`, `archi-studio-paper-notes`가 시작할 수 있다. 화면 쪽 `archi-studio-ui-auth-library`는 이 change의 API를 호출한다.

## Why

Archi Studio의 모든 기능은 "내 논문 목록"에서 출발하는데, 그 논문은 Zotero(논문 관리 서비스)에 들어 있다. 지금 새 앱에는 Zotero를 연결할 방법도, 논문을 가져올 방법도 없어서 서재, 논문 상세, 메모, 번역·분석의 연결이 모두 막혀 있다. 폴리오(`zotero-folio`)는 이 일을 이미 하고 있지만 Express와 메모리 세션, 평문 키 저장에 묶여 있어서 새 앱의 로그인과 DB 위로 다시 써야 한다.

## What Changes

- Zotero 연결 시작(`GET /api/zotero/connect`)과 완료(`GET /api/zotero/callback`)를 구현한다. OAuth1(3단계 서명 인증 방식)로 Zotero 계정 키를 받아 현재 로그인한 사용자에게 저장한다. Zotero는 로그인 수단이 아니라 "연결"이다.
- 연결 상태 조회(`GET /api/zotero/status`)와 연결 해제(`DELETE /api/zotero/connection`)를 구현한다. 해제는 키만 지우고 이미 가져온 논문 목록은 남긴다.
- 증분 동기화(`POST /api/zotero/sync`)를 구현한다. 첫 동기화는 전체, 이후는 마지막 버전 이후 바뀐 것만 가져오고, Zotero에서 지워진 항목은 목록에서도 지운다. 폴리오의 재시도 규칙(실패한 항목 다시 시도, 첨부만 바뀐 부모 항목 포함)을 옮긴다.
- 동기화 결과를 `folio_papers`(비서가 읽는 캐시)와 `papers`(새 앱의 중심 테이블), `archi_collections`(컬렉션 이름)에 한 번에 쓴다.
- Zotero 계정 키는 저장 전에 암호화하고 어떤 응답에도 내보내지 않는다.
- 테스트는 실제 Zotero에 접속하지 않고, 테스트 안에서 띄우는 가짜 Zotero 서버와 로컬 Supabase로 한다.

옮기지 않는 것: 폴리오의 메모 저장·하이라이트·필기·첨부 업로드·원문 파일 내려주기(각각 `archi-studio-paper-notes`, `archi-studio-papers`가 맡거나 이번 범위 밖이다), 폴리오 자체 로그인으로 쓰던 Zotero OAuth(새 앱은 Supabase Auth가 로그인이다).

이 change는 스펙을 새로 쓰지 않는다. 계약은 메인 스펙 `zotero-connection`(요구사항 5개, 시나리오 8개)과 `docs/api/openapi.yaml`의 `/api/zotero/*` 경로, 데이터는 `docs/api/data-model.md`의 `folio_users`, `folio_papers`, `folio_sync_state`, `archi_collections`, `papers`다. 그래서 `.openspec.yaml`에 `skip_specs: true`를 선언했다. 스펙에 빠진 경우(같은 Zotero 계정을 다른 사용자가 연결)는 design의 열린 질문에 적었다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

없음. 구현만 추가한다.

## Impact

- 코드: 새 `src/routes/api/zotero/{connect,callback,status,sync,connection}/+server.ts`, 새 `src/lib/server/zotero/`(OAuth1 서명, Zotero 클라이언트, 동기화, 키 암호화), `src/lib/server/api-guard.ts`는 변경 없음(모두 로그인 필요 경로).
- 환경 변수: `ZOTERO_CLIENT_KEY`, `ZOTERO_CLIENT_SECRET`(Zotero에 등록한 앱 키), `APP_BASE_URL`, `ZOTERO_KEY_ENCRYPTION_SECRET`, 테스트용 `ZOTERO_API_BASE_URL`·`ZOTERO_OAUTH_BASE_URL`(기본값은 실제 Zotero). `.env.example`에 이름만 추가한다.
- 데이터: 새 테이블은 없다. 이미 만든 마이그레이션의 `folio_users`, `folio_sync_state`, `folio_papers`, `archi_collections`, `papers`를 쓴다.
- 의존성: 새 패키지 없음(서명과 암호화는 Node 기본 `crypto`, 요청은 `fetch`).
- 외부: 개발 중에는 실제 Zotero를 호출하지 않는다. 앱 키 등록과 실제 계정 연결 시험은 배포 단계(`archi-studio-deploy-cutover`)에서 한다.

# Proposal

## Why

서재(내 논문 목록)가 이 앱의 중심인데, 지금은 논문 데이터를 읽거나 바꾸는 API가 하나도 없다. 번역, 분석, 메모, 화면이 모두 "논문 하나"를 가리켜야 하므로 논문 API가 먼저 있어야 한다. 이 기능은 폴리오(Express 서버)에 이미 동작하는 형태로 있어서, 그 동작을 근거로 SvelteKit + TypeScript로 다시 쓴다.

## What Changes

- 논문 목록과 검색(`GET /api/papers`), 논문 상세(`GET /api/papers/{id}`), 컬렉션(폴더) 목록(`GET /api/collections`)을 구현한다.
- 논문의 원문 파일을 내려준다(`GET /api/papers/{id}/file`). PDF는 그대로, HTML 스냅샷은 Zotero가 zip으로 묶어 둔 것을 풀어 보안 헤더를 붙여 내려준다. 브라우저 문서 뷰어와 `<iframe>`에서 로그인 쿠키만으로 열려야 한다.
- URL로 웹페이지를 논문으로 추가한다(`POST /api/papers/webpage`). 사설 주소로 향하는 요청을 막는 검사(SSRF 방어)를 포함한다.
- 논문을 삭제한다(`DELETE /api/papers/{id}`). Zotero 휴지통으로 보내고, 앱의 논문 행과 연결된 번역·분석 이력을 함께 지운다.
- 이전 change에서 미뤄 둔 인증 시나리오 "다른 사용자의 자원은 404"를 이 change의 통합 테스트로 확인한다.
- 목록과 검색, 컬렉션 개수, 상세의 번역·분석 개수를 한 번에 계산하는 DB 함수를 마이그레이션에 추가한다(새 파일, 기존 테이블은 수정하지 않는다).

## 계약과 선행

- 선행: `archi-studio-zotero-connection`. Zotero 연결(저장된 Zotero 키)과 Zotero 서버를 부르는 클라이언트가 있어야 원문 파일, 웹페이지 추가, 삭제가 동작한다.
- 이 change는 스펙을 새로 쓰지 않는다. 계약은 메인 스펙 `papers`(요구사항 8개)와 `docs/api/openapi.yaml`의 `/api/papers`, `/api/papers/webpage`, `/api/papers/{id}`, `/api/papers/{id}/file`, `/api/collections` 경로가 정한다. 그래서 `.openspec.yaml`에 `skip_specs: true`를 선언했다. 계약에 빠진 점 두 가지(Zotero 미연결과 Zotero 장애 때의 응답)는 `design.md`의 Open Questions에 적었다.
- 이 change가 끝나야 시작할 수 있는 것: `archi-studio-paper-notes`, `archi-studio-translation`, `archi-studio-paper-analysis`, 서재와 논문 허브 화면 change.

## Capabilities

### New Capabilities

없음. `papers` capability의 요구사항은 이미 메인 스펙에 있다.

### Modified Capabilities

없음. 구현만 한다. 단, Open Questions 1·2에서 계약 보강이 필요하다고 결론 나면 구현 전에 `papers` 델타 스펙(MODIFIED)을 이 change에 추가하고 `skip_specs`를 지운다.

## Impact

- 코드: 새 `src/routes/api/papers/`(`+server.ts`, `webpage/`, `[id]/`, `[id]/file/`), `src/routes/api/collections/+server.ts`, 새 `src/lib/server/papers-service.ts`와 변환·검색·SSRF 방어 모듈, 선행 change의 Zotero 클라이언트에 함수 추가(첨부 다운로드, 웹페이지 항목 생성, 항목 삭제).
- DB: 새 마이그레이션 파일 1개(함수만 추가, 테이블 변경 없음). 기존 `papers`, `archi_collections`, `archi_translations`, `archi_analyses`를 쓴다.
- 의존성: HTML 스냅샷 zip을 풀기 위한 작은 라이브러리 1개(추천 `fflate`, 근거는 design 결정 6).
- 테스트: 가짜 Zotero 응답으로 단위 테스트, 로컬 Supabase(`npm run db:start`)로 통합 테스트.

## Out of Scope

- Zotero 연결과 동기화 자체(`archi-studio-zotero-connection`), 메모(`archi-studio-paper-notes`), 화면.
- 폴리오의 첨부 파일 업로드, 하이라이트·필기 API, 컬렉션별 논문 경로(`GET /api/collections/:key/papers`). 후자는 목록의 `collection` 쿼리로 대체한다.
- 논문 서지정보(제목, 저자) 수정, 컬렉션 만들기·바꾸기.

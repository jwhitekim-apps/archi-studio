# Proposal

## Why

`archi-studio-api-spec`으로 API 계약과 데이터 모델은 정해졌지만 저장소에는 아직 코드가 한 줄도 없다. 인증, 서재, 번역 같은 기능을 병렬로 이식하려면 먼저 모두가 올라탈 뼈대(앱 틀, 로컬 DB, 공통 서버 규칙, 디자인 토큰)가 있어야 한다. 11/24 데모까지 남은 기간이 짧아서 뼈대를 한 번에 합의해 두지 않으면 기능마다 각자 틀을 만들게 된다.

## What Changes

- 저장소 루트에 SvelteKit + TypeScript 프로젝트를 초기화한다(Svelte 5, strict 타입 검사, Node 20, Docker 배포를 염두에 둔 Node 어댑터).
- Docker 로컬 Supabase를 구성한다. Supabase CLI는 전역 설치 없이 npm devDependency로 쓰고, `docs/api/data-model.md`의 테이블을 담을 마이그레이션 파일 구조와 적용 순서를 만든다.
- `hooks.server.ts`에 세션 쿠키로 사용자를 요청마다 주입하는 골격과, 모든 `/api` 오류를 `{ error: { code, message } }`로 돌려주는 공통 골격을 만든다.
- 벨루와 폴리오의 디자인 값을 비교해 통합 디자인 토큰 초안을 만들고, 왼쪽 메뉴, 가운데 작업 영역, 오른쪽 설정 패널의 3단 레이아웃 셸을 세운다.
- 이 change는 뼈대의 **계획**만 다룬다. 구현은 `/opsx:apply`로 따로 시작한다.

### 이 change에서 제외하는 것

- auth를 제외한 개별 기능 API: 논문 허브(`papers`, `paper-notes`), `zotero-connection`, `translation`, `paper-analysis`, `briefing`. 계약은 `archi-studio-api-spec`에 있고 구현은 이후 change에서 한다.
- auth 엔드포인트의 실제 구현(가입, 로그인, 승인). 이 change는 세션 쿠키를 읽어 사용자를 주입하는 골격까지만 만든다.
- 개별 화면 내용(서재 목록, PDF 뷰어, 번역 입력창). 셸의 빈 영역까지만 만든다.
- 운영(벨루) DB 적용, 비서와 폴리오 서버의 접속 값 교체, 배포 설정.

## Capabilities

### New Capabilities

- `app-shell`: 3단 레이아웃(왼쪽 메뉴, 가운데 작업 영역, 오른쪽 설정 패널)과 통합 디자인 토큰(색, 글자, 간격, 모서리, 레이아웃 치수, 라이트/다크)
- `api-foundation`: 모든 `/api` 응답의 공통 오류 형식과, 세션 쿠키로 사용자를 주입하고 인증되지 않은 요청을 401로 막는 서버 공통 규칙
- `local-dev-environment`: Docker 로컬 Supabase와 마이그레이션 파일 구조, 개발자가 명령 몇 개로 DB를 올리고 초기화하는 방법

### Modified Capabilities

(없음. `openspec/specs/`에 기존 spec이 없다.)

## Impact

- 저장소 루트에 `package.json`, `svelte.config.js`, `src/`, `static/`, `supabase/` 등이 새로 생긴다. 지금은 문서와 OpenSpec 파일뿐이다.
- 이 서버는 이미 폴리오 컨테이너가 3002 포트로 돌고 있다. 로컬 Supabase는 별도 포트를 쓰므로 충돌 여부를 첫 작업에서 확인한다.
- `archi-studio-api-spec`의 `design.md`(결정 3, 4, 5)와 `docs/api/data-model.md`를 입력으로 쓴다. 쿠키 이름은 이 change에서 확정한다.
- 벨루(`web/src/shared/styles/index.css`)와 폴리오(`web/src/app.css`)는 읽기만 한다.
- 이 change가 끝나면 이후 change(인증, 논문 허브 등)는 이 뼈대 위에 라우트와 화면만 얹으면 된다.

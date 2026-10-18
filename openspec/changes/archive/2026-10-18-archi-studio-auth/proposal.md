# Proposal

## Why

`archi-studio-scaffold`가 세션 쿠키를 읽어 사용자를 주입하는 골격까지만 만들어서, 지금은 모든 쿠키를 무효로 보고 로그인할 방법이 없다. 서재, 번역, 메모 등 뒤의 모든 API가 로그인된 사용자를 전제로 하므로 인증을 먼저 구현해야 한다.

## What Changes

- 가입, 로그인, 로그아웃, 현재 사용자 조회 엔드포인트 4개(`POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`)를 구현한다.
- Supabase Auth 계정과 `archi_session` 쿠키(`httpOnly`, `SameSite=Lax`, 30일)로 세션을 발급하고 지운다.
- 가입은 승인 전(`archi_profiles.approved=false`)으로 만들고, 미승인 계정의 로그인은 403 `pending_approval`로 막는다.
- 같은 IP의 15분 5회 실패 뒤 시도를 429 `too_many_attempts`로 막고, 실패 기록은 `archi_login_attempts`에 저장해 서버 재시작 후에도 유지한다.
- 세션 검증 함수(`src/lib/server/session.ts`)의 빈 구현을 Supabase Auth 기반 실제 구현으로 바꾼다. 이를 위해 검증 함수의 반환 계약을 확장하고(만료된 세션을 갱신할 때 새 쿠키 값을 돌려줌), 공개 경로 허용 목록에 가입과 로그인을 추가한다.
- 테스트는 로컬 Supabase(`npm run db:start`)로 실제 계정을 만들어 확인한다.

이 change는 스펙을 새로 쓰지 않는다. 계약은 아직 보관되지 않은 `archi-studio-api-spec` change의 `specs/auth/spec.md`(요구사항 8개, 시나리오 12개)와 `docs/api/openapi.yaml`의 auth 경로가 정한다. 그래서 `.openspec.yaml`에 `skip_specs: true`를 선언했다.

## Capabilities

### New Capabilities

없음. `auth` capability의 요구사항은 `archi-studio-api-spec`가 이미 정의했고, 그 change를 보관할 때 메인 스펙이 된다.

### Modified Capabilities

없음. `api-foundation`의 요구사항(공통 오류 형식, 쿠키로 사용자 주입, 공개 경로 허용 목록)은 그대로이고, 검증 함수 계약 확장은 내부 구현이다.

## Impact

- 코드: `src/lib/server/session.ts`, `src/lib/server/api-guard.ts`, `src/hooks.server.ts`, 새 `src/routes/api/auth/*`, 새 Supabase 클라이언트 헬퍼. 기존 단위 테스트 13개 중 검증 함수 계약에 닿는 것을 갱신한다.
- 의존성: `@supabase/supabase-js` 한 개를 추가한다.
- 설정: `supabase/config.toml`의 최소 비밀번호 길이를 8로 맞춘다. `.env.example`의 변수 이름 3개(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)를 쓴다.
- DB: 마이그레이션 변경 없음. 기존 `archi_profiles`, `archi_login_attempts`, `folio_users`를 쓴다.

## Out of Scope

- Zotero 연결(`zotero-connection`), 승인 관리 화면, 로그인 화면(UI).
- 기존 벨루 사용자의 Supabase Auth 이관, 운영(벨루) DB 적용.
- "다른 사용자의 자원 → 404" 시나리오. 논문 API가 있어야 확인할 수 있어서 papers change에서 확인한다.

## Why

Codex 교차검증(`docs/dev/codex-review-report.md`)이 지금까지 만든 명세, DB, 서버, 화면 셸, 인증에서 12건(높음 2, 중간 8, 낮음 2)을 찾았다.
높음 2건은 인증을 뚫는 경로다. 인코딩한 경로(`/%61pi/...`)로 `/api` 보호를 우회할 수 있고, 미승인 계정이 Supabase에서 직접 받은 토큰으로 보호된 API에 접근할 수 있다.
로그인 기능과 이후 기능 API가 이 경계 위에 쌓이므로, 더 쌓기 전에 고친다.

## 지적 검증 결과

보고서의 12건을 코드와 문서로 직접 확인했다. 사실이 아닌 지적은 없고, 아래 2건은 일부만 맞다.

| 지적 | 판정 | 근거 |
|---|---|---|
| 인코딩 경로로 가드 우회 (높음) | 맞음 | `api-guard.ts`의 `isApiPath`와 공개 경로 판정이 인코딩된 `event.url.pathname`을 그대로 쓴다. SvelteKit 라우터는 디코딩해서 연결한다. 보고서가 204를 재현했다. |
| 미승인 계정의 토큰 접근 (높음) | 맞음 | `session.ts`의 `createSessionVerifier`는 `getUser`와 갱신만 하고 `archi_profiles.approved`를 보지 않는다. 승인 검사는 `auth-service.ts`의 `login`에만 있다. |
| 번역문 5000자 인덱스 실패 (중간) | 맞음 | `history.sql`이 `(user_id, source_text)` B-tree를 만든다. 보고서가 4,992자 삽입 실패를 재현했다. |
| 병렬 로그인 제한 초과 (중간) | 맞음 | `login-attempts.ts`가 `isLimited`(조회)와 `recordFailure`(기록)를 따로 호출한다. 같은 IP의 병렬 8건이 모두 통과한 것이 재현됐다. |
| API와 DB 타입 불일치 (중간) | 맞음 | `TranslationRecord.id`는 API가 uuid, DB가 bigint다. `papers.year`는 API가 integer, DB가 text다. `title`은 API가 non-null, DB가 null 허용이다. |
| 세션 30일 의미 (중간) | **일부만 맞음** | 갱신할 때마다 쿠키를 30일로 다시 설정하는 것은 사실이다. 다만 스펙 문구는 "세션은 30일 유지된다"일 뿐 "최대 30일"이 아니다. "최대 30일"은 계획 단계 보고에서 쓴 표현이라 스펙과 직접 모순은 아니고, 의미가 모호한 문제다. |
| CSRF 오류의 공통 형식 위반 (중간) | 맞음 | SvelteKit의 CSRF 검사는 `handle`보다 먼저 실행되어 일반 텍스트 403을 돌려준다. `api-foundation` 스펙은 `/api` 아래 모든 4xx를 JSON으로 요구한다. |
| 비활성 색을 안내문에 사용 (중간) | **일부만 맞음** | `.empty`가 `--color-text-faint`(대비 약 2.89:1)를 쓰는 것은 사실이다. `token-map.md`는 이 색을 비활성 요소 전용으로 적었고, 위반은 사용처에 있다. 값 자체는 문서와 일치한다. |
| 모바일 패널 포커스 관리 없음 (중간) | 맞음 | `AppShell.svelte`는 `menuOpen`, `panelOpen`만 바꾸고 포커스를 옮기거나 되돌리지 않는다. |
| `.env.test` 차단 제외 (중간) | 맞음 | `.gitignore`에 `!.env.test`가 있다. |
| Node·Playwright 준비 단계 부족 (낮음) | 맞음 | Vite는 Node `^20.19.0 \|\| >=22.12.0`을 요구하는데 `setup.md`에 없고 Playwright 설치 절차도 없다. |
| 명세의 공개 경로·오류 우선순위 불일치 (낮음) | 맞음 | `auth` 스펙의 공개 예외에 health가 없다. `api-foundation`의 404·405 시나리오는 인증 전제가 없다. `openapi.yaml`의 번역 설명에는 다른 논문일 때 이력 행을 새로 만든다는 확정 규칙이 없다. |

추가로 `docs/dev/codex-review.md`가 참조하는 `docs/dev/codex-review-auth.md`가 폴더에 없다. 사라진 이유는 확인하지 못했다.

## What Changes

- 인증 가드가 인코딩된 경로를 디코딩한 값으로 `/api`와 공개 경로를 판정하게 한다.
- 보호된 모든 요청에서 `archi_profiles.approved`를 확인한다. 미승인이거나 승인이 취소된 계정은 다음 요청부터 401이다.
- 로그인 시도 제한을 원자적으로 판정해 병렬 요청에도 5번을 넘기지 못하게 한다.
- 프레임워크 CSRF 검사를 자체 Origin 검사로 바꿔 `/api`의 거부도 공통 오류 형식 JSON으로 돌려준다.
- 세션 기간을 "마지막 요청 후 30일"로 스펙에 명시한다(열린 질문).
- 번역 이력의 `id`를 uuid로 하고 원문 인덱스를 해시 인덱스로 바꾸며, 번역문 5000자 전체가 저장되게 한다.
- 논문 `year`와 `title`의 변환 규칙, 번역 이력 규칙을 API 문서에 명시한다.
- `.gitignore`의 `.env.test` 예외를 지운다.
- 안내문 색과 모바일 패널 포커스 관리를 고친다.
- 개발 문서(Node 버전, Playwright 준비)와 Codex 검토 요청서의 참조를 정리한다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `auth`: 승인 확인을 로그인뿐 아니라 보호된 모든 요청으로 넓힌다. 세션 기간의 의미, 로그인 시도 제한의 병렬 처리, 인증 필수 경계의 공개 예외와 인코딩 경로를 바꾼다.
- `api-foundation`: 프레임워크가 먼저 거부한 요청의 오류 형식, 존재하지 않는 경로와 허용되지 않는 메서드 시나리오의 인증 전제, 인코딩된 경로에서의 인증 차단을 바꾼다.

번역 이력의 필드 형식은 스펙이 정하지 않은 값이라 스펙 변경 없이 문서(`openapi.yaml`, `data-model.md`)와 마이그레이션으로 처리한다.

## Impact

- 코드: `src/lib/server/api-guard.ts`, `session.ts`, `auth-service.ts`, `login-attempts.ts`, `src/hooks.server.ts`, `svelte.config.js`, `src/lib/components/AppShell.svelte`, 통합·단위 테스트.
- DB: `supabase/migrations/`의 번역 이력과 함수 마이그레이션(아직 운영에 적용하지 않았으므로 기존 파일을 직접 고친다), `docs/api/data-model.md`.
- 문서: `docs/api/openapi.yaml`, `docs/dev/setup.md`, `docs/dev/codex-review.md`, `.gitignore`.
- 보호된 요청마다 승인 확인 조회가 한 번 늘어난다. 베타 규모에서는 부담이 없다.
- 운영(벨루) DB와 외부 서비스에는 접속하지 않는다.

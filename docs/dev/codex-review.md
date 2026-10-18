# Codex 교차검증 요청서: 지금까지 만든 것 전부

Archi Studio(SvelteKit + TypeScript, 로컬 Supabase)에서 지금까지 만든 명세, DB, 서버, 화면 셸, 인증을
다른 시각으로 검증해 달라는 요청이다. 구현과 문서는 Claude(와 하위 에이전트)가 만들었다.
검토자는 구현 의도에 기대지 말고 스펙·문서·코드를 서로 대조한다.

## 규칙

- **읽기 전용**이다. 파일을 수정하거나 커밋하지 않는다. 고칠 곳은 보고서에만 적는다.
- `.env`, `.env.*`(`.env.example` 제외)는 열지 않는다. 로컬 키 값이 들어 있다.
- 운영 DB와 외부 서비스에 접속하지 않는다. 벨루·폴리오 폴더(`/home/joon/workspace/veloo.2joon.com`, `/home/joon/workspace/zotero-folio`)는 읽기만 한다.
- DB가 필요 없는 명령은 마음대로 실행해도 된다: `openspec validate --specs --strict`(먼저 `nvm use 20`), `npm run check`, `npm test`, `npm run build`, `npm run check:tokens`.
- `npm run test:auth`는 로컬 Supabase(Docker, 메모리 약 1.7GiB, 첫 시작 3~4분)가 필요하다. 정적 검토를 먼저 하고, 실행이 필요하면 `docs/dev/setup.md`의 순서를 따르고 끝나면 `npm run db:stop`을 실행한다.
- 확인하지 못한 것은 추측하지 말고 "확인하지 못했다"고 쓴다.

## 저장소 지도

| 영역 | 경로 |
|---|---|
| 배경과 결정 | `ARCHI-STUDIO-HANDOFF.md`(5절 확정 결정) |
| 메인 스펙 10개 | `openspec/specs/*/spec.md` |
| 보관된 change | `openspec/changes/archive/*/`(design.md, proposal.md, tasks.md) |
| 진행 중 change | `openspec/changes/archi-studio-auth/` |
| API 문서 | `docs/api/openapi.yaml`, `data-model.md`, `legacy-map.md` |
| DB | `supabase/migrations/*.sql`, `supabase/config.toml` |
| 서버 | `src/hooks.server.ts`, `src/lib/server/`, `src/routes/api/` |
| 화면 셸 | `src/lib/components/AppShell.svelte`, `src/lib/styles/tokens.css`, `src/routes/+layout.svelte`, `+page.svelte` |
| 디자인 문서 | `docs/design/token-map.md`, `scripts/check-tokens.mjs`, `scripts/shell-screens.mjs` |
| 개발 문서 | `docs/dev/setup.md`, `auth-test-map.md`, `codex-review-auth.md` |

## 작업 A. 명세와 문서의 일관성

1. `openapi.yaml`의 경로 20개(메서드 기준 작업 23개)가 메인 스펙 7개(`auth`, `zotero-connection`, `papers`, `paper-notes`, `translation`, `paper-analysis`, `briefing`)와 하나씩 일치하는지: 경로, 메서드, 상태 코드, 오류 코드, 필드 이름.
2. 아래 결정이 모든 문서에서 같은 말을 하는지(어긋난 곳은 파일:줄로): 논문은 내부 UUID로 가리킨다 / 논문 삭제 시 번역·분석 이력도 함께 삭제 / `POST /api/translate`는 선택 값 `paperId`를 받고 같은 문장도 다른 논문이면 이력 행을 새로 만든다 / 오류 형식은 `{error:{code,message}}` 하나 / 스트리밍은 `text/plain` / 쿠키는 `archi_session`.
3. `data-model.md`의 새 테이블 11개가 스펙의 모든 응답 필드를 설명하는지, 컬럼 없이 응답에만 있는 필드와 응답 없이 컬럼만 있는 필드를 나눠 적는다.
4. `legacy-map.md`가 폴리오 `/api/*` 17개 그룹과 벨루 라우트를 빠짐없이 다루는지, 실제 `server/server.js`와 `server/app/*.py`의 라우트와 대조한다.
5. `HANDOFF.md` 5절의 확정 결정과 스펙 사이에 모순이 있는지.
6. `openspec validate --specs --strict`가 통과하는지, 메인 스펙에 델타 헤더(`## ADDED` 등)가 남아 있지 않은지.

## 작업 B. DB 마이그레이션

1. `supabase/migrations/*.sql` 6개가 `data-model.md`와 컬럼, 타입, null 허용, 기본값, 고유 제약, 외래 키, 인덱스까지 일치하는지.
2. `on delete cascade` 방향이 "논문 삭제 → 번역·분석 이력 삭제", "사용자 삭제 → 그 사용자의 모든 행 삭제"와 맞는지. 지워지면 안 되는 행이 연쇄로 지워지는 경로가 있는지.
3. 새 테이블 11개 모두 RLS가 켜져 있고, 서비스 키 없이 접근할 수 없는지. 정책이 없는 테이블이 의도된 것인지.
4. 기존 벨루 테이블(`/home/joon/workspace/veloo.2joon.com/server/schema.sql`의 6개)과 이름이 겹치거나, 그것을 alter/drop/insert/참조하는 문장이 없는지.
5. 마이그레이션 적용 순서(참조 대상이 먼저 생성되는지), 같은 이름 테이블이 이미 있는 DB에서 실패하는 동작, `auth.users` 외래 키의 가정이 운영 DB에서도 성립하는지.

## 작업 C. 서버 기반

1. `src/hooks.server.ts`와 `api-guard.ts`: 공개 경로 허용 목록(`GET /api/health`, `POST /api/auth/signup`, `POST /api/auth/login`) 밖의 `/api` 요청은 모두 401인지, 허용 목록 우회(대소문자, 끝 슬래시, 인코딩된 경로, `//`, HEAD/OPTIONS) 경로가 있는지.
2. 404 `not_found`, 405 `method_not_allowed`, 500 `internal_error`가 스택·내부 정보 없이 공통 오류 형식으로 나가는지. 미인증 상태의 없는 경로는 404가 아니라 401인데(경로 존재 여부 은닉을 위한 의도), 스펙 시나리오와 충돌하는지 판단한다.
3. `GET /api/health`가 사용자·DB 정보를 노출하지 않는지.
4. 단위 테스트 24개가 위 동작을 실제로 검증하는지(이름만 맞고 단정문이 약한 테스트 가려내기).

## 작업 D. 화면 셸과 디자인 토큰

1. `AppShell.svelte`: 1280px 3열, 768px 미만에서 두 패널 접힘, 버튼·겹침·Escape로 열고 닫기, 390px에서 가로 스크롤 없음. 접근성: 포커스 이동과 복귀, `aria-*`, 키보드 조작, 접힌 패널이 스크린리더·탭 순서에서 빠지는지.
2. `tokens.css`: 라이트·다크 토큰 이름 16개씩 일치, 셸과 라우트 스타일에 `#hex`, `rgb()` 직접 지정이 없는지(`grep`), 다크가 `prefers-color-scheme`만 따르는 것이 `app-shell` 스펙과 맞는지.
3. `docs/design/token-map.md`의 값이 `tokens.css`와 같은지, 벨루(`web/src/shared/styles/index.css`)·폴리오(`web/src/app.css`) 원본 값이 문서에 정확히 옮겨졌는지(샘플 10개 이상 대조).
4. 문서가 주장한 다크 대비비(본문 13.9, 포인트 6.1, 비활성 4.7)를 직접 다시 계산하고, 라이트 비활성 글자 대비 2.9가 WCAG 기준에서 문제인지 판단한다.
5. `scripts/check-tokens.mjs`가 일부러 한쪽 토큰을 빼면 실제로 실패하는지.

## 작업 E. 개발 환경과 저장소 위생

1. 비밀값: `git log -p`와 작업 트리 전체에서 키 형태 문자열(JWT, `sb_secret_`, `service_role` 값 등)이 없는지. `.gitignore`가 `.env*`, `node_modules`, `build`, `.svelte-kit`, `supabase/.temp`를 막는지.
2. `package.json`: 의존성이 스펙과 설계가 허용한 범위인지(Tailwind 미사용, 전역 설치 없이 Supabase CLI·Playwright가 devDependency), 사용되지 않는 의존성이 있는지, SvelteKit 2.x 고정 근거(Node 20)가 맞는지.
3. `docs/dev/setup.md`: 문서 순서대로 처음부터 따라 하면 재현되는지(실행하지 않고도 빠진 단계를 찾을 수 있으면 찾는다). `scripts/shell-screens.mjs`가 이 서버 밖에서도 실행되는지.
4. `git log`의 커밋 메시지가 실제 변경 내용과 맞는지, 한 커밋에 무관한 변경이 섞였는지.
5. `.env.example`의 변수 이름이 코드와 문서가 요구하는 변수와 일치하는지(알려진 불일치: `SUPABASE_JWT_SECRET`이 빠져 있다).

## 작업 F. 인증 구현

`docs/dev/codex-review-auth.md`의 작업 1~3(보안 검토, 스펙·코드 대조, 동시성과 경계 사례)을 그대로 수행한다. 그 문서의 "이미 알려진 사항"도 여기에 적용한다.

## 이미 알려진 사항(재보고 불필요, 의견은 환영)

- `GET /api/auth/me`는 요청마다 `admin.getUserById`를 한 번 더 호출한다.
- 승인을 취소해도 이미 발급된 세션은 최대 30일 유지된다.
- "다른 사용자의 자원 → 404" 시나리오는 papers change에서 검증한다.
- Node 20에서 전역 `WebSocket`이 없어 `supabase-options.ts`로 우회했다.
- 스크린샷 검증은 이 서버에 폰트가 없어 글자 없이 영역과 색만 눈으로 확인했다.
- 다크 값 12개와 오른쪽 패널 폭 320px은 두 앱에 없어 새로 정한 값이다.

## 보고 형식

심각도 순으로 정렬한다. 각 항목은 아래 형식을 지킨다.

```
[심각도: 높음|중간|낮음] 한 줄 요약 (영역 A~F)
- 위치: 파일:줄
- 근거: 코드나 스펙의 어느 부분과 어긋나는지
- 재현: 입력 → 기대 결과 → 실제 결과 (정적 검토면 "코드 추론")
- 제안: 고칠 방향 한 줄
```

마지막에 영역별(A~F)로 "문제 없음으로 확인한 항목"과 "확인하지 못한 것"을 따로 적는다.

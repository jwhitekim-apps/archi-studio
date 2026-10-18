# Codex 지적 수정 내역 표

`docs/dev/codex-review-report.md`(Codex 교차검증 보고서)가 지적한 12건과 사라진 파일 1건을 어디서 어떻게 고쳤고,
무엇으로 확인했는지 정리한 표다. 이 문서를 처음 보는 사람도 읽을 수 있게 지적을 한 문장으로 풀어 썼다.
표의 "검증"에 적은 테스트 이름은 실제 테스트 파일에 있는 이름이다.
`npm test`는 단위 테스트, `npm run test:auth`는 로컬 DB를 쓰는 통합 테스트다.

| # | 심각도 | 지적 (무엇이 문제였나) | 수정한 위치 | 검증한 테스트나 명령 |
|---|---|---|---|---|
| 1 | 높음 | 주소를 `/%61pi/auth/logout`처럼 퍼센트 인코딩해서 보내면 `/api` 인증 검사를 건너뛰고 로그아웃이 실행됐다. | `src/lib/server/api-guard.ts`(SvelteKit 라우터와 같은 방식으로 디코딩한 경로로 `/api` 여부와 공개 경로를 판정) | `api-guard.test.ts`의 `1.1 퍼센트 인코딩된 경로로 보호를 우회할 수 없다` 그룹 5개 테스트. 빌드한 서버에 `curl -si -X POST http://127.0.0.1:4173/%61pi/auth/logout`이 401인지(task 1.2) |
| 2 | 높음 | 승인되지 않은 계정이 Supabase에서 직접 받은 토큰을 쿠키 형식으로 보내면 `GET /api/auth/me`가 200을 돌려줬다. 승인 확인이 로그인 함수에만 있었다. | `src/lib/server/session.ts`(`createSessionVerifier`가 보호 요청마다 `archi_profiles.approved`를 조회), `src/lib/server/session.integration.ts`(검증기 생성 호출 갱신) | `session.test.ts`의 `1.3 매 요청 승인 확인 (createSessionVerifier)` 그룹 7개. `auth.integration.ts`의 `1.4 직접 발급받은 Supabase 토큰과 승인 확인` 그룹(`미승인 계정이 직접 받은 토큰은 401, 승인하면 200, 승인을 취소하면 다음 요청부터 401`, `승인 행이 없는 계정의 토큰도 401`) |
| 3 | 중간 | 허용 최대 길이(5,000자)에 가까운 번역 원문은 검색용 색인(DB의 목차)에 들어가지 않아 저장에 실패했다. | `supabase/migrations/20261018000400_history.sql`(원문 색인을 `(user_id, md5(source_text))`로 바꾸고 `archi_translations.id`를 uuid로) | task 2.4의 SQL 확인: `db:reset` 뒤 압축되지 않는 5,000자 원문 삽입이 성공. 자동 테스트는 없다(번역 저장 코드가 아직 없다). |
| 4 | 중간 | 같은 곳에서 틀린 로그인을 동시에 8번 보내면 실패 횟수를 세는 사이에 서로 끼어들어 5번 제한이 걸리지 않았다. | `supabase/migrations/20261018000600_functions.sql`(`archi_reserve_login_attempt`, `archi_release_login_attempt`, 같은 IP는 advisory lock으로 한 번에 하나씩), `src/lib/server/login-attempts.ts`, `src/lib/server/auth-service.ts` | `auth.integration.ts`의 `같은 IP의 틀린 로그인 8건이 동시에 와도 401은 5건, 나머지 3건은 429`, `실패 4번 뒤 성공한 로그인은 횟수를 늘리지 않는다`, `release는 예약 행을 지운다`, `예약할 때 24시간 지난 행이 지워진다` |
| 5 | 중간 | API 문서와 DB 정의의 타입이 달랐다. 번역 이력 `id`는 문서에서 uuid인데 DB에서 bigint였고, 논문 `year`는 문서에서 정수인데 DB에서 문자열이었고, `title`은 DB에서 null이 가능했다. | `docs/api/openapi.yaml`(`TranslationRecord.id`는 uuid, `year`는 처음 나오는 네 자리 숫자를 정수로 변환), `docs/api/data-model.md`(`archi_translations.id` uuid, `title`이 null이면 응답에서는 빈 문자열), `supabase/migrations/20261018000400_history.sql` | `npx @redocly/cli lint docs/api/openapi.yaml`(경고만 있고 오류 없음), `grep -n "네 자리" docs/api/openapi.yaml docs/api/data-model.md` |
| 6 | 중간 | 문서의 "세션 최대 30일"과 달리, 토큰이 갱신될 때마다 쿠키 기간이 다시 30일로 늘어나서 의미가 모호했다. | `docs/api/openapi.yaml`(세션은 "마지막 요청 후 30일"이고 승인은 요청마다 확인한다고 통일), 이 change의 `specs/auth/spec.md` 델타 | `session-cookie.test.ts`의 `httpOnly, SameSite=Lax, 30일, path=/`. `api-guard.test.ts`의 `검증이 renewedToken을 돌려주면 archi_session 쿠키를 새 값과 속성으로 다시 설정한다` |
| 7 | 중간 | 다른 출처에서 온 폼 형식 요청은 SvelteKit 내장 CSRF 검사가 먼저 거부해서, `/api`에서도 공통 오류 형식이 아닌 일반 텍스트 403이 나갔다. | `svelte.config.js`(내장 검사를 끔), `src/lib/server/csrf.ts`(같은 조건의 검사를 직접 구현), `src/lib/server/api-guard.ts`, `src/lib/server/errors.ts`(`forbidden_origin` 추가) | `api-guard.test.ts`의 `2.2 CSRF: 다른 출처의 폼 형식 쓰기 요청` 그룹 10개(다른 출처, Origin 없음, 같은 출처, JSON 본문, 폼 Content-Type 종류, 쓰기 메서드, 인증보다 먼저 거부, 일반 텍스트 403 유지, 인코딩 경로). 빌드한 서버 curl 확인(task 2.2) |
| 8 | 중간 | 설정 패널의 안내문이 비활성 컨트롤 전용 연한 글자색을 써서 흰 바탕과 대비가 2.885:1이었다(일반 글자는 4.5:1 이상 필요). | `src/lib/components/AppShell.svelte`(`.empty`를 `--color-text-muted`로 변경) | `grep -rn "text-faint" src`(정의 두 줄 외에 사용처 없음), `npm run check:tokens`(라이트·다크 토큰 이름 누락 0건). 대비 계산값은 task 2.7 보고에 있다. |
| 9 | 중간 | 모바일에서 패널을 열고 닫을 때 포커스를 옮기거나 되돌리지 않아서, 키보드 사용자는 패널 안으로 들어가지도, 닫은 뒤 원래 위치로 돌아오지도 못했다. | `src/lib/components/AppShell.svelte`(열면 패널 첫 요소로 포커스, 닫으면 연 버튼으로 복귀, 열린 동안 본문 `inert`), `scripts/shell-screens.mjs`(포커스 검사 추가) | `node scripts/shell-screens.mjs`의 검사: `390 메뉴 열기 → 포커스가 메뉴 안`, `390 메뉴 열린 동안 배경 요소에 포커스 불가`, `390 메뉴 닫기 버튼 → 메뉴 열기 버튼으로 복귀`, `390 배경 면 클릭 → 메뉴 열기 버튼으로 복귀`, `390 접힌 패널은 탭 순서에 없음` |
| 10 | 중간 | `.gitignore`가 `.env.test`를 무시 대상에서 빼 두어서, 비밀값이 든 `.env.test`가 실수로 커밋될 수 있었다. | `.gitignore`(`!.env.test` 줄 삭제) | `git check-ignore --no-index .env.test`가 파일 이름을 출력, `git ls-files \| grep '^\.env'`가 `.env.example`만 출력 |
| 11 | 낮음 | 개발 문서에 Node 요구 버전과 Playwright(화면 검사용 브라우저) 설치 절차가 없어서 새 환경에서 화면 검사가 실행되지 않았다. | `docs/dev/setup.md`(`## 화면 셸 검증`의 1. Node, 2. Chromium, 3. 시스템 라이브러리, 4. 실행) | 문서의 명령만 따라 개발 서버(포트 5273)에서 `node scripts/shell-screens.mjs` 실행(task 3.1 보고) |
| 12 | 낮음 | 명세가 일관되지 않았다. 공개 경로 목록에 health가 빠졌고, "없는 경로는 404" 시나리오가 인증 전제를 생략했으며, OpenAPI에는 번역 이력 추가 규칙이 없었다. | 이 change의 `specs/auth/spec.md`(`인증 필수 경계`)와 `specs/api-foundation/spec.md`(`인증되지 않은 요청 차단`) 델타, `docs/api/openapi.yaml`(공개 경로 안내와 번역 이력 규칙) | `openspec validate archi-studio-review-fixes --strict`, `api-guard.test.ts`의 `목록에 없는 새 /api 경로는 기본적으로 보호된다`, `쿠키 없이 200 {"status":"ok"}이고 사용자·DB 정보가 없다` |
| 13 | (파일) | 요청서가 참조한 `docs/dev/codex-review-auth.md`가 폴더에 없었다. | `docs/dev/codex-review.md`(`## 작업 F. 인증 구현`에 그 문서의 작업 1~3과 알려진 사항을 직접 적고 참조를 삭제) | `grep -rn "codex-review-auth" docs/dev`가 `codex-review-report.md`의 과거 기록 한 줄 외에는 없음 |

## 수정하지 않고 넘긴 것

- **디코딩이 깨진 경로의 오류 형식**: 로그인한 사용자가 `/api/%E0%A4%A` 같은 경로를 보내면 SvelteKit이 일반 텍스트 400을 돌려준다. 인증 우회가 아니라 오류 형식 문제라 이번 범위 밖으로 두었다.
- **번역 캐시 조회**: 해시 색인을 타려면 `md5(source_text) = md5(x) and source_text = x` 형태의 SQL 함수(rpc)가 필요하다. 번역 기능을 구현하는 change에서 만든다.
- **번역 원문 해시 충돌**: 실제 md5 충돌은 재현하지 않았고, 해시만 같고 원문이 다른 조회가 걸러지는 동작만 확인했다.
- **미리보기 서버 방식의 화면 검사**: `docs/dev/setup.md`의 방법 A(빌드한 미리보기, 포트 4173)는 다른 작업이 빌드 폴더를 쓰고 있어 실행해 보지 못했다. 개발 서버(방법 B)로만 확인했다.
- **글자 렌더링**: 이 서버에는 글꼴이 없어 스크린샷에 글자가 보이지 않는다. 글자 존재는 DOM 검사로 대신했다.

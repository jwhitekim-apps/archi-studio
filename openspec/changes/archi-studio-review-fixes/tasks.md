# Tasks

## 1. 인증 경계 (높음)

- [x] 1.1 `api-guard.ts`에 `routePath`(SvelteKit과 같은 `%25` 분할 `decodeURI`)를 넣기 전에 회귀 테스트를 먼저 추가해 `npm test`에서 실패하는 것을 확인한다. 수정 뒤에는 쿠키 없이 `POST /%61pi/auth/logout`, `GET /%61pi/papers`, `GET /api/%E0%A4%A`가 모두 401 `unauthenticated`이고 `GET /api/%68ealth`(디코딩하면 공개 경로)는 200이며 `npm test`가 전부 통과한다
- [x] 1.2 `npm run build` 뒤 `PORT=4173 ORIGIN=http://127.0.0.1:4173 node build`로 서버를 띄우고 `curl -si -X POST http://127.0.0.1:4173/%61pi/auth/logout`이 204가 아니라 401과 공통 오류 본문을 돌려주는지, 일반 `/api/auth/logout`도 쿠키 없이 401인지 확인한 뒤 서버를 종료한다
- [x] 1.3 `createSessionVerifier`가 `isApproved(userId)`를 받아 `getUser`와 갱신 성공 뒤 `archi_profiles.approved`를 확인하게 하고, 승인 행이 없거나 `false`면 `null`, 조회 오류면 예외가 되는지 가짜 클라이언트 단위 테스트로 확인한 뒤 `npm test`가 통과한다
- [x] 1.4 `npm run db:start`가 떠 있는 상태에서 `npm run test:auth`에 통합 테스트를 추가해, 미승인 계정이 Supabase 비밀번호 로그인으로 직접 받은 토큰 쌍을 `archi_session` 형식으로 보내면 `GET /api/auth/me`가 401이고, SQL로 `approved=true`로 바꾸면 200, 다시 `false`로 바꾸면 다음 요청이 401인지(승인 취소 즉시 반영) 확인한다. 기존 22개 통합 테스트도 모두 통과한다

## 2. 중간 항목

- [x] 2.1 `20261018000600_functions.sql`에 `archi_reserve_login_attempt`와 `archi_release_login_attempt`를 추가하고 `login`이 예약, 실패 시 유지, 성공·미승인·예외 시 해제로 쓰게 한 뒤, `db:reset` 후 `npm run test:auth`로 같은 IP의 틀린 로그인 8건 동시 요청이 401 5건과 429 3건이고, 순차 6번째가 429이며, 실패 4번 뒤 성공한 로그인이 횟수를 늘리지 않고, 24시간 지난 행이 지워지는지 확인한다
- [x] 2.2 `svelte.config.js`의 내장 CSRF 검사를 끄고(어느 설정이 2.70.3에서 동작하는지 빌드한 서버의 curl로 먼저 확인) `hooks.server.ts`에 프레임워크와 같은 조건의 Origin 검사를 넣은 뒤, 출처 같음·다름·없음 × 폼·JSON 본문 × 쓰기 메서드 표 테스트를 `npm test`로 통과시킨다. 빌드한 서버에서 `curl -si -X POST -H 'Origin: http://evil.example' -H 'Content-Type: application/x-www-form-urlencoded' -d 'a=1' http://127.0.0.1:4173/api/auth/login`이 403과 `error.code`가 `forbidden_origin`인 JSON이고, 같은 요청을 `/`로 보내면 지금과 같은 일반 텍스트 403이다
- [x] 2.3 열린 질문 1의 결정에 따라 세션 기간을 스펙, `openapi.yaml`, `data-model.md`, 코드 주석에서 같은 표현으로 맞추고(기본안: 마지막 요청 후 30일), `grep -rn "최대 30일" openspec/specs docs/api src`가 0건(보관 문서, Codex 보고서 원문, 이 change의 인용 문장은 제외)이며 갱신 때 쿠키 `Max-Age`가 2592000으로 다시 설정되는 기존 단위 테스트가 `npm test`에서 통과한다
- [x] 2.4 `20261018000400_history.sql`에서 `archi_translations.id`를 `uuid default gen_random_uuid()`로, 원문 인덱스를 `(user_id, md5(source_text))`로 바꾸고 번역 캐시 조회가 `source_text` 일치도 확인하게 한 뒤, `db:reset` 후 압축되지 않는 5,000자 원문 삽입이 성공하고 같은 원문 조회가 해시 인덱스를 타며(`explain`) 다른 원문과 해시가 겹쳐도 잘못된 결과를 돌려주지 않는지 통합 테스트로 확인한다
- [x] 2.5 `openapi.yaml`과 `data-model.md`에 `TranslationRecord.id` uuid, `year` 정규화 규칙(처음 나오는 네 자리 숫자, 없으면 null), `title` null → 빈 문자열 규칙, `forbidden_origin` 오류 코드, 번역 설명의 "같은 문장도 다른 논문이면 이력 행을 새로 만든다", 공개 경로에 `GET /api/health`를 적고, `npx --yes @redocly/cli lint docs/api/openapi.yaml`이 오류 0건이며 `grep -n bigint docs/api/data-model.md`에 번역 이력 `id`가 남지 않는다
- [x] 2.6 `.gitignore`에서 `!.env.test`를 지우고 `git check-ignore --no-index .env.test`가 `.env.test`를 출력하는지, `git ls-files | grep '^\.env'`가 `.env.example`만 출력하는지 확인한다
- [x] 2.7 `AppShell.svelte`의 `.empty` 색을 보조 글자 토큰으로 바꾸고 `grep -rn "text-faint" src`로 비활성 컨트롤 밖 사용처를 모두 찾아 고친 뒤, 라이트·다크 패널 면 대비를 계산한 값이 모두 4.5:1 이상이며 `npm run check:tokens`가 누락 0건이고 셸 스타일에 직접 색 지정이 없음을 `grep`으로 확인한다
- [x] 2.8 모바일 패널이 열릴 때 패널 안 첫 포커스 가능한 요소로 포커스를 옮기고 닫을 때(버튼, 스크림, Escape) 연 버튼으로 되돌리며 열린 동안 나머지 영역을 `inert`로 두게 하고, `scripts/shell-screens.mjs`에 포커스 검사를 더해 `setup.md`의 절차로 실행했을 때 열기 → 포커스가 패널 안, Escape → 열기 버튼으로 복귀, 열린 동안 배경 요소에 포커스 불가가 라이트·다크 모두 통과한다

## 3. 문서 정리

- [x] 3.1 `docs/dev/setup.md`에 Node 요구 버전(`^20.19.0 || >=22.12.0`), `npx playwright install chromium`, 시스템 라이브러리가 없을 때의 준비 절차(이 서버에서 쓴 `apt-get download`로 받은 패키지를 임시 폴더에 풀고 `LD_LIBRARY_PATH`로 쓰는 방법)를 적고, 문서의 명령만 따라 `node scripts/shell-screens.mjs`가 통과하는지 확인한다
- [x] 3.2 `docs/dev/codex-review.md`의 작업 F에 사라진 `codex-review-auth.md`의 작업 1~3과 "이미 알려진 사항"을 직접 적어 `grep -rn "codex-review-auth" docs/dev`가 `codex-review-report.md`의 과거 기록 한 줄 외에는 0건이다

## 4. 마무리

- [x] 4.1 `npm run db:reset` 후 `npm run check`, `npm test`, `npm run test:auth`, `npm run build`, `npm run check:tokens`, `openspec validate archi-studio-review-fixes --strict`, `openspec validate --specs --strict`가 모두 통과하고 끝나면 `npm run db:stop`으로 로컬 DB를 내린다
- [x] 4.2 `docs/dev/review-fixes-map.md`에 보고서 12건과 사라진 파일 1건을 "지적, 수정 위치, 검증한 테스트나 명령" 표로 만들고 13행이 모두 채워졌는지, 적힌 테스트 이름이 실제 파일에 있는지 `grep`으로 대조한다

## Workflow follow-up

- 구현이 끝나면 `/opsx:archive`로 보관해 `auth`, `api-foundation` 메인 스펙에 델타를 합친다. `archi-studio-auth`를 먼저 보관해 두면 `auth` 델타가 현재 메인 스펙 위에 정확히 얹힌다(`archi-studio-auth`는 `skip_specs`라 스펙은 바뀌지 않는다).
- 열린 질문 4개는 `/opsx:apply` 전에 답을 받는다. 답에 따라 2.2, 2.3, 2.4, 1.3의 세부가 바뀔 수 있다.

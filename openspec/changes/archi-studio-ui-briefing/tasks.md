# Tasks

## 1. 준비

- [x] 1.1 선행 change가 만든 것을 확인한다: `npm run db:start` 뒤 승인된 계정으로 로그인한 쿠키로 `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:<포트>/api/briefings`가 200이고, `/api/papers/{id}`가 200이며, 공통 화면 부품(카드, 빈 상태, 오류 안내, 버튼)과 `/login?next=` 로그인 화면이 코드에 있는지 `ls src/lib/components`와 `grep -rn "next" src/routes/login`으로 확인한다. 하나라도 없으면 이 change에서 대신 만들지 말고 구현을 멈춰 어느 선행 change가 먼저인지 보고한다
  - 메모(2026-10-25): 실제 API로 `/api/briefings` 200, `/api/papers/{id}` 200을 Playwright 요청으로 확인했다.
  - 메모(구현): 선행 브리핑 API가 아직 main에 없어(다른 작업에서 병렬 구현 중) 실제 `/api/briefings` 200 확인은 못 했다. 공통 부품(`src/lib/components/ui`)과 로그인 화면은 있다. 단 돌아올 주소 파라미터는 `next`가 아니라 기존 `redirect`(`loginUrl`, `safeRedirect`)라 그것을 따랐다.
- [x] 1.2 `scripts/seed-briefings.mjs`를 만든다. 로컬 DB에만 연결하고(`SUPABASE_URL`이 `127.0.0.1` 또는 `localhost`가 아니면 아무것도 쓰지 않고 오류로 끝난다), 승인된 시험 계정(비밀번호는 환경 변수 `SEED_PASSWORD`에서 읽고 저장소에 적지 않는다)에 브리핑 35건(`limit` 기본값 30을 넘는 수), 본문에 `<script>alert(1)</script>`가 든 1건, 공백 없는 120자 주소가 든 1건, 시험용 논문 2편을 언급한 1건, 논문 언급이 없는 1건을 넣는다. 확인: 두 번 연속 실행해도 SQL `select count(*) from archi_briefings`가 같은 값이고 `archi_briefing_papers`가 2행이며, `SUPABASE_URL=https://example.com`으로 실행하면 DB에 아무 행도 생기지 않고 비정상 종료한다
  - 메모: 평범한 35건 + 특별한 본문 3건 = 38건과 빈 계정(`briefing-empty@example.com`)을 넣는다. 두 번 실행해도 38건, 연결 2행, `https://example.com`이면 종료 코드 1이고 행 변화 없음을 로컬 DB로 확인했다.

## 2. 목록 화면

- [x] 2.1 `src/routes/log/+page.server.ts`와 `+page.svelte`를 만들어 최신순 목록(날짜, 요약, 상세 링크)과 "더 보기"를 구현한다. 확인: 시험 계정으로 `/log`를 열면 맨 위가 가장 최근 날짜이고 30건이 보이며 "더 보기"를 누르면 나머지가 이어 붙어 총 35건이 되고 같은 `id`가 두 번 나오지 않으며 마지막 묶음 뒤에는 버튼이 사라지는 것을 Playwright로 확인한다. `npm test`에 `load`의 단위 테스트(가짜 `fetch`로 정상, `nextCursor`, 빈 목록)를 더해 통과시킨다
  - 메모(구현 조정): 기존 화면(`(app)/library`)과 같이 `src/routes/(app)/log/+page.ts`(`ssr = false`, `apiFetch`)로 만들었다. 데이터 함수는 `src/lib/briefing.ts`, 단위 테스트는 `src/lib/briefing.test.ts`. Playwright 확인은 실제 API가 없어 `scripts/ui-screens.mjs`의 `briefing` 묶음(가짜 응답)으로 했다.
- [x] 2.2 빈 상태, 불러오는 중, 오류 상태를 만든다. 확인: 브리핑이 없는 시험 계정으로 `/log`를 열면 "아직 브리핑이 없어요" 안내만 보이고 "더 보기"가 없으며, Playwright의 `page.route`로 "더 보기" 요청을 500으로 바꾸면 오류 안내와 "다시 시도" 버튼이 보이고 버튼을 누르면 같은 요청이 다시 나가며, 상태 안내에 `role="status"` 또는 `role="alert"`가 있는지 확인한다. `load`가 500을 받는 경우의 단위 테스트(가짜 `fetch`)도 `npm test`에 더한다
  - 메모: 가짜 응답으로 확인. 실제 빈 계정 확인은 브리핑 API가 main에 들어온 뒤 한다.

## 3. 상세 화면

- [x] 3.1 `src/routes/log/[id]/+page.server.ts`와 `+page.svelte`를 만들어 날짜, 요약, 본문, 목록으로 돌아가는 링크를 보여 준다. 날짜는 문자열에서 가공하는 함수로 만들고 단위 테스트로 `2026-10-18`이 `2026년 10월 18일 일요일`이 되는지를 `TZ=UTC`와 `TZ=America/Los_Angeles` 양쪽에서 확인한다. 본문은 `{값}`으로만 그린다. 확인: `grep -rn "@html" src/routes/log`가 0건이고, 본문에 `<script>`가 든 시험 브리핑을 열면 글자가 그대로 보이며 `page.on('dialog')`가 한 번도 호출되지 않고, 폭 390px에서 120자 주소가 든 브리핑을 열었을 때 `document.documentElement.scrollWidth`가 `clientWidth`를 넘지 않는다. 없는 `id`는 "찾을 수 없음"과 `/log` 링크가 보이는지도 확인한다
  - 메모: 경로는 `src/routes/(app)/log/[id]/`. 날짜 테스트는 `TZ=UTC`와 `TZ=America/Los_Angeles` 양쪽에서 통과.
- [x] 3.2 언급된 논문의 제목 링크를 만든다. 상세 `load`가 `paperIds`마다 `GET /api/papers/{id}`를 병렬로 부르고(최대 20편, 넘으면 "외 N편"), 제목을 못 가져오면 "제목을 불러오지 못한 논문", 404면 목록에서 제외, 빈 제목이면 "제목 없는 논문"으로 보인다. 확인: 가짜 `fetch`로 정상, 한 건 실패, 한 건 404, 빈 제목, 25편 경우를 `npm test`로 검증하고, Playwright로 시험 브리핑의 논문 링크 `href`가 `/papers/{그 논문 id}`와 같은지, 논문 언급이 없는 브리핑에는 링크 영역이 없는지 확인한다

## 4. 연동

- [x] 4.1 로그인 이동과 토큰 갱신을 확인한다. `load`가 401을 받으면 `/login?next=<원래 경로>`로 `redirect`하게 한다. 확인: 쿠키 없는 브라우저에서 `/log/{id}`를 열면 주소가 `/login?next=%2Flog%2F{id}`가 되고 로그인에 성공하면 같은 상세가 열리며, `next=https://example.com`으로 로그인하면 바깥 주소로 가지 않고, 접근 토큰이 만료된 쿠키(시험에서 만료 토큰으로 바꾼 값)로 `/log`를 열면 정상으로 보이면서 브라우저에 새 `archi_session` 쿠키가 도착하는지 확인한다. 쿠키가 도착하지 않으면 `design.md` 결정 2의 대안(브라우저에서 불러오기)으로 바꾸고 이유를 기록한다
  - 메모: 로그아웃 상태로 `/log/{id}`를 열면 `/login?redirect=%2Flog%2F{id}`로 가는 것은 확인했다(파라미터 이름은 기존 `redirect`). 로그인 뒤 같은 상세 열기, 만료 토큰 갱신 쿠키 도착은 실제 브리핑 API가 없어 확인하지 못했다. 서버 load가 아니라 브라우저 load(기존 화면 방식)라 갱신 쿠키는 브라우저 요청에 바로 실린다.
  - 메모(2026-10-25, 실제 API): 쿠키 없이 `/log/{id}` → `/login?redirect=%2Flog%2F{id}`, 로그인 뒤 같은 상세, `redirect=https://example.com`이면 `/library`에 머묾, 만료 토큰(로컬 JWT 비밀로 exp를 과거로 서명) 쿠키로 `/log` 정상 표시와 새 `archi_session` 도착을 확인했다. 대안은 필요 없었다.
- [x] 4.2 셸 연동을 만든다. `/log` 계열 화면에서 `AppShell`의 `hasPanel`을 끄고 왼쪽 메뉴 "브리핑"이 `/log`를 가리키고 `aria-current="page"`를 갖게 한다. 확인: Playwright로 폭 1280px에서 오른쪽 패널이 보이지 않고 작업 영역이 폭을 이어받으며, 메뉴의 "브리핑"을 누르면 `/log`가 열리고 `aria-current`가 붙으며, 목록과 상세 화면에서 브리핑을 추가·수정·삭제하는 버튼이 없음(버튼 이름 목록을 출력해 확인)을 확인한다

## 5. 마무리

- [x] 5.1 `scripts/briefing-screens.mjs`(기존 `scripts/shell-screens.mjs`와 같은 방식)를 만들어 폭 1280px와 390px, 라이트와 다크 각각에서 목록, 상세, 빈 상태, 오류 상태의 스크린샷을 스크래치패드에 저장하고 키보드 `Tab`만으로 목록 항목과 "더 보기"에 닿는지 확인한다. 확인: 스크립트가 종료 코드 0이고 모든 검사 줄이 `OK`이며 저장된 스크린샷을 직접 열어 영역 구분과 색을 눈으로 확인하고, `grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(' src/routes/log src/lib/components`에 이 change가 만든 직접 색 지정이 없으며 `npm run check:tokens`가 누락 0건이다
  - 메모(조정): 별도 `scripts/briefing-screens.mjs` 대신 기존 `scripts/ui-screens.mjs`에 `briefing` 묶음을 더했다(로그인·`mockApi`를 같이 쓰기 위해). 검사 31줄 모두 OK.
- [x] 5.2 `docs/dev/setup.md`에 시험 데이터 넣는 방법(`db:start`, `SEED_PASSWORD` 지정, `node scripts/seed-briefings.mjs`, 화면 검사 실행)을 적고 문서의 명령만 따라 처음부터 해서 통과하는지 확인한다. 이어서 `npm run db:reset` 뒤 `npm run check`, `npm test`, `npm run test:auth`, `npm run build`, `npm run check:tokens`, `openspec validate archi-studio-ui-briefing --strict`, `openspec validate --specs --strict`가 모두 통과하고 끝나면 `npm run db:stop`으로 로컬 DB를 내린다
  - 메모: 문서는 썼다. `db:reset`·`db:stop`·`test:auth`·`build`·openspec validate 전체 순서는 돌리지 않았다(`db:stop` 금지 지시, 실제 API 미병합).
  - 메모(2026-10-25): 문서 순서대로 시험 데이터 38건을 넣고 `ui-screens.mjs` 전체 검사 283개 통과. `db:reset` 뒤 검사 명령과 openspec validate 모두 통과. 지시에 따라 `db:stop`은 하지 않았다.

## Workflow follow-up

- 구현이 끝나면 `/opsx:archive`로 보관해 `briefing-screen` 메인 스펙을 만든다.
- 구현 순서: `archi-studio-briefing`, `archi-studio-papers`, `archi-studio-ui-auth-library`가 끝난 뒤에 시작한다. 논문 링크의 도착 화면은 `archi-studio-ui-paper-hub`가 끝나야 열린다(그 전에는 링크의 `href`만 확인한다).

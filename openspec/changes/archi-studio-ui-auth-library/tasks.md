# Tasks

화면 검증에 쓰는 Playwright와 Chromium 준비는 `docs/dev/setup.md`의 "화면 셸 검증" 절을 따른다. 이 서버에는 글꼴이 없어 스크린샷에 글자가 보이지 않으므로, 글자 존재와 포커스는 DOM 검사로 확인한다. 개발 서버는 포트 5273을 쓴다.

## 1. 호출 도구와 공통 부품

- [ ] 1.1 `src/lib/api/`에 호출 래퍼 `client.ts`(오류 형식 `{error:{code,message}}` 해석, 형식이 다르면 상태 코드로 대체 코드 생성, 401이면 `/login?redirect=…&expired=1`로 이동하되 동시에 여러 요청이 401을 받아도 이동은 한 번), 응답 타입 `types.ts`, 오류 코드별 한국어 문구 `messages.ts`를 만들고, `npm test`의 단위 테스트가 정상 응답, 오류 응답, JSON이 아닌 응답, 401 중복 이동 1회, 문구 표가 서버 오류 코드 `invalid_credentials`, `pending_approval`, `too_many_attempts`, `email_taken`, `invalid_request`, `unauthenticated`, `zotero_not_connected`, `paper_not_found`, `forbidden_origin`, `not_found`, `method_not_allowed`, `internal_error`를 모두 키로 가진다는 것을 확인한다(이 목록은 `grep -o "code: [a-z_]*" docs/api/openapi.yaml` 등으로 실제 문서와 대조한다)
- [ ] 1.2 `src/lib/components/ui/`에 `Button`(기본·보조·위험, 진행 중이면 다시 누를 수 없음), `IconButton`, `TextField`(오류 문구를 `aria-describedby`와 `aria-invalid`로 연결), `SearchField`, `Card`, `Tabs`, `NavItem`, `Spinner`, `Icon`(쓰는 SVG만), `Notice`, `StatePanel`(`loading`/`empty`/`error`, 오류는 `role="alert"`)과 `index.ts`를 만들고, `npm run check` 오류 0건, `npm run check:tokens` 누락 0건, `grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(' src/lib/components/ui`가 0건인지 확인한다
- [ ] 1.3 `ConfirmDialog`(브라우저 기본 `<dialog>`의 `showModal()`, 닫을 때 연 버튼으로 포커스 복귀), `StreamOutput`(조각을 이어 붙이고 진행 중 표시, `aria-live="polite"`, 도중 오류가 나도 받은 글자 유지)와 `src/lib/ui/stream.ts`의 `readTextStream(response, onChunk)`를 만들고, `npm test`의 단위 테스트가 한글 한 글자의 바이트가 두 조각에 걸쳐 도착해도 "안녕하세요"로 복원됨, 조각 순서 유지, 도중 오류 시 앞서 받은 글자 유지를 확인한다
- [ ] 1.4 개발 서버(`npm run dev -- --port 5273 --host 127.0.0.1`)에서만 열리는 `/dev/components`(모든 부품의 모든 상태를 모은 화면)와 Playwright 검사 `scripts/ui-screens.mjs`를 만들고, 라이트·다크 두 테마에서 진행 중 버튼을 두 번 눌러도 요청이 한 번, Tab 포커스 윤곽 표시, 대화상자의 Escape 취소와 연 버튼으로의 포커스 복귀와 밖 요소로 Tab 이동 불가, 스트리밍 조각 이어붙임과 도중 오류, 본문 글자 대비 4.5:1 이상이 모두 OK로 나오고 종료 코드가 0이며, `npm run build` 뒤 빌드한 서버의 `/dev/components`가 404임을 `curl -s -o /dev/null -w '%{http_code}'`로 확인한다

## 2. 화면 묶음과 로그인 확인

- [ ] 2.1 `src/routes/`를 `(auth)`(셸 없음)와 `(app)`(셸 있음)으로 나누고 루트 `+layout.svelte`는 토큰 CSS와 `<head>`만 남기며, `AppShell`이 메뉴 항목 설정(`label`, `href`, `disabled`), 현재 사용자 이메일, 설정 링크, 로그아웃 버튼을 받아 `NavItem`으로 그리고(현재 위치 `aria-current="page"`, 화면이 없는 항목은 비활성), `/`가 `/library`로 이동하게 한 뒤, `npm run check` 오류 0건, `npm run build` 통과, 기존 `scripts/shell-screens.mjs`가 새 주소(셸이 있는 `/dev/components` 등)를 대상으로 36개 검사를 모두 통과하는지 확인한다
- [ ] 2.2 `(app)/+layout.server.ts`가 `event.fetch('/api/auth/me')`로 사용자를 확인해 401이면 `/login?redirect=<현재 경로와 쿼리>`로 303 이동하고 성공하면 `user`를 넘기며, `(auth)/+layout.server.ts`는 로그인된 사용자를 `/library`로 보내도록 만들고, `npm test`의 단위 테스트(가짜 `fetch`)가 401 이동 주소 인코딩, 200일 때 사용자 전달, 로그인된 사용자의 `/login` 접근 이동, `/api/auth/me`가 500일 때 오류 페이지(이동 아님)를 확인한다

## 3. 로그인과 가입 화면

- [ ] 3.1 `(auth)/login`을 만들고(이메일·비밀번호, 빈 입력은 요청 없이 안내, 오류별 안내는 `messages.ts` 사용, 실패 시 비밀번호 입력 비움) 이동 주소 검사 함수 `safeRedirect`를 `src/lib/auth/redirect.ts`에 만들어, `npm test`의 단위 테스트가 `/library`, `/library?query=a`는 허용하고 `//evil.example`, `/\evil`, `https://evil.example`, `javascript:alert(1)`, 빈 값, 배열 형태 값은 `/library`로 바꾸는지 확인한다
- [ ] 3.2 `(auth)/signup`을 만들고(이메일, 8자 이상 비밀번호 안내를 요청 전에 표시, 409 `email_taken`은 이메일 입력창 근처에 안내, 201이면 로그인하지 않고 승인 대기 안내와 로그인 링크 표시), Playwright로 7자 비밀번호 제출 시 서버 요청이 0번이고 안내가 보이는지, 가짜 201 응답에서 승인 대기 안내가 보이고 주소가 `/library`로 바뀌지 않는지 확인한다
- [ ] 3.3 로컬 Supabase(`npm run db:start`, 끝나면 `npm run db:stop`)와 실제 인증 API를 쓰는 Playwright 검사로, 가입 → 승인 대기 안내(세션 쿠키 없음) → SQL로 `archi_profiles.approved=true` → 로그인 → `/library` 이동(셸 표시) → 로그아웃 → `/login` 이동 → 뒤로 가기로 `/library`를 열면 다시 `/login?redirect=…`, 틀린 비밀번호와 없는 이메일이 같은 문구, 승인 전 로그인 시 승인 대기 안내, 같은 IP의 틀린 로그인 6번째에 시도 제한 안내, `/login?expired=1`에 세션 만료 안내가 표시됨을 모두 확인하고 `scripts/ui-screens.mjs`에 이 흐름을 포함한다

## 4. 서재와 설정 화면

- [ ] 4.1 `(app)/library`의 목록(`+page.ts`의 `load`가 `query`, `collection` 쿼리를 읽어 `/api/papers`, `/api/collections`, `/api/zotero/status`를 함께 호출), 논문 카드(제목, 저자, 연도, `hasPdf`·`hasMemo` 표시, 누르면 `/papers/{id}`), 불러오는 중·빈 서재·오류 패널(다시 시도), '더 보기'(`cursor`로 이어 붙임, 조건이 바뀌면 처음부터)를 만들고, 서버 응답을 흉내 낸 Playwright 검사(`page.route`, 응답 형식은 `docs/api/openapi.yaml`의 예시에서 만든 고정 데이터)로 각 상태와 항목 클릭 시 주소가 `/papers/<해당 id>`가 되는 것을 확인한다
- [ ] 4.2 검색(280ms 디바운스, 주소 `?query=` 반영, 새로 고침과 뒤로 가기에서 유지, 지우기 버튼, 결과 없음 문구)과 컬렉션 필터(`parentKey` 들여쓰기, 선택과 해제, `?collection=` 반영, 검색과 함께 적용)를 만들고, 가짜 응답으로 "attention" 입력 후 요청이 1번뿐, `att`의 응답을 일부러 늦게 보내도 `attention` 결과가 유지, 컬렉션과 검색을 함께 쓴 요청 주소, 새로 고침 뒤 입력창 값 유지를 확인한다
- [ ] 4.3 Zotero 연결 안내 패널(연결 버튼은 `/api/zotero/connect`로 이동), 동기화 버튼(건수 표시 뒤 목록 다시 불러옴, 409 `zotero_not_connected`는 안내 패널로), 웹페이지 추가 입력(성공 시 목록 갱신, 400은 입력 유지와 안내), 논문 삭제(`ConfirmDialog`에 휴지통 이동과 이력 삭제 문구, 성공 시 목록에서 제거, 실패 시 대화상자 안 오류)를 만들고, 가짜 응답으로 각 시나리오(`library-screen` 스펙의 해당 시나리오 전부)가 맞는지 Playwright로 확인한다
- [ ] 4.4 `(app)/settings`에 Zotero 연결 상태(연결 여부, 사용자명, 마지막 동기화 시각), 확인 대화상자를 거친 연결 해제(`DELETE /api/zotero/connection`, 논문 목록은 남는다는 안내), 연결 거부로 돌아왔을 때(`/settings?zotero=denied`)와 그 밖의 실패로 돌아왔을 때(`/settings?zotero=error`)의 오류 안내와 다시 연결 버튼을 만들고, 가짜 응답으로 연결됨·연결 안 됨·해제 확인·해제 성공·거부 안내(두 쿼리 값) 화면이 맞는지 Playwright로 확인한다

## 5. 마무리

- [ ] 5.1 로그인, 가입, 승인 대기, 서재(목록·빈 상태·오류), 설정을 라이트·다크 × 1280px·767px·390px로 스크린샷과 DOM 검사로 확인해 가로 스크롤 0px, 세 영역(셸이 있는 화면) 표시, 직접 색 지정 grep 0건(`src/routes`, `src/lib/components`), `npm run check`, `npm test`, `npm run test:auth`(DB 필요), `npm run build`, `npm run check:tokens`, `openspec validate archi-studio-ui-auth-library --strict`가 모두 통과하고 스크린샷을 직접 열어 영역 구분과 색을 눈으로 확인한 결과를 적는다
- [ ] 5.2 `archi-studio-papers`와 `archi-studio-zotero-connection`이 적용된 뒤(둘 중 하나라도 아직이면 이 task는 건너뛰고 `docs/dev/ui-manual-check.md`에 "선행 change 적용 후 확인 필요"로 남긴다) 로컬 DB에 SQL로 사용자와 논문 몇 건을 넣고 실제 서버로 서재 목록, 검색, 컬렉션 필터, 더 보기를 확인하며, 실제 Zotero 계정이 필요한 연결, 동기화, 웹페이지 추가, 삭제는 `docs/dev/ui-manual-check.md`에 손으로 확인할 체크리스트로 남긴다
- [ ] 5.3 `docs/dev/ui-components.md`에 공통 부품 각각의 이름, 받는 값, 쓰는 예를 적고 `docs/dev/setup.md`에 `scripts/ui-screens.mjs` 실행법을 추가해, 문서에 적은 부품 이름이 `src/lib/components/ui/index.ts`의 내보내기와 모두 일치하고(`grep`으로 대조) 문서의 명령만 따라 검사가 통과하는지 확인한다

## Workflow follow-up

- 선행 change(`archi-studio-papers`, `archi-studio-zotero-connection`)가 적용되기 전에도 4번까지는 가짜 응답으로 진행할 수 있다. 5.2는 두 change가 끝난 뒤에 한다.
- 구현이 끝나면 `/opsx:archive`로 보관해 `ui-foundation`, `auth-screens`, `library-screen`을 메인 스펙에 합친다.
- 이후 화면 change(`archi-studio-ui-paper-hub`, `archi-studio-ui-translate-analyze`, `archi-studio-ui-briefing`)는 이 change의 공통 부품(`docs/dev/ui-components.md`)과 메뉴 설정을 쓴다.

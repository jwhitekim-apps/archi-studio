# Tasks

모든 명령은 `/home/joon/workspace/archi-studio`에서, 앞에 `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20 >/dev/null`을 실행한 상태로 한다. 브라우저 검사는 `docs/dev/setup.md`의 Playwright 절차(`LD_LIBRARY_PATH`)를 따른다. 가짜 API 서버는 포트 4300, 개발 서버는 포트 5273을 쓴다.

## 1. 준비

- [ ] 1.1 선행 change 상태와 약속을 확인한다. `ls openspec/changes/archive | grep -E "translation|paper-analysis|ui-auth-library"`로 보관 여부를 보고, 없으면 "가짜 API로만 검증"이라고 이 문서 맨 아래 메모에 적는다. `docs/api/openapi.yaml`의 `Analysis` 스키마에서 `journalScore`가 구체 필드로 바뀌었는지 확인해 design의 결정 8과 어긋나면 이름표 표를 먼저 갱신한다. 로그인 화면 주소와 되돌아오기 쿼리 이름, 공통 부품 위치, 메뉴 링크(`/translate`, `/analyze`)를 `src/`에서 `grep`으로 찾아 메모에 적는다. 기대: 메모 4줄(보관 여부, `Analysis` 필드, 로그인 주소, 메뉴 링크 유무).
- [ ] 1.2 `scripts/fake-api.mjs`와 개발 프록시를 만든다. `node scripts/fake-api.mjs`가 4300에서 `POST /api/translate`(청크 3개를 200ms 간격으로 `text/plain`), `GET /api/translate/history`, `GET /api/papers`, `GET /api/papers/{id}`, `GET`·`POST /api/papers/{id}/analysis`, `GET /api/auth/me`를 `openapi.yaml` 모양으로 돌려주고, `POST /__mode`로 엔드포인트별 상황(정상, 한글 청크 분할, 401, 400, 413, 404, 500, 중간 끊김, 분석 없음·422·빈 점수)을 바꾸며 `GET /__last`로 마지막 요청 본문을 돌려준다. `vite.config.ts`에는 환경 변수 `ARCHI_API_TARGET`이 있을 때만 `/api`를 그 주소로 프록시하는 설정을 더하고 `package.json`에 `"fake-api": "node scripts/fake-api.mjs"`를 추가한다. 기대: `curl -N -X POST http://127.0.0.1:4300/api/translate -H 'content-type: application/json' -d '{"text":"hi"}'`가 청크 3개를 시간차로 출력하고, `/__mode`로 `500`을 설정한 뒤 같은 요청이 500 JSON `{"error":{"code":"internal_error",...}}`이며, 서버 둘을 띄운 뒤(`npm run fake-api`, `ARCHI_API_TARGET=http://127.0.0.1:4300 npm run dev -- --port 5273 --host 127.0.0.1`) `curl -N -X POST http://127.0.0.1:5273/api/translate -H 'content-type: application/json' -d '{"text":"hi"}'`가 같은 청크 3개를 돌려준다(쿠키 없이 401이 나오면 프록시가 API 가드보다 늦다는 뜻이므로 design 결정 9의 대안으로 바꾸고 이유를 메모에 적는다). 환경 변수 없이 `npm run build`가 통과하고 빌드 결과에 프록시 설정이 들어가지 않는다.

## 2. 클라이언트 코드

- [ ] 2.1 `src/lib/client/translate-stream.test.ts`를 먼저 써서 `npm test`에서 실패하는 것을 확인한 뒤 `src/lib/client/translate-stream.ts`를 만든다. 시험 항목: 청크 이어 붙이기, 세 바이트 한글이 청크 경계에서 쪼개져도 온전함, 취소 시 부분 글자 유지, 400·401·404·413·500 응답이 `ApiError`(상태와 `error.code`)로 구분됨, 응답 도중 읽기 실패가 부분 글자를 담은 `StreamInterrupted`로 나옴. 기대: `npm test`에서 새 시험이 모두 통과하고 기존 시험도 통과한다.
- [ ] 2.2 `src/lib/client/api.ts`에 논문 검색·상세, 번역 이력(`paperId` 필터), 분석 조회·실행 함수와 공통 오류 변환(`{error:{code,message}}` → `ApiError`, 401은 `SessionExpired`)을 만들고 `src/lib/client/api.test.ts`로 `fetch`를 가짜로 바꿔 시험한다. 기대: `npm test` 통과, `grep -rn "window.location" src/lib/client`가 0건(자동 이동 없음).

## 3. 셸의 설정 패널 슬롯

- [ ] 3.1 `src/lib/components/panel-slot.svelte.ts`(슬롯 상태), `PanelContent.svelte`를 만들고 루트 `+layout.svelte`가 슬롯을 만들어 `AppShell`에 넘기게 한다. 먼저 `AppShell.svelte`와 `+layout.svelte`의 현재 내용을 읽고 `slot` 속성 하나만 더한다. 슬롯이 비면 기존 안내문("선택한 도구의 설정이 여기에 표시됩니다.")을 그대로 보인다. 기대: `npm run check` 오류 0건, `npm run build` 통과, `npm run preview -- --port 4173 --host 127.0.0.1`을 띄운 상태에서 `node scripts/shell-screens.mjs http://127.0.0.1:4173 "$(mktemp -d)"`가 기존 검사를 모두 통과한다(서버 종료 필수). 슬롯 등록 정리의 경쟁 상태도 `panel-slot.test.ts`로 시험한다: 화면 A 등록 → 화면 B 등록 → A 정리 후에도 B의 내용이 남는다. 기대(추가): `npm test`에서 이 시험이 통과한다.

## 4. 번역 화면

- [ ] 4.1 `src/routes/translate/`(+page.ts에서 `ssr = false`, +page.svelte)와 `src/lib/messages/translate.ts`를 만들고 입력창, 글자 수(`n / 5000`, 5000자에서 자름), 번역·중지·복사 버튼, Ctrl+Enter, 결과 영역(커서, "번역 중", 완료 후 복사 활성)을 구현한다. `scripts/translate-analyze-screens.mjs`에 번역 기본 흐름 검사를 만든다. 기대: 가짜 서버(느린 스트림 모드)와 개발 서버를 띄우고 `node scripts/translate-analyze-screens.mjs http://127.0.0.1:5273 "$(mktemp -d)"`가 "첫 청크 후 글자가 보이고 복사 버튼 비활성", "완료 후 복사 활성", "한글 분할 모드에서 깨진 글자 없음", "중지 시 부분 글자 유지와 '중단됨'", "연속 실행 시 이전 문장 글자가 섞이지 않음", "빈 입력이면 버튼 비활성"을 모두 OK로 출력한다.
- [ ] 4.2 번역 오류 상태(401 로그인 링크와 입력 유지, 500 "다시 시도", 400·413 "다시 시도" 없음, 연결 끊김 시 부분 글자 유지)를 구현하고 검사 스크립트에 추가한다. 기대: 가짜 서버 모드를 바꿔 가며 각 상태의 안내 문구와 버튼 유무가 OK로 출력되고, 화면에 `internal_error` 같은 서버 내부 문구가 보이지 않는다(`grep`이 아니라 페이지 텍스트 검사).
- [ ] 4.3 논문 연결과 이력을 구현한다. `/translate?paperId=`가 `GET /api/papers/{id}`로 제목을 보여주고 요청 본문에 `paperId`를 싣는다. 형식이 UUID가 아니거나 404면 "논문을 찾을 수 없음"과 "연결 없이 계속" 버튼을 보인다. 이력은 최신순 20개와 "더 보기", 항목 선택 시 요청 없이 채우기, "이 논문만" 필터, 번역 직후 맨 위 갱신을 지원한다. 기대: 검사 스크립트가 요청 본문의 `paperId`(가짜 서버가 마지막 요청 본문을 `GET /__last`로 돌려줌), 이력 선택 후 `POST /api/translate` 호출 0회, 필터 요청 주소(`history?paperId=`), 연결 해제 후 본문에 `paperId` 없음을 OK로 출력한다.
- [ ] 4.4 번역 설정 패널(자동 번역 스위치 기본 꺼짐, 연결 논문 제목과 "연결 해제", 이력 범위)을 `PanelContent`로 등록하고 자동 번역 선택을 브라우저 저장소에 저장한다(저장소 접근 오류는 삼키고 기본값 사용). 기대: 검사 스크립트가 "처음 방문 시 꺼짐이고 입력만으로 요청 0회", "켜고 300ms 입력 멈춤 후 요청 1회, 입력 계속 시 이전 요청 취소", "새로고침 후에도 켜짐", "저장소를 막은 컨텍스트에서 기본값과 오류 표시 없음", "논문 연결이 없으면 연결·이력 범위 항목 숨김"을 OK로 출력한다.

## 5. 분석 화면

- [ ] 5.1 `PaperPicker.svelte`와 `src/routes/analyze/`(+page.ts `ssr = false`, +page.svelte), `src/lib/messages/analyze.ts`를 만들고 `paperId` 없이 열면 선택기가 보이게 한다(검색 300ms, `GET /api/papers?query=&limit=20`, 키보드로 고르기, 서재 비어 있음·검색 결과 없음 안내, 선택 시 `/analyze?paperId=`로 이동). 기대: 검사 스크립트가 검색어 입력 후 요청 주소(`query=attention`), 선택 후 주소 변경, 두 빈 상태 안내를 OK로 출력한다.
- [ ] 5.2 `paperId`가 있는 분석 화면을 구현한다. 열면 `GET`만 보내고(저장된 분석이 있으면 결과 표시, 404 `analysis_not_found`면 "분석 시작" 버튼), 시작하면 `POST`를 한 번 보내 진행 상태와 비활성 버튼을 보이고, 422·404 `paper_not_found`·401·500 안내(500만 "다시 시도")를 보인다. 기대: 가짜 서버 모드별로 검사 스크립트가 "열 때 POST 0회", "시작 클릭 후 진행 상태와 버튼 비활성, 연타해도 POST 1회", "새로고침 후 GET부터 다시", 각 오류 안내 문구와 버튼 유무를 OK로 출력한다.
- [ ] 5.3 결과 표시를 구현한다. `summary` 본문(줄바꿈 보존), `journalScore`의 이름·값 목록, `quartile` 등급 배지(색은 토큰만), 알려진 키의 한국어 이름표와 모르는 키의 원래 이름, 빈 객체의 "점수 정보 없음" 안내, 같은 논문의 `/translate?paperId=`·`/papers/<id>` 링크. 기대: 가짜 서버에 `{ "quartile": "Q1", "sjr": "2.1", "country": "KR" }`를 주면 배지와 세 항목이 보이고, 빈 객체면 안내가 보이며, 번역 링크 주소가 `/translate?paperId=<id>`다.
- [ ] 5.4 분석 설정 패널("대상 논문"과 "변경", "저장된 결과 다시 불러오기")을 등록한다. 기대: 검사 스크립트가 "변경 클릭 시 `/analyze` 선택기", "다시 불러오기 클릭 시 `GET` 1회 추가이고 `POST` 0회"를 OK로 출력하고, 번역 화면에서 분석 화면으로 이동하면 패널 내용이 번역 설정에서 분석 설정으로 바뀐다.

## 6. 마무리

- [ ] 6.1 접근성·반응형·테마를 확인한다. 1280px과 390px, 라이트와 다크로 번역·분석 화면(결과가 있는 상태 포함)의 스크린샷을 만들어 직접 눈으로 확인하고, 390px에서 가로 스크롤 0, 새 스타일에 직접 색 지정(`#hex`, `rgb(`) 0건(`grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(" src/routes/translate src/routes/analyze src/lib/components --include=*.svelte`), 완료 안내 영역(`aria-live="polite"`)에 완료 때 한 번만 문구가 생기고 청크마다 반복하지 않음, Tab 순서(입력창, 번역·중지·복사, 이력)와 설정 스위치의 `role="switch"`·이름을 검사 스크립트로 확인한다. 이 서버에는 글꼴이 없으니 글자는 페이지 텍스트 검사로 대신하고 그 사실을 메모에 적는다. 기대: 검사 스크립트가 모두 OK이고 `npm run check:tokens`가 누락 0건이다.
- [ ] 6.2 `docs/dev/setup.md`에 가짜 API 서버 실행법(`npm run fake-api`, `ARCHI_API_TARGET`, 모드 전환 `/__mode`)과 화면 검사 실행법(`translate-analyze-screens.mjs`)을 적고, 문서의 명령만 따라 처음부터 실행해 검사가 통과하는지 확인한다. 화면이 쓰는 응답 필드가 `docs/api/openapi.yaml`에 모두 있는지 `grep`으로 대조해 빠진 필드를 메모에 적는다. 기대: 문서 순서대로 따라 한 실행이 통과하고, 화면이 쓰는 응답 필드와 `openapi.yaml`의 차이가 0건이거나 메모에 적혀 있다.
- [ ] 6.3 실제 API로 마무리 확인을 한다. 선행 `archi-studio-translation`, `archi-studio-paper-analysis`가 구현돼 있으면 `npm run db:start`, `npm run db:reset` 뒤 로컬 앱(`npm run dev`)으로 로그인한 계정의 쿠키로 번역 한 번(스트리밍 확인), 같은 문장을 다른 `paperId`로 번역(이력 행 추가), 분석 한 번과 저장된 결과 재조회를 직접 확인한다(구현돼 있지 않으면 "선행 미구현으로 가짜 API만 검증"이라고 적고 건너뛴다). 그다음 `npm run check`, `npm test`, `npm run test:auth`, `npm run build`, `npm run check:tokens`, `openspec validate archi-studio-ui-translate-analyze --strict`, `openspec validate --specs --strict`가 모두 통과하는지 확인하고 끝나면 `npm run db:stop`으로 로컬 DB를 내리고 가짜 서버와 개발 서버를 종료한다. 기대: 모든 명령 통과, `ss -ltn | grep -E ":(4300|5273|4173) "`가 0줄, `docker ps`에 supabase 컨테이너 0개.

## Workflow follow-up

- 구현이 끝나면 `/opsx:archive`로 이 change를 보관해 `translate-screen`, `analyze-screen`, `settings-panel` 메인 스펙에 합친다.
- 메모(1.1에서 쓰는 내용):

# Tasks

모든 명령은 `/home/joon/workspace/archi-studio`에서 실행한다. 브라우저 검사는 `docs/dev/setup.md`의 "화면 검사" 절(라이브러리, 글꼴, 로컬 DB, 개발 서버 5273)을 따른다.

## 1. 준비

- [ ] 1.1 `apiFetch`에 `redirectOn401: false` 선택을 더하고(기본은 지금처럼 이동), `src/lib/translate.ts`에 번역 스트림 함수 `startTranslation`과 `StreamInterrupted`를 만든다. `npm test`의 단위 테스트가 `redirectOn401: false`면 401에도 이동하지 않음, 조각 이어 붙이기, 400·401·404·413·500·502·503이 `ApiError`(상태와 코드)로 구분됨, 도중 실패가 받은 글자를 담은 `StreamInterrupted`, 취소가 `AbortError`로 나옴, 요청 본문에 `paperId`가 있을 때만 실림을 확인한다
- [ ] 1.2 `panel-slot.svelte.ts`와 `PanelContent.svelte`를 만들고 `(app)/+layout.svelte`가 슬롯을 컨텍스트로 내려 `AppShell`의 `panel`에 넘기게 한다. `npm test`의 단위 테스트가 A 등록 → B 등록 → A 정리 뒤에도 B가 남음, B 정리 뒤 비어 있음을 확인하고, `npm run check` 오류 0건, `scripts/shell-screens.mjs` 36개 검사 통과를 확인한다
- [ ] 1.3 `NAV_ITEMS`의 번역(`/translate`)·분석(`/analyze`)을 활성으로 바꾸고, `scripts/ui-screens.mjs`에 브라우저 `fetch`를 `/api/translate`에 한해 감싸는 가짜 스트림 도구(시간차 조각, 한글 바이트 분할, 중간 끊김, 상태 코드별 오류, 요청 본문과 취소 기록)를 더한다

## 2. 번역 화면

- [ ] 2.1 `(app)/translate`(`ssr = false`)와 `src/lib/messages/translate.ts`를 만들고 입력창, 글자 수(`n / 5000`, 5000자에서 자름), 번역·중지·복사 버튼, Ctrl+Enter, Escape 중지, 결과 영역(커서, "번역 중", 완료 후 복사 활성, "중단됨"), 완료 안내(`aria-live="polite"`에 한 번)를 구현한다. `translate` 검사 묶음이 첫 조각 뒤 글자 표시와 복사 비활성, 완료 후 복사 활성과 "복사됨", 한글 분할에도 깨진 글자 없음, 중지 시 부분 글자 유지와 "중단됨", 연속 실행 시 이전 글자 섞이지 않음, 빈 입력이면 버튼 비활성·Ctrl+Enter 요청 0번, 5000자 자르기, 완료 안내 한 번을 OK로 출력한다
- [ ] 2.2 번역 오류 상태를 구현한다: 401은 이동하지 않고 로그인 안내와 `/login?redirect=` 링크·입력 유지, 500·502는 "다시 시도"(같은 입력으로 재요청), 400·413은 입력 확인 안내(다시 시도 없음), 503은 관리자 안내(다시 시도 없음), 도중 끊김은 부분 글자 유지와 "다시 시도". 검사 묶음이 상태별 문구와 버튼 유무, 화면에 `internal_error` 같은 코드 문자열이 보이지 않음을 OK로 출력한다
- [ ] 2.3 논문 연결과 이력을 구현한다: `?paperId=`가 `GET /api/papers/{id}`로 제목을 보이고 요청 본문에 `paperId`를 싣는다. UUID가 아니거나 404면 "논문을 찾을 수 없음"과 "연결 없이 계속". 이력은 `limit=200`으로 받아 20개씩 "더 보기", 항목 선택은 요청 없이 채우기, 비어 있음 안내, 성공 직후 이력 다시 불러오기. 검사 묶음이 요청 본문의 `paperId`, 이력 선택 후 번역 요청 0번, 20개 → 더 보기 40개, 연결 없이 계속 후 본문에 `paperId` 없음을 OK로 출력한다
- [ ] 2.4 번역 설정 패널(자동 번역 `role="switch"` 기본 꺼짐, 연결 논문 제목과 "연결 해제", 이력 범위 전체·이 논문만)을 `PanelContent`로 등록하고 자동 번역 선택을 브라우저 저장소에 저장한다(접근 오류는 삼킴). 검사 묶음이 처음 꺼짐이고 입력만으로 요청 0번, 켜고 300ms 멈추면 요청 1번과 입력 계속 시 이전 요청 취소, 새로 고침 후 켜짐 유지, 저장소를 막은 문맥에서 기본값과 오류 없음, 연결이 없으면 연결·이력 범위 숨김, "이 논문만"이면 `history?paperId=` 요청, 연결 해제 후 주소에서 `paperId`가 사라짐을 OK로 출력한다

## 3. 분석 화면

- [ ] 3.1 `PaperPicker.svelte`와 `(app)/analyze`(`ssr = false`), `src/lib/messages/analyze.ts`를 만든다. `paperId` 없이 열면 선택기(검색 300ms, `GET /api/papers?query=&limit=20`, 화살표·Enter로 고르기, 서재 비어 있음 안내와 서재 링크, 검색 결과 없음 안내, 선택 시 `/analyze?paperId=`). 검사 묶음이 요청 주소(`query=attention`), 키보드 선택 후 주소 변경, 두 빈 상태 안내를 OK로 출력한다
- [ ] 3.2 `paperId`가 있으면 `GET`만 보내 저장된 결과를 보이거나 404 `analysis_not_found`면 "분석 시작"을 보인다. 시작하면 `POST`를 한 번 보내고 진행 상태와 비활성 버튼, 422·404 `paper_not_found`(선택기 링크)·401(이동 없이 로그인 링크)·500·502("다시 시도") 안내를 보인다. 검사 묶음이 열 때 `POST` 0번, 연타해도 `POST` 1번, 새로 고침 후 `GET`부터, 상태별 문구와 버튼 유무를 OK로 출력한다
- [ ] 3.3 결과 표시를 확정 필드대로 구현한다(기본 정보, 세 줄 요약, 자세한 설명 펼치기, 분야·키워드, 저자, 저널 점수와 분위 배지, 쓴 자료, 번역·논문 허브 링크). 검사 묶음이 `Q1` 배지와 `SJR 35.568`·정식 이름, 여섯 값이 모두 null이면 "순위표에서 찾지 못한" 안내, 빈 저자와 null DOI 숨김, 번역 링크 `/translate?paperId=<id>`를 OK로 출력한다
- [ ] 3.4 분석 설정 패널("대상 논문"과 "변경", "저장된 결과 다시 불러오기")을 등록한다. 검사 묶음이 변경 클릭 시 `/analyze` 선택기, 다시 불러오기 클릭 시 `GET` 1번 추가와 `POST` 0번, 번역 화면에서 분석 화면으로 가면 패널이 분석 설정으로 바뀌고 서재로 가면 기본 안내문으로 돌아옴을 OK로 출력한다

## 4. 마무리

- [ ] 4.1 번역·분석 화면(결과가 있는 상태 포함)을 라이트·다크 × 1280·390px로 찍어 직접 보고, 가로 넘침 0px, 직접 색 지정 0건(`grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(" src/routes src/lib/components --include=*.svelte`), Tab 순서(입력창, 번역·중지·복사, 이력), 390px에서 설정 버튼으로 패널이 열리고 포커스가 안으로 들어감을 검사 묶음으로 확인한다
- [ ] 4.2 `docs/dev/setup.md`의 화면 검사 표에 `translate`, `analyze` 묶음을 더하고, `docs/dev/ui-components.md`에 `PanelContent`와 `PaperPicker` 사용법을 적는다. 화면이 쓰는 응답 필드가 `docs/api/openapi.yaml`에 모두 있는지 대조한다
- [ ] 4.3 실제 서버로 확인한다: 로컬 DB와 학교 모델(`.env`의 `AI_PROVIDER=local`)로 로그인한 계정에서 번역 한 번(스트리밍과 이력 추가), 같은 문장 다시 번역(저장된 번역 재사용), 논문 하나(실제 arXiv 논문 정보를 SQL로 넣음) 분석과 저장된 결과 재조회를 확인한다. 그다음 `npm run check`, `npm test`, `npm run test:auth`, `npm run build`, `npm run check:tokens`, `openspec validate archi-studio-ui-translate-analyze --strict`가 모두 통과하고, 끝나면 로컬 DB와 개발 서버를 내린다

## Workflow follow-up

- 구현이 끝나면 `/opsx:archive`로 보관해 `translate-screen`, `analyze-screen`, `settings-panel`을 메인 스펙에 더하고 `auth-screens`의 수정을 합친다.

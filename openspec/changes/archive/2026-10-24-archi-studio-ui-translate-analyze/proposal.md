# Proposal

선행: `archi-studio-translation`, `archi-studio-paper-analysis`, `archi-studio-ui-auth-library`

## Why

번역과 분석은 백엔드 API가 만들어져도 화면이 없으면 쓸 수 없다. 벨루에는 이미 번역 화면(약 270줄)과 논문 분석 화면(약 640줄)이 React로 있고, 새 앱은 이를 Svelte 5 + TypeScript로 다시 써서 세 칸 셸(왼쪽 메뉴, 가운데 작업 영역, 오른쪽 설정 패널) 안에 "입력 → 실행 → 결과" 흐름으로 넣어야 한다. 지금 셸의 오른쪽 패널은 빈 안내문뿐이고, 화면이 자기 설정을 패널에 넣을 방법도 없다.

## What Changes

- 번역 화면 `/translate`을 만든다. 입력창과 글자 수(최대 5,000자), 실행(버튼, Ctrl+Enter), 글자가 흘러나오는 결과, 중지, 복사, 최근 번역 이력, 오류 상태를 포함한다. 선택 쿼리 `?paperId=`로 논문에 연결해 번역하고 그 논문의 이력만 볼 수 있다.
- 분석 화면 `/analyze`을 만든다. 논문 선택기(내 논문을 검색해 고르는 목록)에서 논문을 고르면 `/analyze?paperId=`로 가서 저장된 분석을 먼저 보여주고, 없으면 분석을 시작할 수 있다. 분석 중, 자료 없음(422), 오류 상태와 결과(요약, 저널 점수)를 표시한다.
- 오른쪽 설정 패널에 화면이 자기 내용을 넣는 방법(패널 슬롯)을 셸에 추가하고, 번역 화면(자동 번역, 연결 논문 해제, 이력 범위)과 분석 화면(대상 논문 변경, 결과 다시 불러오기)의 설정 내용을 정한다.
- 화면 검증은 기존 `scripts/ui-screens.mjs`에 번역·분석 묶음을 더해서 한다. 로그인은 로컬 DB의 실제 계정으로 하고, 응답은 브라우저 안에서 가짜로 바꾼다(번역 스트림은 브라우저 `fetch`를 감싸 시간차 조각으로 흉내 낸다).
- 세션이 끝났을 때 번역·분석 화면은 로그인 화면으로 자동 이동하지 않고 안내와 로그인 링크만 보여준다. 입력한 글과 결과를 잃지 않기 위해서다. `auth-screens` 스펙에 이 예외를 적는다.
- 이미 있는 공통 부품(`$lib/components/ui`), 호출 도구(`apiFetch`), 스트림 읽기(`readTextStream`)를 그대로 쓴다.

### 옮기지 않는 것 (벨루 대비)

- 분석 화면의 제목·URL·PDF 파일 업로드 입력과 논문 검색(Semantic Scholar) 후보 목록. 새 API는 내 논문 하나(`/api/papers/{id}/analysis`)만 분석한다(`legacy-map.md` 5, 6번).
- 분석 결과의 관련도 배지. 새 API의 `Analysis`에 관련도 필드가 없다(연구실 하나에 묶인 항목). 저자(h-index), 키워드, 저널 점수는 확정된 필드대로 보여준다.
- 네이버 사전 조회(`naverDict`). 서버 라우트가 벨루에도 없고 새 명세에도 없다(`legacy-map.md` 53행).
- 화면 문구의 다국어 전환. 새 앱의 화면 문구는 한국어 하나로 둔다(데모 이야기의 "언어 3개 → 하나").
- 전체 번역·분석 이력 목록 화면. 번역은 최근 이력 목록만, 분석은 논문별 조회만 있다.

## Capabilities

### New Capabilities

- `translate-screen`: 번역 입력, 스트리밍 결과, 중지·복사, 오류 상태, 논문 연결, 이력 동작
- `analyze-screen`: 논문 선택, 저장된 분석 우선 표시, 분석 실행과 진행·오류 상태, 결과 표시
- `settings-panel`: 오른쪽 패널에 현재 도구의 설정을 보여주는 규칙과 번역·분석 설정 항목, 설정 저장 방식

### Modified Capabilities

- `auth-screens`: "로그인 상태 확인과 만료 처리"에 번역·분석 화면은 사용 중 401에 자동 이동하지 않는다는 예외를 더한다.

(`app-shell`의 요구사항은 바뀌지 않고, 패널 슬롯은 `settings-panel`이 정의한다.)

## 계약이 되는 기존 스펙

- API 동작은 메인 스펙 `translation`, `paper-analysis`, `papers`, `auth`가 계약이다. 이 change는 그 API를 부르는 화면만 정의하고 API 계약은 바꾸지 않는다.
- 셸과 디자인 토큰은 메인 스펙 `app-shell`을 따른다. 색은 토큰으로만 쓰고 직접 색 지정을 하지 않는다.

## Impact

- 새 코드: `src/routes/(app)/translate/`, `src/routes/(app)/analyze/`, `src/lib/translate.ts`(번역 스트림), `src/lib/components/panel-slot.svelte.ts`·`PanelContent.svelte`·`PaperPicker.svelte`, 화면 문구 모듈.
- 수정 코드: `src/lib/api/client.ts`(401 이동을 끄는 선택 값), `src/lib/nav.ts`(번역·분석 메뉴 활성), `src/routes/(app)/+layout.svelte`(패널 슬롯 연결), `scripts/ui-screens.mjs`, `docs/dev/setup.md`, `docs/dev/ui-components.md`.
- 의존성: 추가하지 않는다(Playwright는 이미 devDependency다).
- 선행 change는 모두 적용되었다. 화면은 가짜 응답으로 검사하고, 마지막 task에서 실제 서버와 학교 모델로 한 번 확인한다.

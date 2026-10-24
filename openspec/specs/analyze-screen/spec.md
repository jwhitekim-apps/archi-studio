# analyze-screen Specification

## Purpose

분석 화면(`/analyze`)에서 내 논문 하나를 골라 저장된 분석을 보고, 없으면 분석을 시작하고, 요약과 저널 점수를 확인하는 흐름과 진행·오류 상태를 정의한다. API 계약은 `paper-analysis`와 `papers` 스펙이 정한다.

## Requirements


### Requirement: 분석할 논문 선택
시스템은 `paperId` 없이 연 분석 화면에 논문 선택기를 보여줘야 한다(SHALL). 선택기는 검색어를 입력하면 `GET /api/papers?query=`로 내 논문을 찾아 제목, 저자, 연도를 목록으로 보여주고, 논문을 고르면 `/analyze?paperId=<id>`로 이동한다. 검색어가 비어 있으면 최근 논문을 보여준다.

#### Scenario: 논문 고르기
- **WHEN** 사용자가 검색어 `attention`을 입력하고 결과 중 한 논문을 누른다
- **THEN** 화면은 `GET /api/papers?query=attention`으로 목록을 보여주고, 누른 논문의 `/analyze?paperId=<id>`로 이동한다

#### Scenario: 서재가 비어 있음
- **WHEN** 논문 목록 응답의 `items`가 빈 배열이고 검색어가 없다
- **THEN** 선택기에 아직 논문이 없다는 안내와 서재 화면으로 가는 링크가 보인다

#### Scenario: 검색 결과 없음
- **WHEN** 검색어에 맞는 논문이 없다
- **THEN** 선택기에 검색 결과가 없다는 안내가 보이고 입력한 검색어는 그대로 남는다

### Requirement: 저장된 분석 우선 표시
시스템은 `paperId`가 있는 분석 화면을 열면 먼저 `GET /api/papers/{id}/analysis`로 저장된 분석을 조회해야 한다(SHALL). 저장된 분석이 있으면 바로 결과를 보여주고, 404 `analysis_not_found`면 "아직 분석하지 않은 논문"이라는 안내와 "분석 시작" 버튼을 보여준다. 이때 AI를 호출하는 요청을 자동으로 보내지 않는다(MUST).

#### Scenario: 이미 분석된 논문
- **WHEN** 저장된 분석이 있는 논문의 `/analyze?paperId=`를 연다
- **THEN** 결과 영역에 요약과 저널 점수가 표시되고 `POST /api/papers/{id}/analysis`는 호출되지 않는다

#### Scenario: 분석되지 않은 논문
- **WHEN** 저장된 분석이 없는 논문(조회가 404 `analysis_not_found`)을 연다
- **THEN** "분석 시작" 버튼이 보이고, 누르기 전에는 분석 요청이 보내지지 않는다

### Requirement: 분석 실행과 진행 상태
시스템은 "분석 시작"을 누르면 `POST /api/papers/{id}/analysis`를 한 번 보내고, 응답이 올 때까지 진행 상태("분석 중")를 보여주며 시작 버튼을 비활성으로 만들어야 한다(SHALL). 분석 중에 같은 요청을 중복해서 보내지 않는다(MUST).

#### Scenario: 첫 분석
- **WHEN** 분석되지 않은 논문에서 "분석 시작"을 누른다
- **THEN** 진행 상태가 보이고 시작 버튼은 비활성이며, 200 응답이 오면 결과 영역에 요약과 저널 점수가 표시된다

#### Scenario: 연속 클릭
- **WHEN** 분석 중에 시작 버튼 자리를 다시 누르려 한다
- **THEN** 두 번째 요청은 보내지지 않는다

#### Scenario: 분석 중 새로고침
- **WHEN** 분석 요청이 진행 중일 때 사용자가 페이지를 새로고침한다
- **THEN** 화면은 처음처럼 저장된 분석을 조회하고, 아직 저장되지 않았으면 "분석 시작" 버튼을 다시 보여준다

### Requirement: 분석 불가와 오류 상태
시스템은 분석 조회나 실행이 실패하면 원인에 맞는 한국어 안내를 보여줘야 한다(SHALL). 안내에 서버의 내부 문구나 스택을 그대로 보여주지 않는다(MUST).

#### Scenario: 자료 없음
- **WHEN** 분석 실행이 422 `no_source_for_analysis`를 받는다
- **THEN** 분석할 PDF나 외부 정보가 없는 논문이라는 안내가 보이고 "다시 시도" 버튼은 보이지 않는다

#### Scenario: 없는 논문
- **WHEN** 분석 조회나 실행이 404 `paper_not_found`를 받는다
- **THEN** 논문을 찾을 수 없다는 안내와 논문 선택기로 돌아가는 링크가 보인다

#### Scenario: 세션 만료
- **WHEN** 분석 조회나 실행이 401 `unauthenticated`를 받는다
- **THEN** 로그인이 필요하다는 안내와 로그인 화면 링크(`/login?redirect=<현재 주소>`)가 보이고, 화면은 자동으로 이동하지 않는다

#### Scenario: 서버 오류
- **WHEN** 분석 실행이 500 `internal_error` 또는 502 `upstream_unavailable`을 받는다
- **THEN** 일시적인 오류라는 안내와 "다시 시도" 버튼이 보이고, 누르면 분석을 다시 요청한다

### Requirement: 분석 결과 표시
시스템은 분석 응답(`paper-analysis` 스펙의 `Analysis`)을 다음 묶음으로 보여줘야 한다(SHALL). 기본 정보(제목, 연도, 학회·저널, 인용 수, DOI·arXiv 번호), 한 줄 요약(`problemShort`, `methodShort`, `conclusionShort`), 펼쳐 보는 자세한 설명(`problem`, `method`, `conclusion`), 분야와 키워드, 저자(최대 3명, h-index와 인용 수), 저널 점수(분위 배지, SJR, 정식 이름, 종류, 나라), 분석에 쓴 자료(PDF, Semantic Scholar). 값이 null이거나 목록이 비어 있는 항목은 숨기고, 저널 점수의 여섯 값이 모두 null이면 "순위표에서 찾지 못한 학회·저널"이라고 안내한다(MUST). 분위 배지의 색은 디자인 토큰만 쓴다.

#### Scenario: 요약과 저널 점수
- **WHEN** 분석 응답의 `problemShort`, `methodShort`, `conclusionShort`가 값이고 `journalScore`가 `{ "quartile": "Q1", "sjr": 35.568, "matchedTitle": "Nature Reviews Molecular Cell Biology", ... }`이다
- **THEN** 결과 영역에 세 줄 요약과 `Q1` 배지, `SJR 35.568`, 정식 이름이 보인다

#### Scenario: 저널 점수 없음
- **WHEN** 분석 응답의 `journalScore` 여섯 값이 모두 null이다
- **THEN** 저널 점수 영역에 순위표에서 찾지 못했다는 안내가 보인다

#### Scenario: 빈 값 숨김
- **WHEN** `authors`가 빈 배열이고 `basic.doi`가 null이다
- **THEN** 저자 묶음과 DOI 항목은 보이지 않고 나머지 항목은 그대로 보인다

### Requirement: 다른 화면으로 이동
시스템은 분석 결과가 보이는 화면에서 같은 논문의 번역 화면(`/translate?paperId=<id>`)과 논문 허브(`/papers/<id>`)로 가는 링크를 보여줘야 한다(SHALL).

#### Scenario: 번역으로 이동
- **WHEN** 분석 결과 화면에서 번역 링크를 누른다
- **THEN** 같은 `paperId`를 가진 `/translate?paperId=<id>` 화면이 열린다

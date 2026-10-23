# Spec Delta

## Purpose

사용자의 논문 서재를 보여주는 화면(목록, 검색, 컬렉션 필터, 동기화, 웹페이지 추가, 삭제)과 Zotero 연결을 관리하는 설정 화면을 정의한다. 서버 쪽 계약은 `papers`와 `zotero-connection` 스펙에 있고, 이 스펙은 그 계약을 화면에서 어떻게 쓰는지를 다룬다.

## ADDED Requirements

### Requirement: 서재 목록
시스템은 `/library`에서 `GET /api/papers` 결과를 최근 동기화 순으로 목록으로 보여줘야 한다(SHALL). 각 항목에는 제목, 저자, 연도, 원문(PDF) 있음 표시, 메모 있음 표시가 있고, 다음 페이지가 있으면(`nextCursor`) '더 보기'로 이어서 불러온다.

#### Scenario: 목록 표시
- **WHEN** 논문이 있는 사용자가 `/library`를 연다
- **THEN** 논문 항목이 최근 동기화 순으로 표시되고 `hasPdf`와 `hasMemo`가 각각 표시로 구분된다

#### Scenario: 더 보기
- **WHEN** 응답의 `nextCursor`가 값이고 사용자가 '더 보기'를 누른다
- **THEN** 같은 조건에 `cursor`를 붙여 요청하고 받은 항목을 기존 목록 뒤에 이어 붙인다

#### Scenario: 불러오는 중과 오류
- **WHEN** 목록 응답이 오기 전이거나 요청이 실패한다
- **THEN** 불러오는 중 상태와 다시 시도 버튼이 있는 오류 패널이 각각 표시된다

### Requirement: 검색
시스템은 검색창 입력을 280ms 멈춘 뒤 `query`로 목록을 다시 불러와야 한다(SHALL). 검색어는 주소(`/library?query=`)에 반영해 뒤로 가기와 새로 고침에서도 유지하고, 오래된 요청의 응답이 새 결과를 덮어쓰지 않아야 한다(MUST).

#### Scenario: 입력 후 검색
- **WHEN** 사용자가 `attention`을 입력하고 280ms 동안 더 입력하지 않는다
- **THEN** `query=attention`으로 한 번만 요청하고 주소가 `/library?query=attention`이 된다

#### Scenario: 늦게 도착한 이전 응답
- **WHEN** `att`의 응답이 `attention`의 응답보다 늦게 도착한다
- **THEN** 화면은 `attention`의 결과를 유지한다

#### Scenario: 결과 없음
- **WHEN** 검색 결과가 비어 있다
- **THEN** "검색어에 맞는 논문이 없습니다"와 검색어 지우기 버튼이 표시된다

### Requirement: 컬렉션 필터
시스템은 `GET /api/collections`로 컬렉션을 부모-자식 들여쓰기로 보여주고, 하나를 고르면 `collection` 값으로 목록을 거르며 주소에 반영해야 한다(SHALL). 같은 컬렉션을 다시 누르거나 '전체'를 누르면 필터가 풀린다.

#### Scenario: 컬렉션 선택
- **WHEN** 사용자가 컬렉션을 선택한다
- **THEN** 주소가 `/library?collection=<키>`가 되고 그 컬렉션의 논문만 표시된다

#### Scenario: 검색과 함께 사용
- **WHEN** 컬렉션을 고른 상태에서 검색어를 입력한다
- **THEN** 두 조건이 함께 적용된 요청이 간다

### Requirement: Zotero 연결 안내와 동기화
시스템은 서재에서 `GET /api/zotero/status`로 연결 상태를 확인하고, 연결되지 않았으면 안내 패널과 '연결' 버튼(`/api/zotero/connect`로 이동)을 보여줘야 한다(SHALL). 연결되어 있으면 '동기화' 버튼으로 `POST /api/zotero/sync`를 부르고 추가·갱신·삭제 건수를 알려준 뒤 목록을 다시 불러온다.

#### Scenario: 연결 전 빈 서재
- **WHEN** Zotero를 연결하지 않은 사용자가 `/library`를 연다
- **THEN** 목록 대신 Zotero 연결을 안내하는 패널과 연결 버튼이 표시된다

#### Scenario: 동기화 성공
- **WHEN** 연결된 사용자가 동기화를 누르고 서버가 `{added: 3, updated: 1, removed: 0}`을 돌려준다
- **THEN** "3건 추가, 1건 갱신, 0건 삭제"가 표시되고 목록이 다시 불러와진다

#### Scenario: 연결이 끊긴 상태의 동기화
- **WHEN** 서버가 409 `zotero_not_connected`를 돌려준다
- **THEN** 동기화 오류가 아니라 연결 안내 패널이 표시된다

### Requirement: Zotero 설정 화면
시스템은 `/settings`에서 Zotero 연결 상태(연결 여부, 사용자명, 마지막 동기화 시각)를 보여주고, 연결 해제 버튼을 제공해야 한다(SHALL). 해제는 확인 대화상자를 거쳐 `DELETE /api/zotero/connection`을 부른다. 연결이 거부되어 돌아온 경우에는 오류 안내를 함께 보여준다.

#### Scenario: 연결 해제
- **WHEN** 연결된 사용자가 해제를 누르고 확인한다
- **THEN** 204 뒤에 연결 안 됨 상태로 바뀌고 논문 목록은 지워지지 않는다는 안내가 표시된다

#### Scenario: 연결 거부로 돌아옴
- **WHEN** 사용자가 Zotero에서 승인을 거부하고 `/settings`로 돌아온다
- **THEN** 연결되지 않았다는 안내와 다시 연결하는 버튼이 표시된다

### Requirement: 웹페이지 추가
시스템은 서재에서 웹페이지 주소를 입력해 `POST /api/papers/webpage`로 논문을 추가할 수 있게 해야 한다(SHALL). 성공하면 목록을 다시 불러오고, 실패하면 입력창 근처에 서버가 알려 준 이유를 보여준다.

#### Scenario: 추가 성공
- **WHEN** 유효한 URL을 제출하고 서버가 201을 돌려준다
- **THEN** 입력이 닫히고 새 항목이 목록에 나타난다

#### Scenario: 잘못된 주소
- **WHEN** 서버가 400 `invalid_request`를 돌려준다
- **THEN** 입력은 그대로 남고 주소가 올바르지 않다는 안내가 표시된다

### Requirement: 논문 삭제
시스템은 목록 항목에서 논문을 삭제할 수 있게 하되, 확인 대화상자에서 Zotero 휴지통으로 이동하고 그 논문의 번역·분석 이력도 함께 삭제된다고 먼저 알려야 한다(SHALL). 삭제에 성공하면 목록에서 바로 사라지고, 실패하면 항목은 남고 오류가 표시된다.

#### Scenario: 삭제 확인
- **WHEN** 사용자가 항목의 삭제 버튼을 누른다
- **THEN** "Zotero 휴지통으로 이동하고 연결된 번역·분석 이력도 함께 삭제됩니다"를 담은 확인 대화상자가 열린다

#### Scenario: 삭제 성공
- **WHEN** 확인하고 서버가 성공을 돌려준다
- **THEN** 그 항목이 목록에서 사라진다

#### Scenario: 삭제 실패
- **WHEN** 서버가 오류를 돌려준다
- **THEN** 항목은 목록에 남고 대화상자 안에 오류가 표시된다

### Requirement: 논문 열기
시스템은 목록 항목을 누르면 논문 허브 주소 `/papers/{id}`로 이동해야 한다(SHALL). `id`는 응답의 내부 UUID이며 `itemKey`를 주소에 쓰지 않는다.

#### Scenario: 항목 열기
- **WHEN** 사용자가 논문 항목을 누른다
- **THEN** 브라우저 주소가 `/papers/<해당 논문의 id>`로 바뀐다

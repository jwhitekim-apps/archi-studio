# papers Specification

## Purpose

사용자의 서재를 이루는 논문 자원을 정의한다. 목록, 검색, 컬렉션, 상세, 원문 파일 제공, 논문 추가와 삭제를 다루며, 번역과 분석과 메모가 모두 이 논문 자원에 연결된다.

## Requirements

### Requirement: 논문 자원 식별
시스템은 논문마다 앱 내부 식별자 `id`(UUID)를 부여해야 한다(SHALL). 논문은 선택적으로 `itemKey`(Zotero)와 `s2PaperId`(Semantic Scholar)를 가질 수 있으며, 모든 `/api/papers/{id}` 경로는 내부 `id`로 논문을 가리킨다. 한 사용자 안에서 `itemKey`는 유일하다.

#### Scenario: 두 키를 모두 가진 논문
- **WHEN** Zotero에서 동기화된 논문을 분석해 Semantic Scholar 논문과 연결된다
- **THEN** 논문 상세 응답은 같은 `id` 아래 `itemKey`와 `s2PaperId`를 함께 돌려준다

### Requirement: 논문 목록과 검색
시스템은 `GET /api/papers`로 로그인한 사용자의 논문을 돌려줘야 한다(SHALL). `query`(제목, 저자 검색), `collection`(컬렉션 키), `limit`(기본 50, 최대 200), `cursor`(다음 페이지)를 받는다. 기본 정렬은 최근 동기화 순이다.

#### Scenario: 제목 검색
- **WHEN** `query=attention`으로 목록을 요청한다
- **THEN** 시스템은 제목이나 저자에 `attention`이 포함된 논문만 `{ "items": [...], "nextCursor": 값 또는 null }`로 돌려준다

#### Scenario: 컬렉션 필터
- **WHEN** `collection=ABCD1234`로 목록을 요청한다
- **THEN** 시스템은 그 컬렉션에 속한 논문만 돌려준다

#### Scenario: 빈 서재
- **WHEN** 동기화된 논문이 없는 사용자가 목록을 요청한다
- **THEN** 시스템은 200과 `{ "items": [], "nextCursor": null }`을 돌려준다

### Requirement: 논문 목록 항목 형식
목록의 각 항목은 `id`, `title`, `authors`(문자열 배열), `year`, `collections`(컬렉션 키 배열), `hasPdf`(boolean), `hasMemo`(boolean)를 포함해야 한다(MUST).

#### Scenario: 첨부 없는 논문
- **WHEN** PDF 첨부가 없는 논문이 목록에 포함된다
- **THEN** 그 항목의 `hasPdf`는 `false`다

### Requirement: 논문 상세
시스템은 `GET /api/papers/{id}`로 목록 항목의 모든 필드와 `itemKey`, `s2PaperId`, `attachment`(`type`: `pdf`/`html`/`null`), 그리고 연결된 번역·분석 개수를 돌려줘야 한다(SHALL). 논문 허브 화면은 이 응답으로 분석, 번역, 메모 진입점을 그린다.

#### Scenario: 상세 조회
- **WHEN** 자기 논문의 `id`로 상세를 요청한다
- **THEN** 시스템은 200과 상세 필드를 돌려준다

#### Scenario: 없는 논문
- **WHEN** 존재하지 않는 `id`로 요청한다
- **THEN** 시스템은 404와 `error.code`가 `paper_not_found`인 본문을 돌려준다

### Requirement: 컬렉션 목록
시스템은 `GET /api/collections`로 사용자의 컬렉션을 `{ "key", "name", "parentKey", "paperCount" }` 배열로 돌려줘야 한다(SHALL).

#### Scenario: 컬렉션 조회
- **WHEN** 컬렉션이 있는 사용자가 요청한다
- **THEN** 시스템은 200과 컬렉션 배열을 돌려준다

### Requirement: 원문 파일 제공
시스템은 `GET /api/papers/{id}/file`로 논문의 PDF 또는 HTML 첨부를 돌려줘야 한다(SHALL). 응답의 `Content-Type`은 첨부 종류를 따르며, 브라우저가 문서 뷰어에서 바로 열 수 있어야 한다. 첨부가 없으면 404를 돌려준다. 원문은 Zotero에서 받아 오므로 Zotero가 연결되지 않았으면 409, Zotero가 오류를 돌려주거나 응답하지 않으면 502를 돌려준다.

#### Scenario: PDF 제공
- **WHEN** PDF 첨부가 있는 논문의 파일을 요청한다
- **THEN** 시스템은 200과 `application/pdf` 본문을 돌려준다

#### Scenario: 첨부 없음
- **WHEN** 첨부가 없는 논문의 파일을 요청한다
- **THEN** 시스템은 404와 `error.code`가 `attachment_not_found`인 본문을 돌려준다

#### Scenario: Zotero 미연결 또는 장애
- **WHEN** Zotero를 연결하지 않은 사용자가 첨부가 있는 논문의 파일을 요청한다
- **THEN** 시스템은 409와 `error.code`가 `zotero_not_connected`인 본문을 돌려준다
- **AND** Zotero가 오류를 돌려주면 502와 `error.code`가 `zotero_unavailable`인 본문을 돌려주며, 본문에 Zotero 응답 원문이나 키는 없다

### Requirement: 웹페이지 논문 추가
시스템은 `POST /api/papers/webpage`로 URL을 받아 Zotero에 webpage 항목을 만들고 논문 목록에 추가해야 한다(SHALL). Zotero가 연결되지 않았으면 거부한다. Zotero가 오류를 돌려주거나 응답하지 않으면 502를 돌려준다.

#### Scenario: 추가 성공
- **WHEN** 연결된 사용자가 유효한 URL을 보낸다
- **THEN** 시스템은 201과 새 논문의 상세를 돌려준다

#### Scenario: Zotero 미연결
- **WHEN** 연결하지 않은 사용자가 요청한다
- **THEN** 시스템은 409와 `error.code`가 `zotero_not_connected`인 본문을 돌려준다

#### Scenario: Zotero 장애
- **WHEN** 연결된 사용자의 요청 중 Zotero가 오류를 돌려준다
- **THEN** 시스템은 502와 `error.code`가 `zotero_unavailable`인 본문을 돌려주고 논문 목록은 바뀌지 않는다

### Requirement: 논문 삭제
시스템은 `DELETE /api/papers/{id}`로 논문을 Zotero 휴지통으로 옮기고 앱의 논문 목록에서 제거해야 한다(SHALL). 이 논문에 연결된 번역·분석 이력도 함께 삭제한다. Zotero가 연결되지 않았으면 409, Zotero가 오류를 돌려주거나 응답하지 않으면 502를 돌려주고 앱의 논문은 그대로 둔다.

#### Scenario: 삭제 성공
- **WHEN** 자기 논문을 삭제한다
- **THEN** 시스템은 204를 돌려주고 이후 상세 요청은 404가 된다
- **AND** 연결됐던 번역·분석 이력도 함께 삭제되어 조회되지 않는다

#### Scenario: Zotero 미연결 또는 장애
- **WHEN** Zotero를 연결하지 않은 사용자가 자기 논문을 삭제한다
- **THEN** 시스템은 409와 `error.code`가 `zotero_not_connected`인 본문을 돌려주고 논문은 그대로 남는다
- **AND** Zotero가 오류를 돌려주면 502와 `error.code`가 `zotero_unavailable`인 본문을 돌려주고 논문은 그대로 남는다

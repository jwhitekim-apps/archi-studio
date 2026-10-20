## MODIFIED Requirements

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

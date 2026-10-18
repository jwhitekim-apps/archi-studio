# paper-notes Specification

## Purpose

논문 하나에 붙는 마크다운 메모를 읽고 저장하는 방법을 정의한다. 메모는 Zotero의 자식 노트로 저장되어 Zotero와 Archi Studio가 같은 내용을 본다.

## Requirements

### Requirement: 메모 조회
시스템은 `GET /api/papers/{id}/memo`로 논문의 메모를 `{ "markdown": string, "updatedAt": 시각 또는 null }`로 돌려줘야 한다(SHALL). 메모가 없으면 `markdown`은 빈 문자열이다.

#### Scenario: 메모가 있는 논문
- **WHEN** 메모가 저장된 논문의 메모를 요청한다
- **THEN** 시스템은 200과 마크다운 본문을 돌려준다

#### Scenario: 메모가 없는 논문
- **WHEN** 메모가 없는 논문의 메모를 요청한다
- **THEN** 시스템은 200과 `{ "markdown": "", "updatedAt": null }`을 돌려준다

### Requirement: 메모 저장
시스템은 `PUT /api/papers/{id}/memo`로 받은 마크다운을 그 논문의 메모로 저장해야 한다(SHALL). 저장은 멱등이며, 같은 본문을 다시 보내도 메모가 중복 생성되지 않는다. 저장된 메모는 Zotero에서 태그 `zotero-insight:memo`가 붙은 자식 노트로 보인다.

#### Scenario: 새 메모 저장
- **WHEN** 메모가 없는 논문에 마크다운을 저장한다
- **THEN** 시스템은 200과 `updatedAt`을 돌려주고 이후 조회가 같은 본문을 돌려준다

#### Scenario: 자동 저장 반복
- **WHEN** 같은 논문에 메모를 연속으로 여러 번 저장한다
- **THEN** 시스템은 항상 마지막 본문 하나만 유지하고 Zotero에 노트를 하나만 둔다

#### Scenario: Zotero 미연결
- **WHEN** Zotero를 연결하지 않은 사용자가 저장한다
- **THEN** 시스템은 409와 `error.code`가 `zotero_not_connected`인 본문을 돌려준다

### Requirement: 메모 삭제
시스템은 빈 문자열이 저장되면 그 논문의 메모 노트를 삭제해야 한다(SHALL).

#### Scenario: 빈 본문 저장
- **WHEN** 메모가 있는 논문에 빈 문자열을 저장한다
- **THEN** 시스템은 200을 돌려주고 이후 조회는 `markdown`이 빈 문자열이다

### Requirement: 메모 크기 제한
시스템은 본문이 1 MB를 넘는 저장 요청을 거부해야 한다(MUST).

#### Scenario: 너무 큰 메모
- **WHEN** 1 MB를 넘는 본문을 저장한다
- **THEN** 시스템은 413과 `error.code`가 `payload_too_large`인 본문을 돌려준다

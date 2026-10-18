# Spec Delta

## Purpose

영어 단어와 문장을 한국어로 스트리밍 번역하고, 그 이력을 논문에 연결해 저장하는 방법을 정의한다. 이 capability는 요약 수준이며 세부 형식은 구현 전에 보완한다.

## ADDED Requirements

### Requirement: 스트리밍 번역
시스템은 `POST /api/translate`로 `text`와 선택적 `paperId`를 받아 번역문을 `text/plain` 청크로 스트리밍해야 한다(SHALL). 같은 사용자가 같은 `text`를 이미 번역했다면 저장된 결과를 같은 형식으로 스트리밍한다. 저장된 결과를 재사용하더라도 요청의 `paperId`가 그 `text`의 기존 이력에 없는 논문이면 시스템은 그 논문의 이력 행을 새로 만들어야 한다(SHALL).

#### Scenario: 같은 문장을 다른 논문에서 다시 번역
- **WHEN** 논문 A에서 이미 번역한 문장을 `paperId`를 논문 B로 해서 다시 보낸다
- **THEN** 시스템은 AI를 호출하지 않고 저장된 번역문을 스트리밍하며, 논문 B의 번역 이력에 행을 새로 만든다

#### Scenario: 새 번역
- **WHEN** 번역한 적 없는 문장을 보낸다
- **THEN** 시스템은 200과 함께 번역문을 청크 단위로 흘려보내고 완료 후 이력에 저장한다

#### Scenario: 캐시된 번역
- **WHEN** 이전에 번역한 문장을 다시 보낸다
- **THEN** 시스템은 AI를 다시 호출하지 않고 저장된 번역문을 같은 형식으로 흘려보낸다

### Requirement: 번역 입력 제한과 종류 구분
시스템은 앞뒤 공백을 제거한 `text`가 1자 이상 5000자 이하일 때만 번역해야 한다(MUST). 시스템은 공백 없이 한 토큰이면 `word`, 공백이 하나라도 있으면 `sentence`로 구분해 이력의 `type`에 저장해야 한다(SHALL). 같은 `text`인지는 공백을 제거한 문자열의 정확한 일치로 판단한다.

#### Scenario: 빈 텍스트
- **WHEN** 공백뿐이거나 빈 `text`를 보낸다
- **THEN** 시스템은 400과 `error.code`가 `invalid_request`인 본문을 돌려준다

#### Scenario: 너무 긴 텍스트
- **WHEN** 5000자를 넘는 `text`를 보낸다
- **THEN** 시스템은 413과 `error.code`가 `payload_too_large`인 본문을 돌려준다
- **AND** AI를 호출하지 않는다

#### Scenario: 단어와 문장 구분
- **WHEN** `attention`을 번역하고 이어서 `attention is all you need`를 번역한다
- **THEN** 이력의 첫 항목 `type`은 `word`이고 두 번째 항목 `type`은 `sentence`다

### Requirement: 논문 연결
`paperId`는 선택 값이다. `paperId`가 주어지면 시스템은 번역 이력에 그 논문의 내부 `id`를 함께 저장해야 한다(MUST). 주어지지 않으면 시스템은 논문과 무관하게 번역하고 이력의 논문 연결은 비워 둔다. 존재하지 않거나 사용자 소유가 아닌 `paperId`는 거부해야 한다(MUST). 연결된 논문이 삭제되면 그 이력도 함께 삭제된다(papers 스펙의 "논문 삭제").

#### Scenario: 내 논문에 연결
- **WHEN** 자기 논문의 `paperId`와 `text`로 번역을 요청한다
- **THEN** 시스템은 200으로 번역문을 스트리밍하고 이력에 그 논문 id를 함께 저장한다

#### Scenario: paperId 없이 번역
- **WHEN** `paperId` 없이 `text`만 보낸다
- **THEN** 시스템은 지금처럼 번역하고 이력에는 논문 연결 없이 저장한다

#### Scenario: 남의 논문 id
- **WHEN** 다른 사용자의 `paperId`로 번역을 요청한다
- **THEN** 시스템은 404와 `error.code`가 `paper_not_found`인 본문을 돌려준다
- **AND** AI를 호출하지 않고 이력에 저장하지 않는다

#### Scenario: 없는 논문 id
- **WHEN** 존재하지 않는 `paperId`로 번역을 요청한다
- **THEN** 시스템은 남의 논문 id와 똑같이 404와 `error.code`가 `paper_not_found`인 본문을 돌려준다

### Requirement: 번역 이력 조회
시스템은 `GET /api/translate/history`로 번역 이력을 최신순으로 돌려줘야 한다(SHALL). 선택 쿼리 `paperId`로 한 논문의 이력만 걸러낼 수 있다.

#### Scenario: 논문별 이력
- **WHEN** `paperId`를 지정해 이력을 요청한다
- **THEN** 시스템은 그 논문에 연결된 번역만 돌려준다

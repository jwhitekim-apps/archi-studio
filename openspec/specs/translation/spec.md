# translation Specification

## Purpose

영어 단어와 문장을 한국어로 스트리밍 번역하고, 그 이력을 논문에 연결해 저장하는 방법을 정의한다. 이 capability는 요약 수준이며 세부 형식은 구현 전에 보완한다.

## Requirements

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

### Requirement: AI 호출 실패 처리
AI 모델이 첫 글자를 보내기 전에 실패하면 시스템은 스트리밍을 시작하지 않고 공통 오류 형식으로 응답해야 한다(MUST). 모델이 설정되지 않았으면 503 `ai_not_configured`, 그 밖의 실패와 빈 응답은 502 `ai_unavailable`이다. 스트림이 시작된 뒤 실패하면 시스템은 연결을 오류로 끝내야 하고(MUST), 그 번역은 이력에 저장하지 않아야 한다(MUST). 요청자가 도중에 연결을 끊은 경우도 저장하지 않는다.

#### Scenario: 시작 전에 모델 호출 실패
- **WHEN** 번역할 문장을 보냈는데 모델이 한 글자도 보내기 전에 오류를 낸다
- **THEN** 시스템은 502와 `error.code`가 `ai_unavailable`인 JSON 본문을 돌려준다
- **AND** 이력에 아무것도 저장하지 않는다

#### Scenario: 모델이 설정되지 않음
- **WHEN** 번역에 쓸 모델의 키나 주소가 설정되지 않은 상태에서 번역을 요청한다
- **THEN** 시스템은 503과 `error.code`가 `ai_not_configured`인 JSON 본문을 돌려준다

#### Scenario: 스트림 도중 실패
- **WHEN** 번역문이 일부 전달된 뒤 모델이 오류를 낸다
- **THEN** 시스템은 연결을 오류로 끝내고 그 번역을 이력에 저장하지 않는다
- **AND** 같은 문장을 다시 요청하면 저장된 결과가 아니라 새로 번역한다

#### Scenario: 요청자가 연결을 끊음
- **WHEN** 번역문이 전달되는 도중 요청자가 연결을 끊는다
- **THEN** 시스템은 모델 호출을 멈추고 그 번역을 이력에 저장하지 않는다

### Requirement: 번역 이력 개수 제한
`GET /api/translate/history`는 선택 쿼리 `limit`을 받아야 하며(SHALL), 값은 1 이상 200 이하의 정수이고 주어지지 않으면 50이다. 시스템은 최신순으로 앞에서부터 `limit`개만 돌려준다. 범위를 벗어나거나 정수가 아닌 `limit`은 400 `invalid_request`다. 이 요구사항은 쪽 넘김(다음 쪽 커서)을 포함하지 않는다.

#### Scenario: 기본 개수
- **WHEN** 번역 이력이 60개 있는 사용자가 `limit` 없이 이력을 요청한다
- **THEN** 시스템은 가장 최근 50개를 최신순으로 돌려준다

#### Scenario: limit 지정
- **WHEN** `limit=5`로 이력을 요청한다
- **THEN** 시스템은 가장 최근 5개만 돌려준다

#### Scenario: 범위를 벗어난 limit
- **WHEN** `limit=0` 또는 `limit=201` 또는 `limit=abc`로 이력을 요청한다
- **THEN** 시스템은 400과 `error.code`가 `invalid_request`인 본문을 돌려준다

### Requirement: paperId 형식 확인
`paperId`는 uuid 형식이어야 한다. 번역 요청 본문의 `paperId`와 이력 조회 쿼리의 `paperId`가 uuid 형식이 아니면 시스템은 400 `invalid_request`로 거부해야 한다(MUST). 형식은 맞지만 없거나 남의 논문이면 기존대로 404 `paper_not_found`다.

#### Scenario: uuid가 아닌 paperId
- **WHEN** `paperId`를 `abc`로 보내 번역을 요청한다
- **THEN** 시스템은 400과 `error.code`가 `invalid_request`인 본문을 돌려주고 AI를 호출하지 않는다

#### Scenario: 이력 필터의 잘못된 paperId
- **WHEN** 이력 조회의 `paperId` 쿼리를 `abc`로 보낸다
- **THEN** 시스템은 400과 `error.code`가 `invalid_request`인 본문을 돌려준다

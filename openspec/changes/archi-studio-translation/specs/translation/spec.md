## ADDED Requirements

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

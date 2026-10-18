# briefing Specification

## Purpose

비서(morning-desk)가 하루 한 번 만드는 브리핑 기록을 앱에서 읽는 방법을 정의한다. 브리핑 생성은 앱 밖의 크론 프로그램이 맡고, 앱은 저장된 기록을 보여 주기만 한다. 이 capability는 요약 수준이며 세부 형식은 구현 전에 보완한다.

## Requirements

### Requirement: 브리핑 목록
시스템은 `GET /api/briefings`로 로그인한 사용자의 브리핑을 최신순으로 돌려줘야 한다(SHALL). `limit`(기본 30)과 `cursor`로 페이지를 나눈다.

#### Scenario: 브리핑 조회
- **WHEN** 브리핑이 쌓인 사용자가 목록을 요청한다
- **THEN** 시스템은 200과 `{ "items": [{ "id", "date", "summary" }], "nextCursor": 값 또는 null }`을 돌려준다

### Requirement: 브리핑 상세
시스템은 `GET /api/briefings/{id}`로 브리핑 본문과 거기서 언급된 논문의 내부 `id` 목록을 돌려줘야 한다(SHALL).

#### Scenario: 논문이 언급된 브리핑
- **WHEN** 논문을 언급한 브리핑의 상세를 요청한다
- **THEN** 시스템은 본문과 `paperIds`를 돌려준다

### Requirement: 읽기 전용
앱 API는 브리핑을 만들거나 수정하거나 삭제할 수 없어야 한다(MUST).

#### Scenario: 쓰기 시도
- **WHEN** 클라이언트가 `POST /api/briefings`를 호출한다
- **THEN** 시스템은 405를 돌려준다

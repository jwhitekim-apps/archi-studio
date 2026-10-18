# Spec Delta

## MODIFIED Requirements

### Requirement: 공통 오류 형식
시스템은 `/api` 아래 모든 4xx와 5xx 응답의 본문을 `{ "error": { "code", "message" } }` 형식의 JSON으로 돌려줘야 한다(SHALL). `code`는 소문자 영문과 밑줄로 된 안정적인 문자열이고, `message`는 사람이 읽는 한국어 문장이다. 이 규칙은 프레임워크가 라우트보다 먼저 거부하는 요청(예: 다른 출처의 쓰기 요청)에도 적용된다.

#### Scenario: 없는 경로
- **WHEN** 로그인한 사용자가 존재하지 않는 `/api/...` 경로를 요청한다
- **THEN** 시스템은 404와 `error.code`가 `not_found`인 JSON 본문을 돌려준다

#### Scenario: 허용되지 않는 메서드
- **WHEN** 로그인한 사용자가 존재하는 경로에 지원하지 않는 메서드로 요청한다
- **THEN** 시스템은 405와 `error.code`가 `method_not_allowed`인 JSON 본문을 돌려준다

#### Scenario: 다른 출처의 쓰기 요청
- **WHEN** 요청의 `Origin`이 서버의 출처와 다르고 본문이 HTML 폼 형식인 `POST /api/auth/login`을 보낸다
- **THEN** 시스템은 403과 `error.code`가 `forbidden_origin`인 JSON 본문을 돌려주고 라우트를 실행하지 않는다

### Requirement: 인증되지 않은 요청 차단
시스템은 공개로 지정된 경로를 제외한 모든 `/api` 요청이 유효한 세션 없이 오면 401과 `error.code`가 `unauthenticated`인 본문을 돌려줘야 한다(MUST). 공개 경로는 목록으로 명시하고, 목록에 없는 새 경로는 기본적으로 보호된다. `/api` 여부와 공개 경로 여부는 퍼센트 인코딩을 풀어 라우터가 연결하는 경로와 같은 표현으로 판정해야 한다(MUST). 세션이 없는 요청에는 경로가 존재하는지와 상관없이 인증 거부가 경로 오류보다 먼저 적용된다.

#### Scenario: 쿠키 없음
- **WHEN** 쿠키 없이 보호된 `/api` 경로를 요청한다
- **THEN** 시스템은 401과 `unauthenticated` 본문을 돌려준다

#### Scenario: 만료되거나 위조된 쿠키
- **WHEN** 만료되었거나 서명이 맞지 않는 `archi_session`으로 요청한다
- **THEN** 시스템은 401과 `unauthenticated` 본문을 돌려주고, 사용자 정보를 라우트에 넘기지 않는다

#### Scenario: 인코딩해서 우회 시도
- **WHEN** 쿠키 없이 `POST /%61pi/auth/logout`처럼 경로 글자를 퍼센트 인코딩한 요청을 보낸다
- **THEN** 시스템은 401과 `unauthenticated` 본문을 돌려주고 라우트를 실행하지 않는다

#### Scenario: 해석할 수 없는 인코딩
- **WHEN** 쿠키 없이 `/api/%E0%A4%A`처럼 올바르지 않은 퍼센트 인코딩이 든 경로를 요청한다
- **THEN** 시스템은 401과 `unauthenticated` 본문을 돌려준다

#### Scenario: 세션 없이 없는 경로
- **WHEN** 쿠키 없이 존재하지 않는 `/api/nope`를 요청한다
- **THEN** 시스템은 404가 아니라 401과 `unauthenticated` 본문을 돌려주어 경로의 존재 여부를 드러내지 않는다

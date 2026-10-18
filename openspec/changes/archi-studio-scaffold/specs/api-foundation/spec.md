# Spec Delta

## Purpose

모든 `/api` 라우트가 공통으로 따르는 오류 형식과 인증 규칙을 정의한다. 개별 기능 API가 각자 오류를 만들지 않고 같은 형식으로 답하게 하는 것이 목적이다.

## ADDED Requirements

### Requirement: 공통 오류 형식
시스템은 `/api` 아래 모든 4xx와 5xx 응답의 본문을 `{ "error": { "code", "message" } }` 형식의 JSON으로 돌려줘야 한다(SHALL). `code`는 소문자 영문과 밑줄로 된 안정적인 문자열이고, `message`는 사람이 읽는 한국어 문장이다.

#### Scenario: 없는 경로
- **WHEN** 존재하지 않는 `/api/...` 경로를 요청한다
- **THEN** 시스템은 404와 `error.code`가 `not_found`인 JSON 본문을 돌려준다

#### Scenario: 허용되지 않는 메서드
- **WHEN** 존재하는 경로에 지원하지 않는 메서드로 요청한다
- **THEN** 시스템은 405와 `error.code`가 `method_not_allowed`인 JSON 본문을 돌려준다

### Requirement: 예상하지 못한 오류의 노출 제한
시스템은 처리하지 못한 오류가 나면 500과 `error.code`가 `internal_error`인 본문을 돌려줘야 한다(MUST). 응답에는 스택 트레이스, SQL, 키, 내부 경로를 담지 않는다.

#### Scenario: 서버 내부 예외
- **WHEN** 라우트가 처리하지 못한 예외를 던진다
- **THEN** 응답 본문에는 일반적인 `message`만 있고 예외의 원문이나 스택이 없다

### Requirement: 세션 쿠키로 사용자 식별
시스템은 `archi_session` 쿠키로 요청한 사용자를 식별해야 한다(SHALL). 이 쿠키는 `httpOnly`이고 `SameSite=Lax`이며 HTTPS에서는 `Secure`다. 유효한 세션이면 라우트가 로그인한 사용자의 id를 쓸 수 있어야 한다.

#### Scenario: 유효한 세션
- **WHEN** 유효한 `archi_session` 쿠키와 함께 보호된 경로를 요청한다
- **THEN** 시스템은 요청을 처리하고 그 사용자의 자원만 다룬다

#### Scenario: 자바스크립트에서 쿠키 접근
- **WHEN** 브라우저 스크립트가 `document.cookie`를 읽는다
- **THEN** `archi_session` 값은 보이지 않는다

### Requirement: 인증되지 않은 요청 차단
시스템은 공개로 지정된 경로를 제외한 모든 `/api` 요청이 유효한 세션 없이 오면 401과 `error.code`가 `unauthenticated`인 본문을 돌려줘야 한다(MUST). 공개 경로는 목록으로 명시하고, 목록에 없는 새 경로는 기본적으로 보호된다.

#### Scenario: 쿠키 없음
- **WHEN** 쿠키 없이 보호된 `/api` 경로를 요청한다
- **THEN** 시스템은 401과 `unauthenticated` 본문을 돌려준다

#### Scenario: 만료되거나 위조된 쿠키
- **WHEN** 만료되었거나 서명이 맞지 않는 `archi_session`으로 요청한다
- **THEN** 시스템은 401과 `unauthenticated` 본문을 돌려주고, 사용자 정보를 라우트에 넘기지 않는다

### Requirement: 상태 확인 경로
시스템은 `GET /api/health`를 공개 경로로 제공하고 서버가 요청을 받을 수 있으면 200과 `{ "status": "ok" }`를 돌려줘야 한다(SHALL). 이 응답은 사용자 정보나 DB 내용을 담지 않는다.

#### Scenario: 쿠키 없이 상태 확인
- **WHEN** 쿠키 없이 `GET /api/health`를 요청한다
- **THEN** 시스템은 200과 `{ "status": "ok" }`를 돌려준다

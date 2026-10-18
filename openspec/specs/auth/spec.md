# auth Specification

## Purpose

Archi Studio의 모든 기능이 공유하는 단일 로그인을 정의한다. 가입, 로그인, 로그아웃, 현재 사용자 조회와 베타 사용자 승인을 하나의 계정 체계로 묶는다.

## Requirements

### Requirement: 공통 오류 응답 형식
시스템은 모든 `/api/...` 오류 응답을 HTTP 상태 코드와 함께 `{ "error": { "code": string, "message": string } }` 형식의 JSON 본문으로 돌려줘야 한다(SHALL). `code`는 기계가 읽는 영문 식별자이고 `message`는 한국어 설명이다.

#### Scenario: 잘못된 요청
- **WHEN** 클라이언트가 필수 필드가 빠진 요청을 보낸다
- **THEN** 시스템은 400과 `error.code`가 `invalid_request`인 본문을 돌려준다

### Requirement: 가입
시스템은 `POST /api/auth/signup`으로 이메일과 비밀번호를 받아 계정을 만들어야 한다(SHALL). 새 계정은 승인 전(`approved=false`) 상태로 만들어지며 로그인 세션을 발급하지 않는다.

#### Scenario: 가입 성공
- **WHEN** 유효한 이메일과 8자 이상 비밀번호로 가입을 요청한다
- **THEN** 시스템은 201과 `{ "status": "pending_approval" }`을 돌려준다
- **AND** 세션 쿠키를 설정하지 않는다

#### Scenario: 이미 가입된 이메일
- **WHEN** 이미 존재하는 이메일로 가입을 요청한다
- **THEN** 시스템은 409와 `error.code`가 `email_taken`인 본문을 돌려준다

### Requirement: 베타 승인
시스템은 승인된 사용자만 로그인할 수 있게 해야 한다(MUST). 승인은 관리자가 데이터베이스에서 직접 처리하며 이 change는 승인용 화면이나 API를 정의하지 않는다.

#### Scenario: 미승인 사용자의 로그인
- **WHEN** 승인되지 않은 계정으로 로그인을 요청한다
- **THEN** 시스템은 403과 `error.code`가 `pending_approval`인 본문을 돌려준다
- **AND** 세션 쿠키를 설정하지 않는다

### Requirement: 로그인
시스템은 `POST /api/auth/login`으로 이메일과 비밀번호를 검증하고 성공하면 `httpOnly`, `SameSite=Lax` 세션 쿠키를 설정해야 한다(SHALL). 세션은 30일 유지된다.

#### Scenario: 로그인 성공
- **WHEN** 승인된 계정의 올바른 이메일과 비밀번호로 로그인을 요청한다
- **THEN** 시스템은 200과 현재 사용자 정보를 돌려주고 세션 쿠키를 설정한다

#### Scenario: 잘못된 자격 증명
- **WHEN** 비밀번호가 틀린 상태로 로그인을 요청한다
- **THEN** 시스템은 401과 `error.code`가 `invalid_credentials`인 본문을 돌려준다
- **AND** 이메일이 없는 경우와 비밀번호가 틀린 경우를 구분하지 않는다

### Requirement: 로그인 시도 제한
시스템은 같은 IP에서 15분 안에 5번 실패한 로그인 뒤의 시도를 거부해야 한다(MUST). 제한 상태는 서버 재시작 후에도 유지되어야 한다.

#### Scenario: 제한 초과
- **WHEN** 같은 IP가 15분 안에 6번째 로그인을 시도한다
- **THEN** 시스템은 429와 `error.code`가 `too_many_attempts`인 본문을 돌려준다

### Requirement: 로그아웃
시스템은 `POST /api/auth/logout`으로 현재 세션을 무효화하고 쿠키를 지워야 한다(SHALL).

#### Scenario: 로그아웃 성공
- **WHEN** 로그인한 사용자가 로그아웃을 요청한다
- **THEN** 시스템은 204를 돌려주고 같은 쿠키로 보낸 다음 요청은 401이 된다

### Requirement: 현재 사용자 조회
시스템은 `GET /api/auth/me`로 현재 로그인한 사용자의 `id`, `email`, `zoteroConnected`(boolean)를 돌려줘야 한다(SHALL).

#### Scenario: 로그인 상태
- **WHEN** 유효한 세션으로 조회한다
- **THEN** 시스템은 200과 사용자 정보를 돌려준다

#### Scenario: 비로그인 상태
- **WHEN** 세션 없이 조회한다
- **THEN** 시스템은 401과 `error.code`가 `unauthenticated`인 본문을 돌려준다

### Requirement: 인증 필수 경계
시스템은 `/api/auth/signup`, `/api/auth/login`을 제외한 모든 `/api/...` 요청에 유효한 세션을 요구해야 한다(MUST). 사용자는 자기 데이터만 읽고 쓸 수 있다.

#### Scenario: 세션 없는 보호 자원 요청
- **WHEN** 세션 없이 `GET /api/papers`를 요청한다
- **THEN** 시스템은 401과 `error.code`가 `unauthenticated`인 본문을 돌려준다

#### Scenario: 다른 사용자의 자원
- **WHEN** 사용자 A가 사용자 B의 논문 식별자로 상세를 요청한다
- **THEN** 시스템은 404를 돌려주고 B의 자원이 존재하는지 드러내지 않는다

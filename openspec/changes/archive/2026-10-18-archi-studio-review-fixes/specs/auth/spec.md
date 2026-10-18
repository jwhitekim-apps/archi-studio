# Spec Delta

## MODIFIED Requirements

### Requirement: 베타 승인
시스템은 승인된 사용자만 로그인할 수 있게 해야 한다(MUST). 승인은 관리자가 데이터베이스에서 직접 처리하며 이 change는 승인용 화면이나 API를 정의하지 않는다. 시스템은 로그인뿐 아니라 세션이 필요한 모든 요청에서 사용자의 승인 상태를 확인해야 하며(MUST), 승인되지 않았거나 승인이 취소된 사용자의 요청은 유효한 토큰이 있어도 거부해야 한다(MUST).

#### Scenario: 미승인 사용자의 로그인
- **WHEN** 승인되지 않은 계정으로 로그인을 요청한다
- **THEN** 시스템은 403과 `error.code`가 `pending_approval`인 본문을 돌려준다
- **AND** 세션 쿠키를 설정하지 않는다

#### Scenario: 직접 발급받은 토큰으로 접근
- **WHEN** 승인되지 않은 계정이 인증 서비스에서 직접 받은 접근 토큰과 갱신 토큰을 `archi_session` 쿠키 형식으로 담아 `GET /api/auth/me`를 요청한다
- **THEN** 시스템은 401과 `error.code`가 `unauthenticated`인 본문을 돌려준다
- **AND** 사용자 정보를 라우트에 넘기지 않는다

#### Scenario: 승인 취소
- **WHEN** 승인된 사용자의 승인을 데이터베이스에서 취소한 뒤 그 사용자가 이미 받은 세션 쿠키로 요청한다
- **THEN** 시스템은 다음 요청부터 401과 `error.code`가 `unauthenticated`인 본문을 돌려준다

### Requirement: 로그인
시스템은 `POST /api/auth/login`으로 이메일과 비밀번호를 검증하고 성공하면 `httpOnly`, `SameSite=Lax` 세션 쿠키를 설정해야 한다(SHALL). 세션은 마지막 요청으로부터 30일 동안 유지되며, 요청 중 토큰이 갱신되면 쿠키 유효기간도 그 시점부터 다시 30일이 된다.

#### Scenario: 로그인 성공
- **WHEN** 승인된 계정의 올바른 이메일과 비밀번호로 로그인을 요청한다
- **THEN** 시스템은 200과 현재 사용자 정보를 돌려주고 세션 쿠키를 설정한다

#### Scenario: 잘못된 자격 증명
- **WHEN** 비밀번호가 틀린 상태로 로그인을 요청한다
- **THEN** 시스템은 401과 `error.code`가 `invalid_credentials`인 본문을 돌려준다
- **AND** 이메일이 없는 경우와 비밀번호가 틀린 경우를 구분하지 않는다

#### Scenario: 활동이 이어지는 동안의 세션
- **WHEN** 사용자가 30일 안의 간격으로 계속 요청한다
- **THEN** 시스템은 세션을 끊지 않고 갱신 때마다 쿠키 유효기간을 다시 30일로 설정한다

#### Scenario: 30일 동안 활동이 없음
- **WHEN** 마지막 요청으로부터 30일이 지난 뒤 같은 쿠키로 요청한다
- **THEN** 시스템은 401과 `error.code`가 `unauthenticated`인 본문을 돌려준다

### Requirement: 로그인 시도 제한
시스템은 같은 IP에서 15분 안에 5번 실패한 로그인 뒤의 시도를 거부해야 한다(MUST). 제한 상태는 서버 재시작 후에도 유지되어야 하고, 같은 IP의 로그인 요청이 동시에 들어와도 15분 안에 실패 처리되는 시도는 5번을 넘지 않아야 한다(MUST).

#### Scenario: 제한 초과
- **WHEN** 같은 IP가 15분 안에 6번째 로그인을 시도한다
- **THEN** 시스템은 429와 `error.code`가 `too_many_attempts`인 본문을 돌려준다

#### Scenario: 병렬 요청
- **WHEN** 같은 IP가 틀린 비밀번호로 로그인 요청 8개를 동시에 보낸다
- **THEN** 시스템은 5개를 401 `invalid_credentials`로, 나머지 3개를 429 `too_many_attempts`로 처리한다

#### Scenario: 성공한 로그인은 횟수에 넣지 않음
- **WHEN** 같은 IP가 실패 4번 뒤에 올바른 자격 증명으로 로그인한다
- **THEN** 시스템은 로그인을 성공시키고 그 시도를 실패 횟수에 넣지 않는다

### Requirement: 인증 필수 경계
시스템은 `GET /api/health`, `POST /api/auth/signup`, `POST /api/auth/login`을 제외한 모든 `/api/...` 요청에 유효한 세션을 요구해야 한다(MUST). 요청 경로는 퍼센트 인코딩을 풀어 라우터가 실제로 연결하는 경로와 같은 표현으로 판정해야 하며(MUST), 인코딩 방식을 바꿔서 이 경계를 피할 수 없어야 한다. 사용자는 자기 데이터만 읽고 쓸 수 있다.

#### Scenario: 세션 없는 보호 자원 요청
- **WHEN** 세션 없이 `GET /api/papers`를 요청한다
- **THEN** 시스템은 401과 `error.code`가 `unauthenticated`인 본문을 돌려준다

#### Scenario: 인코딩된 경로
- **WHEN** 세션 없이 `POST /%61pi/auth/logout`처럼 `/api` 글자 일부를 퍼센트 인코딩한 경로를 요청한다
- **THEN** 시스템은 401과 `error.code`가 `unauthenticated`인 본문을 돌려주고 라우트를 실행하지 않는다

#### Scenario: 다른 사용자의 자원
- **WHEN** 사용자 A가 사용자 B의 논문 식별자로 상세를 요청한다
- **THEN** 시스템은 404를 돌려주고 B의 자원이 존재하는지 드러내지 않는다

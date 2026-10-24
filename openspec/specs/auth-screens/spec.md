# auth-screens Specification

## Purpose

사용자가 앱에 들어오고 나가는 화면(로그인, 가입, 승인 대기 안내, 로그아웃)과 로그인 상태를 지키는 동작을 정의한다. 서버 쪽 계약은 `auth` 스펙에 있고, 이 스펙은 그 계약을 화면에서 어떻게 보여주고 처리하는지를 다룬다.

## Requirements

### Requirement: 로그인 화면
시스템은 `/login`에 이메일과 비밀번호를 받는 로그인 화면을 제공해야 한다(SHALL). 제출하면 `POST /api/auth/login`을 호출하고, 성공하면 원래 가려던 주소(없으면 `/library`)로 이동한다. 이메일이나 비밀번호가 비어 있으면 요청을 보내지 않는다.

#### Scenario: 로그인 성공
- **WHEN** 승인된 계정의 올바른 이메일과 비밀번호를 제출한다
- **THEN** 화면은 `/library`로 이동하고 셸이 표시된다

#### Scenario: 빈 입력
- **WHEN** 비밀번호를 비운 채 제출한다
- **THEN** 서버에 요청이 가지 않고 입력창에 필수 안내가 표시된다

### Requirement: 로그인 오류 안내
시스템은 로그인 실패를 오류 종류별로 구분해 안내해야 한다(SHALL). `invalid_credentials`는 이메일이 없는 경우와 비밀번호가 틀린 경우를 구분하지 않는 한 가지 문구로, `pending_approval`은 승인 대기 안내로, `too_many_attempts`는 잠시 뒤 다시 시도하라는 안내로 보여준다.

#### Scenario: 자격 증명 오류
- **WHEN** 서버가 401 `invalid_credentials`를 돌려준다
- **THEN** "이메일 또는 비밀번호가 맞지 않습니다"와 같은 한 가지 문구가 알림으로 표시되고 비밀번호 입력은 비워진다

#### Scenario: 승인 대기
- **WHEN** 서버가 403 `pending_approval`을 돌려준다
- **THEN** 승인이 끝나야 쓸 수 있다는 안내가 표시되고 로그인 상태가 되지 않는다

#### Scenario: 시도 제한
- **WHEN** 서버가 429 `too_many_attempts`를 돌려준다
- **THEN** 잠시 뒤 다시 시도하라는 안내가 표시된다

#### Scenario: 서버 오류
- **WHEN** 서버가 500을 돌려주거나 응답이 오지 않는다
- **THEN** "서버에 연결하지 못했습니다"와 같은 안내와 다시 시도 방법이 표시된다

### Requirement: 가입 화면과 승인 대기 안내
시스템은 `/signup`에 이메일과 비밀번호(8자 이상)를 받는 가입 화면을 제공해야 한다(SHALL). 가입이 성공하면(201 `pending_approval`) 로그인된 상태가 되지 않으며, 승인 후에 로그인할 수 있다는 안내 화면을 보여준다.

#### Scenario: 가입 성공
- **WHEN** 유효한 이메일과 8자 이상 비밀번호로 가입한다
- **THEN** 승인 대기 안내가 표시되고 서재로 이동하지 않으며 로그인 화면으로 가는 링크가 있다

#### Scenario: 이미 가입된 이메일
- **WHEN** 서버가 409 `email_taken`을 돌려준다
- **THEN** 이미 가입된 이메일이라는 안내가 이메일 입력창 근처에 표시된다

#### Scenario: 짧은 비밀번호
- **WHEN** 7자 비밀번호를 입력한다
- **THEN** 서버에 요청하기 전에 8자 이상이어야 한다는 안내가 표시된다

### Requirement: 이동 주소 안전 검사
시스템은 로그인 뒤 이동할 주소(`redirect` 값)가 같은 사이트 안의 경로일 때만 따라가야 한다(MUST). 슬래시 하나로 시작하는 경로만 허용하고, `//`, `/\`, 외부 주소, 스킴이 있는 값은 무시하고 `/library`로 이동한다.

#### Scenario: 같은 사이트 경로
- **WHEN** `/login?redirect=/library?query=attention`으로 로그인한다
- **THEN** 로그인 뒤 `/library?query=attention`으로 이동한다

#### Scenario: 외부 주소
- **WHEN** `/login?redirect=//evil.example/x` 또는 `redirect=https://evil.example`로 로그인한다
- **THEN** 값을 무시하고 `/library`로 이동한다

### Requirement: 로그인 상태 확인과 만료 처리
시스템은 셸이 있는 모든 화면에 들어올 때 `GET /api/auth/me`로 로그인 상태를 확인해야 한다(SHALL). 로그인되어 있지 않거나 화면을 쓰는 중 API가 401을 돌려주면 `/login?redirect=<현재 주소>`로 보내고 세션이 끝났다는 안내를 보여준다. 다만 사용자가 입력한 글이나 받은 결과가 화면에 있는 번역 화면(`/translate`)과 분석 화면(`/analyze`)은 사용 중 401을 받으면 자동으로 이동하지 않고, 로그인이 필요하다는 안내와 같은 로그인 주소로 가는 링크를 보여준다(MUST). 이미 로그인된 사용자가 `/login`이나 `/signup`을 열면 `/library`로 보낸다.

#### Scenario: 로그인 없이 보호 화면 접근
- **WHEN** 로그인하지 않은 사용자가 `/library`를 연다
- **THEN** `/login?redirect=%2Flibrary`로 이동한다

#### Scenario: 사용 중 세션 만료
- **WHEN** 서재를 쓰는 중 목록 요청이 401을 돌려준다
- **THEN** 로그인 화면으로 이동하고 "세션이 끝났습니다. 다시 로그인해 주세요" 안내가 표시된다

#### Scenario: 번역 중 세션 만료
- **WHEN** 번역 화면에서 번역 요청이 401을 돌려준다
- **THEN** 화면은 이동하지 않고 입력한 글이 남아 있으며, 로그인 안내와 `/login?redirect=…` 링크가 보인다

#### Scenario: 이미 로그인한 사용자가 로그인 화면 접근
- **WHEN** 로그인된 사용자가 `/login`을 연다
- **THEN** `/library`로 이동한다

### Requirement: 로그아웃
시스템은 셸에서 로그아웃을 할 수 있게 해야 한다(SHALL). 누르면 `POST /api/auth/logout`을 부르고 `/login`으로 이동한다. 요청이 실패해도 사용자는 로그인 화면으로 가며, 이후 보호 화면은 열리지 않는다.

#### Scenario: 로그아웃
- **WHEN** 사용자가 로그아웃을 누른다
- **THEN** `/login`으로 이동하고 뒤로 가기로 서재를 열면 다시 로그인 화면으로 보내진다

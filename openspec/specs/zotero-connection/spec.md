# zotero-connection Specification

## Purpose

로그인한 Archi Studio 사용자가 자신의 Zotero 라이브러리를 연결하고, 논문 목록을 동기화하며, 연결을 해제하는 방법을 정의한다. Zotero는 로그인 수단이 아니라 데이터 출처로만 쓴다.

## Requirements

### Requirement: Zotero 연결 시작
시스템은 로그인한 사용자가 `GET /api/zotero/connect`를 호출하면 Zotero OAuth1 인증 페이지로 리다이렉트해야 한다(SHALL). 로그인하지 않은 사용자의 요청은 거부해야 한다(MUST).

#### Scenario: 연결 시작
- **WHEN** 로그인한 사용자가 연결을 요청한다
- **THEN** 시스템은 302로 Zotero 인증 URL로 보낸다

#### Scenario: 비로그인 연결 시도
- **WHEN** 세션 없이 연결을 요청한다
- **THEN** 시스템은 401을 돌려준다

### Requirement: Zotero 연결 완료
시스템은 `GET /api/zotero/callback`에서 Zotero가 돌려준 토큰으로 연결을 완료하고, 연결 정보를 현재 로그인한 사용자 계정에 저장해야 한다(SHALL). 저장된 Zotero 자격 정보는 어떤 API 응답에도 포함되지 않아야 한다(MUST NOT).

#### Scenario: 연결 성공
- **WHEN** 사용자가 Zotero에서 승인하고 돌아온다
- **THEN** 시스템은 서재 화면으로 리다이렉트하고 `GET /api/auth/me`의 `zoteroConnected`가 `true`가 된다

#### Scenario: 사용자가 승인을 거부
- **WHEN** Zotero가 거부 결과로 콜백을 호출한다
- **THEN** 시스템은 연결을 만들지 않고 오류 안내와 함께 설정 화면으로 리다이렉트한다

### Requirement: 연결 상태 조회
시스템은 `GET /api/zotero/status`로 `connected`, `zoteroUsername`, `lastSyncedAt`을 돌려줘야 한다(SHALL).

#### Scenario: 연결 전
- **WHEN** 연결하지 않은 사용자가 조회한다
- **THEN** 시스템은 200과 `{ "connected": false }`를 돌려준다

### Requirement: 증분 동기화
시스템은 `POST /api/zotero/sync`로 마지막 동기화 이후 바뀐 항목만 가져와 논문 목록을 갱신해야 한다(SHALL). 첫 동기화는 전체를 가져온다.

#### Scenario: 증분 동기화 성공
- **WHEN** 연결된 사용자가 동기화를 요청한다
- **THEN** 시스템은 200과 `{ "added": n, "updated": n, "removed": n, "syncedAt": 시각 }`을 돌려준다

#### Scenario: 연결되지 않은 사용자
- **WHEN** Zotero를 연결하지 않은 사용자가 동기화를 요청한다
- **THEN** 시스템은 409와 `error.code`가 `zotero_not_connected`인 본문을 돌려준다

### Requirement: 연결 해제
시스템은 `DELETE /api/zotero/connection`으로 저장된 Zotero 자격 정보를 삭제해야 한다(SHALL). 이미 동기화된 논문 목록은 유지한다.

#### Scenario: 연결 해제
- **WHEN** 연결된 사용자가 해제를 요청한다
- **THEN** 시스템은 204를 돌려주고 이후 동기화 요청은 `zotero_not_connected`가 된다

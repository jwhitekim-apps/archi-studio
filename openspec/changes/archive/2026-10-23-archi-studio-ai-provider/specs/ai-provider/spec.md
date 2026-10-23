# Spec Delta

## Purpose

서버가 외부 AI 서비스(Claude, Gemini)와 학교 서버의 로컬 모델을 같은 방식으로 부를 수 있게 하는 공용 계층의 동작 약속이다. 번역과 논문 분석이 제공자를 신경 쓰지 않고 쓰도록 선택, 오류, 스트리밍, JSON 처리를 한곳에서 정한다.

## ADDED Requirements

### Requirement: 제공자 선택
시스템은 환경 변수 `AI_PROVIDER`(`claude`, `gemini`, `local`)로 사용할 제공자를 고르고, 값이 없으면 `claude`를 쓴다(SHALL). 용도(`translation`, `analysis`)별 환경 변수가 있으면 그 용도에서는 그 값을 우선한다. 선택은 호출할 때마다 환경 변수에서 읽어, 값을 바꾸고 서버를 다시 시작하면 코드 수정 없이 적용된다.

#### Scenario: 기본값
- **WHEN** `AI_PROVIDER`가 설정되지 않은 채 번역용 제공자를 요청한다
- **THEN** 시스템은 `claude` 제공자를 돌려준다

#### Scenario: 용도별 덮어쓰기
- **WHEN** `AI_PROVIDER=claude`이고 번역용 덮어쓰기 값이 `local`이다
- **THEN** 번역용 요청은 `local` 제공자를, 분석용 요청은 `claude` 제공자를 돌려준다

#### Scenario: 알 수 없는 제공자 이름
- **WHEN** `AI_PROVIDER=foo`로 제공자를 요청한다
- **THEN** 시스템은 `ai_not_configured` 오류를 던지고, 오류 메시지에 사용할 수 있는 이름 목록이 들어 있다

#### Scenario: 키 누락
- **WHEN** `AI_PROVIDER=gemini`인데 `GEMINI_API_KEY`가 비어 있다
- **THEN** 시스템은 `ai_not_configured` 오류를 던지고, 오류 메시지에 빠진 변수 이름은 있지만 어떤 키 값도 없다

### Requirement: 모델 등급
시스템은 `fast`(빠르고 가벼움)와 `smart`(느리지만 정확함) 두 등급을 제공하고(SHALL), 제공자마다 등급별 기본 모델을 두며, 환경 변수로 등급별 모델 이름을 덮어쓸 수 있어야 한다. 정의되지 않은 등급을 요청하면 오류를 낸다.

#### Scenario: 등급별 모델
- **WHEN** `smart` 등급으로 호출한다
- **THEN** 선택된 제공자의 `smart` 모델 이름으로 요청이 나간다

#### Scenario: 모델 이름 덮어쓰기
- **WHEN** 해당 제공자의 `fast` 모델 환경 변수를 다른 이름으로 설정하고 `fast`로 호출한다
- **THEN** 설정한 이름으로 요청이 나간다

#### Scenario: 없는 등급
- **WHEN** `ultra` 같은 정의되지 않은 등급으로 호출한다
- **THEN** 시스템은 `ai_not_configured` 오류를 던진다

### Requirement: 단일 응답 호출
시스템은 시스템 지시문과 사용자 입력과 최대 출력 길이를 받아 모델의 전체 응답을 앞뒤 공백을 제거한 문자열로 돌려주는 `complete` 호출을 제공해야 한다(SHALL). 모델이 빈 응답을 주면 조용히 넘어가지 않고 `ai_empty_response` 오류를 낸다.

#### Scenario: 정상 응답
- **WHEN** 모델이 `"  안녕  "`을 돌려준다
- **THEN** `complete`는 `"안녕"`을 돌려준다

#### Scenario: 빈 응답
- **WHEN** 모델 응답 본문이 비어 있다(예: 안전 필터 차단, 출력 길이 부족)
- **THEN** `complete`는 `ai_empty_response` 오류를 던지고, 로그에는 제공자가 알려 준 종료 이유가 남는다

### Requirement: 스트리밍 호출
시스템은 모델이 만든 글자를 도착하는 대로 하나씩 내보내는 `stream` 호출을 제공해야 한다(SHALL). 빈 조각은 건너뛰고, 호출자가 취소 신호를 보내면 모델 쪽 요청도 중단한다. 스트림이 글자를 하나도 내보내지 못하고 끝나면 조용히 끝내지 않고 `ai_empty_response` 오류를 낸다.

#### Scenario: 순서대로 도착
- **WHEN** 모델이 조각 `"안"`, `"녕"`을 차례로 보낸다
- **THEN** `stream`은 같은 순서로 두 조각을 내보내고 끝난다

#### Scenario: 빈 조각
- **WHEN** 모델이 빈 문자열 조각을 보낸다
- **THEN** `stream`은 그 조각을 내보내지 않는다

#### Scenario: 글자 없이 끝난 스트림
- **WHEN** 모델이 빈 조각만 보내거나 조각 없이 스트림을 끝낸다(예: 생각하는 모델이 출력 한도를 생각에 다 씀)
- **THEN** `stream`은 `ai_empty_response` 오류를 던지고, 로그에는 제공자가 알려 준 종료 이유가 남는다

#### Scenario: 호출자의 취소
- **WHEN** 스트리밍 도중 호출자가 취소 신호를 보낸다
- **THEN** `stream`은 더 이상 조각을 내보내지 않고 모델 쪽 연결을 닫는다

### Requirement: 오류 코드와 재시도
시스템은 제공자의 모든 실패를 다섯 코드(`ai_not_configured`, `ai_unavailable`, `ai_rate_limited`, `ai_empty_response`, `ai_invalid_json`) 중 하나를 가진 오류로 바꿔 던져야 한다(MUST). 호출 제한 초과(429)와 서버 오류(5xx)와 네트워크 실패는 두 번까지 간격을 늘려 가며 다시 시도하고, 요청 형식 오류(4xx)는 다시 시도하지 않는다. 스트리밍은 첫 조각이 나가기 전의 실패만 다시 시도한다.

#### Scenario: 일시적 실패 후 성공
- **WHEN** 첫 요청이 429로 실패하고 두 번째 요청이 성공한다
- **THEN** 호출자는 성공한 응답을 받고 오류를 보지 못한다

#### Scenario: 재시도 소진
- **WHEN** 세 번의 시도가 모두 5xx로 실패한다
- **THEN** 시스템은 `ai_unavailable` 오류를 던진다(429만 계속 실패했다면 `ai_rate_limited`)

#### Scenario: 요청 형식 오류
- **WHEN** 제공자가 400으로 거부한다
- **THEN** 시스템은 다시 시도하지 않고 `ai_unavailable` 오류를 던진다

#### Scenario: 스트리밍 중간 실패
- **WHEN** 스트리밍에서 조각이 이미 나간 뒤 연결이 끊긴다
- **THEN** 시스템은 다시 시도하지 않고 `ai_unavailable` 오류를 던진다

### Requirement: JSON 응답 처리
시스템은 모델에게 JSON만 출력하라고 요구하는 공용 지시문을 제공하고(SHALL), 응답에서 첫 `{`부터 마지막 `}`까지를 잘라 JSON 객체로 읽는 파서를 제공해야 한다. 코드 울타리(```)나 앞뒤 설명이 섞여 있어도 읽어야 하고, 읽지 못하면 `ai_invalid_json` 오류를 낸다.

#### Scenario: 코드 울타리가 섞인 응답
- **WHEN** 응답이 ```json 으로 시작하고 JSON 객체를 감싸고 있다
- **THEN** 파서는 객체를 돌려준다

#### Scenario: 앞뒤 설명이 붙은 응답
- **WHEN** 응답이 설명 한 줄, JSON 객체, 설명 한 줄로 이루어져 있다
- **THEN** 파서는 객체를 돌려준다

#### Scenario: JSON이 없는 응답
- **WHEN** 응답에 `{`나 `}`가 없다
- **THEN** 파서는 `ai_invalid_json` 오류를 던진다

#### Scenario: 깨진 JSON
- **WHEN** 응답의 `{`와 `}` 사이가 올바른 JSON이 아니다
- **THEN** 파서는 `ai_invalid_json` 오류를 던진다

### Requirement: 비밀값과 로그
시스템은 API 키를 환경 변수에서만 읽고(MUST), 키 값을 오류 메시지, 로그, 응답 어디에도 내보내지 않아야 한다. 호출 기록은 제공자 이름, 모델 등급, 걸린 시간, 성공 여부와 오류 코드만 남기고 프롬프트와 모델 응답 내용은 남기지 않는다.

#### Scenario: 성공 호출의 로그
- **WHEN** 호출이 성공한다
- **THEN** 로그에는 제공자, 등급, 걸린 시간만 있고 프롬프트나 응답 문장은 없다

#### Scenario: 실패 호출의 로그
- **WHEN** 호출이 실패한다
- **THEN** 로그에는 오류 코드가 있고 API 키 값은 없다

### Requirement: 로컬 모델 접속
시스템은 `local` 제공자를 OpenAI 호환 채팅 방식(`/v1/chat/completions`)으로 구현하고(SHALL), 주소가 `https://`가 아니면 거부하며 인증서 검증을 끄지 않아야 한다. 학교 서버의 자체 서명 인증서는 실행 환경에서 인증서를 고정하는 방식(`NODE_EXTRA_CA_CERTS`)으로 신뢰한다.

#### Scenario: 평문 주소 거부
- **WHEN** `LOCAL_LLM_BASE_URL`이 `http://`로 시작한다
- **THEN** 시스템은 요청을 보내지 않고 `ai_not_configured` 오류를 던진다

#### Scenario: 스트리밍 응답 읽기
- **WHEN** 로컬 서버가 줄 단위 이벤트로 조각을 보내고 마지막에 `[DONE]`을 보낸다
- **THEN** `stream`은 조각을 순서대로 내보내고 `[DONE]`에서 끝난다

### Requirement: 시험 가능성
시스템은 외부 서비스와 통신하는 부분(SDK 클라이언트, `fetch`, 대기 시간)을 호출자가 바꿔 끼울 수 있게 만들고(SHALL), 번역·분석 시험이 네트워크 없이 쓸 수 있는 가짜 제공자를 함께 제공해야 한다.

#### Scenario: 가짜 제공자
- **WHEN** 시험에서 가짜 제공자에 정해진 응답을 넣고 `complete`와 `stream`을 부른다
- **THEN** 네트워크 요청 없이 정해진 응답이 돌아오고, 오류를 지정하면 같은 코드의 오류가 던져진다

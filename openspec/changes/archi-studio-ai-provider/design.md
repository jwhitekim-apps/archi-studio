# Design

## Context

- 벨루의 `server/app/ai_provider.py`(229줄)가 기준이다. 추상 클래스 `AIProvider`에 `complete`(동기, 이미지 첨부 가능)와 `stream`(비동기, 글자 조각)이 있고, `ClaudeProvider`와 `GeminiProvider`가 구현한다. 선택은 환경 변수 `AI_PROVIDER`(기본 `claude`), 모델은 `fast`/`smart` 두 등급이며 `CLAUDE_MODEL_FAST/SMART`, `GEMINI_MODEL_FAST/SMART`로 덮어쓴다. JSON을 받는 쪽은 `JSON_OUTPUT_CONTRACT` 문구와 `extract_json`(첫 `{`부터 마지막 `}`까지)을 쓴다.
- 벨루의 호출 지점 중 이번 이식 범위에 들어오는 것은 둘이다. 번역(`translator.py`, `stream`, `smart` 등급, 최대 4096 토큰)과 분석(`paper_analyzer/core/*`, `complete`, 최대 1024 토큰, JSON 응답). Model Review(이미지 입력)와 Contextor는 `legacy-map.md`에서 이식 범위 밖이다.
- Gemini 쪽에는 벨루가 이미 겪은 문제가 하나 있다. 안전 필터에 막히거나 출력 길이가 모자라면 예외 없이 빈 응답이 와서, 호출 쪽에서 JSON 파싱 오류로 터져 원인을 찾기 어려웠다. 벨루는 이를 502로 바꿨다(`complete`만). 새 계층은 `ai_empty_response` 코드로 명시한다.
- `morning-desk`(비서)는 학교 로컬 모델에 HTTPS로만 접속하고, 인증서 검증을 끄지 않으며(자체 서명 인증서는 `NODE_EXTRA_CA_CERTS`로 고정), 모델에 보낸 내용은 로그에 남기지 않는다. 같은 규칙을 `local` 제공자에 적용한다.
- 이 서버는 Node 20이다. 서버 코드에서만 쓰고 클라이언트 번들에 들어가면 안 된다. 기존 서버 코드는 `src/lib/server/`에 있고, 이미 `supabase-options.ts`로 Node 20의 전역 `WebSocket` 부재를 우회한 전례가 있어, 새 SDK도 Node 20에서 불러오는지 가장 먼저 확인한다.
- 이 change는 API 경로와 DB를 건드리지 않는다. 번역·분석 change가 이 모듈을 가져다 쓴다.

## Goals / Non-Goals

**Goals:**
- 번역과 분석이 제공자를 모른 채 `getAiProvider('translation')`처럼 가져와 `complete`/`stream`만 부르게 한다.
- 제공자 교체와 용도별 전환(예: 번역은 외부, 분석은 로컬)을 코드 수정 없이 환경 변수만으로 한다. 아직 정해지지 않은 "AI 사용 원칙"을 코드가 아니라 설정으로 풀 수 있게 하는 것이 핵심이다.
- 실패의 종류를 다섯 코드로 통일해서, 번역·분석이 HTTP 오류 응답으로 바꾸는 규칙을 한 곳에서 쓸 수 있게 한다.
- 모든 외부 통신을 바꿔 끼울 수 있게 해서 단위 테스트에서 네트워크를 쓰지 않는다.

**Non-Goals:**
- 이미지 입력, 도구 호출(tool use), 여러 턴 대화, 토큰 사용량 집계, 비용 제한. 필요해지면 그때 인터페이스를 확장한다.
- 프롬프트 문구(번역 지시문, 분석 지시문). 각 기능 change가 가진다.
- AI 오류를 HTTP 상태 코드로 바꾸는 규칙. 번역·분석 change가 정한다(아래 열린 질문 5).
- 응답 캐시. 번역 캐시는 번역 change가 만든다.

## Decisions

**1. 위치와 파일 구성: `src/lib/server/ai/`.**
`types.ts`(인터페이스, 등급, `AiError`), `config.ts`(환경 변수 해석), `retry.ts`, `json.ts`, `claude.ts`, `gemini.ts`, `local.ts`, `fake.ts`(시험용), `index.ts`(`getAiProvider`). 서버 전용 폴더라서 SvelteKit이 클라이언트 번들에 넣지 않는다. 빌드 뒤 `build/client`에 SDK 이름이 없는지 검사한다.

**2. 인터페이스는 단순하게, 객체 하나를 받는다.**
```
complete({ system, user, maxTokens, tier, signal }) -> Promise<string>
stream({ system, user, maxTokens, tier, signal }) -> AsyncIterable<string>
```
벨루의 위치 인자 대신 객체를 받아, 나중에 항목을 추가해도 호출 쪽이 깨지지 않는다. `tier` 기본값은 `complete`가 `fast`, `stream`이 `smart`로 벨루와 같다. 이미지 인자는 없다.

**3. 공식 SDK를 쓰되 클라이언트는 주입 가능하게 한다.**
Claude는 `@anthropic-ai/sdk`, Gemini는 `@google/genai`를 쓴다. 직접 `fetch`로 짜는 대안은 스트리밍 파싱과 재시도를 두 벌 만들어야 해서 버렸다. 생성자가 SDK 클라이언트(또는 그것과 같은 모양의 가짜)를 받을 수 있게 해서 시험에서 네트워크를 쓰지 않는다. `local`은 SDK 없이 `fetch`로 만든다(OpenAI 호환 `chat/completions`, 서버가 보내는 이벤트 줄 읽기). `fetch`도 주입 가능하다.

**4. 제공자 선택은 호출할 때마다 환경 변수에서 읽는다.**
벨루와 같은 방식이다(클라이언트 생성이 가볍다). 우선순위는 용도별 변수(`AI_PROVIDER_TRANSLATION`, `AI_PROVIDER_ANALYSIS`) → `AI_PROVIDER` → `claude`. 용도 이름은 타입으로 고정(`'translation' | 'analysis'`)해서 오타가 컴파일 오류가 되게 한다. SvelteKit의 환경 변수 읽기(`$env/dynamic/private`)를 쓰되 `config.ts`에서만 읽고, 시험에서는 환경 객체를 주입한다.

**5. 모델 기본값.**
`claude`는 `fast`가 `claude-haiku-5-5`, `smart`가 `claude-sonnet-5-5`, `gemini`는 벨루 기본값(`gemini-3.1-flash-lite`, `gemini-3.5-flash`)을 쓰고 등급별 환경 변수로 덮어쓴다. 벨루의 기본값(`claude-haiku-4-5-20251001`, `claude-sonnet-4-6`)은 옛 세대여서 그대로 가져오지 않는다. 모델 이름은 자주 바뀌므로 구현 때 공급자 문서로 한 번 더 확인한다(열린 질문 3). `local`은 기본 모델이 없고 `LOCAL_LLM_MODEL`이 필수다(`morning-desk`와 같은 이름).

**6. 오류는 다섯 코드, 재시도는 얇게.**
`AiError`는 `code`, `retryable`, 사람이 읽는 `message`를 가진다. 제공자별 오류를 한 표로 바꾼다: 429는 `ai_rate_limited`, 5xx·연결 실패·시간 초과는 `ai_unavailable`, 그 밖의 4xx는 `ai_unavailable`(재시도 없음), 키·이름·주소 문제는 `ai_not_configured`, 빈 응답은 `ai_empty_response`, JSON 해석 실패는 `ai_invalid_json`. 재시도는 `retry.ts` 한 곳에서 두 번, 대기 시간 500ms와 1500ms로 늘린다. 대기 함수는 주입 가능하다(시험에서 실제로 기다리지 않는다). `Retry-After` 헤더가 있으면 그 값을 존중하되 상한(5초)을 둔다. 스트리밍은 첫 조각이 나가기 전에만 재시도한다. 이미 글자를 내보냈다면 같은 글자가 중복되기 때문이다.

**7. JSON 도우미는 벨루와 같은 동작을 옮긴다.**
`JSON_OUTPUT_CONTRACT` 문구를 그대로 옮기고, `extractJson(raw)`는 코드 울타리를 벗기고 첫 `{`부터 마지막 `}`까지를 `JSON.parse`한다. 실패하면 `ai_invalid_json`을 던진다. 객체만 다루고 배열 최상위는 지원하지 않는다(벨루와 같다).

**8. 로그는 구조화하고 내용은 남기지 않는다.**
호출마다 `{provider, tier, ms, ok, code}` 한 줄만 남긴다. 프롬프트, 응답, 키, 요청 URL의 쿼리는 남기지 않는다. 프롬프트에 논문 본문이 들어가는 분석 때문이다. 로거는 주입 가능하고 시험에서 캡처해 검사한다.

**9. 시험용 가짜 제공자를 같은 모듈에서 내보낸다.**
`createFakeProvider({ responses, chunks, error })`가 `AiProvider`를 구현한다. 번역·분석 change의 라우트 시험이 이것을 `getAiProvider` 대신 주입한다.

**10. 실제 외부 호출 시험은 선택이다.**
`AI_LIVE_TEST=1`일 때만 도는 짧은 호출 시험(`complete`, `stream` 각 1회)을 따로 둔다. 기본 `npm test`에서는 건너뛴다. 키를 가진 사용자가 구현 때 한 번 돌려 확인한다. 이 제안서를 쓰는 동안에는 외부 서비스에 접속하지 않았다.

## Risks / Trade-offs

- [SDK가 Node 20에서 안 불러와질 수 있다] → 의존성 추가 직후 가져오기만 하는 시험과 `npm run build`로 먼저 확인한다. 안 되면 `fetch` 직접 구현으로 후퇴하되 인터페이스는 그대로다.
- [모델 이름이 바뀌어 기본값이 죽을 수 있다] → 환경 변수 덮어쓰기가 있고, 모델 이름 오류(404)는 `ai_unavailable`과 구분되는 로그(상태 코드)를 남긴다.
- [Gemini가 빈 응답을 주는 문제] → `ai_empty_response`로 명시하고 종료 이유를 로그에 남긴다. 호출자가 `maxTokens`를 늘려 다시 부를 수 있다.
- [용도별 덮어쓰기가 설정을 복잡하게 만든다] → 용도는 두 개뿐이고 변수는 없으면 무시된다. AI 사용 원칙이 정해지기 전까지 코드 변경 없이 선택지를 열어 두려는 비용이다.
- [재시도가 응답 시간을 늘린다] → 총 대기 상한이 약 2초(500ms + 1500ms)이고 429·5xx·연결 실패에만 적용한다. 번역은 스트리밍이라 첫 조각 전에만 해당한다.
- [`local` 제공자를 구현해도 발표 때 쓸 수 있는지는 모른다] → 코드는 기본 꺼짐이고, 발표 전 학교 모델 동작을 집 서버에서 확인한 뒤 환경 변수만 바꿔 켠다. 학교 모델이 안 되면 `claude`로 둔 채 발표한다.

## Migration Plan

1. 새 모듈과 의존성만 더하는 변경이라 기존 동작은 바뀌지 않는다.
2. 번역·분석 change가 이 모듈을 가져다 쓰기 전까지는 어디에서도 호출되지 않는다.
3. 되돌리기: `src/lib/server/ai/`, 의존성 두 개, `.env.example` 줄, 문서를 지우면 끝이다.

## Open Questions

1. **벨루의 외부 AI 키를 계속 쓸지, 학교 로컬 모델로 바꿀지.** 추천: 계속 쓴다(`claude`가 기본, `gemini`는 교체용으로만 둔다). 번역·분석 품질을 로컬 모델이 보장하는지는 확인하지 못했고, 발표 일정상 품질 검증에 쓸 시간이 없다.
2. **AI 사용 원칙(예: 민감한 내용은 로컬 모델에만).** 추천: 이번에는 원칙을 코드로 강제하지 않고, 용도별 환경 변수로 로컬 전환만 가능하게 해 둔다. 논문 본문이 공개 자료인지 미발표 원고인지에 따라 사용자가 판단할 일이고, 판단이 서면 환경 변수 한 줄로 반영된다. 원칙은 문서(`docs/dev/ai-provider.md`)에 한 문단으로 적는다.
3. **기본 모델 이름.** 추천: 위 결정 5의 값으로 시작하고 구현 때 공급자 문서의 현재 이름과 비교한다.
4. **`local` 제공자를 이번에 구현할지.** 추천: 구현하되 맨 뒤 작업으로 두고 기본 꺼짐으로 둔다. 구현량이 작고(`fetch` 하나), 질문 1·2가 어느 쪽으로 정해져도 대응할 수 있다. 시간이 모자라면 이 작업만 건너뛰어도 나머지가 동작한다.
5. **AI 오류를 HTTP 응답으로 바꾸는 규칙.** 추천: `ai_rate_limited`는 429, `ai_unavailable`·`ai_empty_response`·`ai_invalid_json`은 502, `ai_not_configured`는 500. 확정은 번역·분석 change가 하되 같은 표를 쓰도록 이 문서에 먼저 적어 둔다.

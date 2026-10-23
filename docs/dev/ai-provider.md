# AI 제공자 계층

번역과 논문 분석이 외부 AI(Claude, Gemini)나 학교 로컬 모델을 같은 방식으로 부르는 서버 전용 모듈이다. 코드는 `src/lib/server/ai/`에 있고 클라이언트 번들에 들어가지 않는다.

```ts
import { getAiProvider } from '$lib/server/ai';

const ai = getAiProvider('translation');
for await (const chunk of ai.stream({ system, user, maxTokens: 4096 })) { /* ... */ }
const text = await getAiProvider('analysis').complete({ system, user, maxTokens: 1024 });
```

- `complete`: 전체 응답을 앞뒤 공백을 지운 문자열로 돌려준다. 기본 등급은 `fast`.
- `stream`: 글자 조각을 도착하는 대로 내보낸다. 기본 등급은 `smart`. 글자를 하나도 못 내보내고 끝나면 `ai_empty_response`를 던진다. `signal`로 취소하면 오류 없이 끝나고 모델 쪽 연결도 닫힌다.
- JSON 응답이 필요하면 지시문에 `JSON_OUTPUT_CONTRACT`를 붙이고 `extractJson(text)`로 읽는다.
- 시험에서는 `createFakeProvider({ responses, chunks, error })`를 넣어 네트워크 없이 돌린다.

## 환경 변수

값은 `.env`에만 적는다. `.env.example`에는 이름만 있다. 선택은 호출할 때마다 다시 읽으므로 값을 바꾸고 서버를 다시 시작하면 적용된다.

| 변수 | 뜻 | 기본값 |
|---|---|---|
| `AI_PROVIDER` | 제공자: `claude`, `gemini`, `local` | `claude` |
| `AI_PROVIDER_TRANSLATION` | 번역에서만 쓸 제공자. 있으면 `AI_PROVIDER`보다 우선 | 없음 |
| `AI_PROVIDER_ANALYSIS` | 분석에서만 쓸 제공자. 있으면 `AI_PROVIDER`보다 우선 | 없음 |
| `ANTHROPIC_API_KEY` | Claude 키. `claude`를 쓸 때 필수 | 없음 |
| `GEMINI_API_KEY` | Gemini 키. `gemini`를 쓸 때 필수 | 없음 |
| `CLAUDE_MODEL_FAST` / `CLAUDE_MODEL_SMART` | Claude 등급별 모델 이름 | `claude-haiku-5-5` / `claude-sonnet-5-5` |
| `GEMINI_MODEL_FAST` / `GEMINI_MODEL_SMART` | Gemini 등급별 모델 이름 | `gemini-3.1-flash-lite` / `gemini-3.5-flash` |
| `LOCAL_LLM_BASE_URL` | 로컬 모델 주소. 비서와 같은 값(`https://…/v1`까지). `https://`만 허용 | 없음 |
| `LOCAL_LLM_API_KEY` | 로컬 모델 키. 없으면 인증 헤더를 보내지 않는다 | 없음 |
| `LOCAL_LLM_MODEL` | 로컬 모델 이름. `local`을 쓸 때 필수, 두 등급이 같은 모델을 쓴다 | 없음 |

Gemini 기본 모델 이름은 벨루 값을 그대로 가져왔고 현재 공급자 문서와는 비교하지 못했다. 이름이 바뀌어 404가 나면 로그의 `status: 404`로 알 수 있고, 등급별 변수로 덮어쓴다.

로컬 모델은 인증서 검증을 끄지 않는다. 학교 서버의 자체 서명 인증서는 서버를 띄울 때 `NODE_EXTRA_CA_CERTS=<인증서 파일>`로 신뢰한다.

## 오류 코드

모든 실패는 `AiError`(`code`, `retryable`, `message`)로 던져진다. 메시지에는 키, 프롬프트, 모델 응답을 넣지 않는다. 아래 HTTP 응답은 권장이며 확정은 번역·분석 change가 한다.

| 코드 | 언제 | 권장 HTTP 응답 |
|---|---|---|
| `ai_not_configured` | 키·모델·주소 누락, 알 수 없는 제공자나 등급, 평문 `http://` 로컬 주소 | 500 |
| `ai_unavailable` | 5xx, 연결 실패, 시간 초과, 그 밖의 4xx(형식 오류, 키 거부, 없는 모델), 스트리밍 도중 끊김, 취소된 `complete` | 502 |
| `ai_rate_limited` | 429가 재시도 뒤에도 계속될 때 | 429 |
| `ai_empty_response` | 응답 본문이 비었거나 `stream`이 글자 없이 끝났을 때(안전 필터 차단, 출력 길이 부족). 로그에 종료 이유가 남는다 | 502 |
| `ai_invalid_json` | `extractJson`이 JSON 객체를 읽지 못했을 때 | 502 |

재시도는 429, 408, 5xx, 연결 실패에만 두 번 한다(500ms, 1500ms 대기). `Retry-After` 헤더가 있으면 그 값을 쓰되 5초를 넘지 않는다. 스트리밍은 첫 조각이 나가기 전에만 다시 시도한다. SDK 자체 재시도는 꺼 두었다.

## 로그

호출마다 `{"event":"ai_call","provider","tier","ms","ok","code"}` 한 줄을 남긴다. 진단용으로 제공자의 HTTP 상태(`status`)와 종료 이유(`finishReason`)가 붙을 수 있다. 프롬프트, 응답, 키는 남기지 않는다.

## 새 제공자 추가

1. `src/lib/server/ai/<이름>.ts`에 `BaseProvider`를 상속한 클래스를 만들고 `completeOnce`, `streamOnce`만 구현한다. 재시도, 빈 응답 검사, 빈 조각 건너뛰기, 로그는 `BaseProvider`가 한다.
2. 외부 통신(SDK 클라이언트나 `fetch`)은 생성자로 받아 시험에서 가짜를 넣을 수 있게 한다. SDK 오류에 `status`(숫자)가 있으면 공용 변환이 코드를 정한다.
3. `types.ts`의 `AI_PROVIDER_NAMES`, `config.ts`의 `resolveAiConfig`, `index.ts`의 `getAiProvider`에 이름을 더한다.
4. 가짜 클라이언트 단위 시험과 `ai.live.ts` 실제 호출 시험으로 확인한다.

## AI 사용 원칙

논문 본문과 메모는 외부 AI 서비스로 나갈 수 있다. 공개된 논문은 기본값(`claude`)으로 처리해도 되지만, 미발표 원고나 외부에 내보내면 안 되는 자료를 다룰 때는 해당 용도의 제공자를 `local`로 바꾼다(예: `AI_PROVIDER_ANALYSIS=local`). 이 판단은 코드로 강제하지 않고 운영자가 환경 변수로 정한다. 어느 제공자를 쓰든 프롬프트와 응답은 로그에 남지 않는다.

## 실제 호출 확인

기본 `npm test`는 네트워크를 쓰지 않는다. 키를 `.env`에 넣은 뒤 아래처럼 제공자별로 한 번씩 확인한다.

```bash
AI_LIVE_TEST=1 npm run test:ai-live                      # .env의 AI_PROVIDER(기본 claude)
AI_LIVE_TEST=1 AI_PROVIDER=gemini npm run test:ai-live
AI_LIVE_TEST=1 AI_PROVIDER=local npm run test:ai-live    # 집 서버에서, 학교 모델
```

## 알려진 문제

실패하면 오류 코드와 단계(주소, 인증서, 인증, 응답)를 여기에 적는다.

- **학교 모델(`local`, 2026-10-23 확인)**: 비서와 같은 주소·키·모델(`qwen3.6:35b-a3b`)과 `NODE_EXTRA_CA_CERTS=/etc/nginx/llm-origin.crt`로 `complete`와 `stream`이 통과했다.
- **학교 모델은 답하기 전에 생각한다**: 생각 글자도 출력 한도를 쓴다. 한도 16에서는 늘, 1024에서는 8번 중 1번 꼴로 생각만 하다 끝났다(종료 이유 `length`). 이때 `complete`와 `stream` 모두 `ai_empty_response`를 던지고 로그에 `finishReason: "length"`가 남는다. 한도는 4096 이상을 준다.
- **학교 모델은 번역 첫 글자까지 오래 걸린다(2026-10-23)**: 개발 서버에서 한 문장을 번역했더니 첫 글자까지 약 41초, 그 뒤 나머지는 0.2초 안에 왔다. 답하기 전 생각 시간이다. 같은 문장 재요청은 저장된 번역이라 0.02초였다.
- **학교 모델은 동시 요청을 줄 세운다**: 8개를 한꺼번에 보내면 하나가 4초, 마지막이 41초 걸렸다. 문단마다 부르는 번역은 동시에 여러 개를 보내지 않는 편이 낫다.
- **Gemini(2026-10-23)**: 받은 키의 프로젝트가 선불 결제에 묶여 있고 크레딧이 바닥나 HTTP 402로 막혔다. 무료 등급으로 쓰려면 그 프로젝트의 결제를 끈다.

# Tasks

## 1. 준비

- [x] 1.1 `@anthropic-ai/sdk`와 `@google/genai`를 dependencies에 추가하고, 두 패키지를 불러오기만 하는 단위 테스트(`src/lib/server/ai/sdk-load.test.ts`)와 `npm run check`, `npm test`, `npm run build`가 Node 20에서 통과하는지 확인한다. 이어서 `grep -rlE "anthropic|genai" build/client`가 0건이어서 SDK가 클라이언트 번들에 들어가지 않았음을 확인한다. 불러오기가 실패하면 보고하고 멈춘다(`fetch` 직접 구현으로 후퇴할지는 사용자가 정한다)
- [x] 1.2 `src/lib/server/ai/types.ts`에 `AiProvider` 인터페이스(`complete`, `stream`), 등급 `fast | smart`, 용도 `translation | analysis`, `AiError`(`code`, `retryable`, `message`)를 만들고, 오류 코드 다섯 개가 모두 생성 가능하고 `instanceof AiError`로 구분되는지 단위 테스트로 확인한다

## 2. 설정과 공용 도우미

- [x] 2.1 `config.ts`에 환경 변수 해석을 만들고(환경 객체를 인자로 받음), 기본값 `claude`, `AI_PROVIDER=gemini`, 용도별 덮어쓰기(`AI_PROVIDER_TRANSLATION=local`), 알 수 없는 이름, 키 누락(`ai_not_configured`, 메시지에 변수 이름만 있고 키 값은 없음), 등급별 모델 덮어쓰기를 표 형태 단위 테스트로 확인한다
- [x] 2.2 `json.ts`에 `JSON_OUTPUT_CONTRACT`와 `extractJson`을 옮기고, 코드 울타리 응답, 앞뒤 설명이 붙은 응답, 중첩 객체, `{`·`}`가 없는 응답, 깨진 JSON이 각각 기대한 결과(객체 또는 `ai_invalid_json`)가 나오는지 단위 테스트로 확인한다
- [x] 2.3 `retry.ts`에 재시도 도우미(대기 함수 주입)를 만들고, 429 한 번 뒤 성공, 5xx 세 번 연속 실패(`ai_unavailable`), 429만 세 번(`ai_rate_limited`), 400은 재시도 없음, `Retry-After`가 상한 5초로 잘림, 스트리밍은 첫 조각 뒤 재시도 없음을 단위 테스트로 확인한다. 테스트가 실제로 기다리지 않아 1초 안에 끝나야 한다

## 3. 제공자

- [x] 3.1 `claude.ts`에 `ClaudeProvider`를 만들고(SDK 클라이언트 주입), 등급에 따른 모델 이름, 시스템 지시문 전달, `complete`의 공백 제거, `stream`의 조각 순서, 취소 신호로 중단, SDK 오류의 코드 변환(429, 5xx, 400, 연결 실패)을 가짜 클라이언트 단위 테스트로 확인한다
- [x] 3.2 `gemini.ts`에 `GeminiProvider`를 만들고, 3.1과 같은 항목에 더해 빈 응답이 `ai_empty_response`가 되고 로그에 종료 이유가 남는지, `stream`이 빈 조각을 건너뛰는지 가짜 클라이언트 단위 테스트로 확인한다
- [x] 3.3 `index.ts`에 `getAiProvider(purpose)`를 만들고 2.1의 해석 결과로 제공자를 생성하는지(`claude`, `gemini`, `local`), 호출할 때마다 환경을 다시 읽는지 단위 테스트로 확인한다
- [x] 3.4 `fake.ts`에 시험용 가짜 제공자(`createFakeProvider`)를 만들고, 정해진 응답과 조각을 돌려주고 오류를 지정하면 같은 코드의 `AiError`가 던져지며 네트워크를 쓰지 않음을 단위 테스트로 확인한다. 번역·분석 change가 가져다 쓸 수 있도록 `index.ts`에서 내보낸다

## 4. 로깅과 비밀값

- [x] 4.1 호출마다 `{provider, tier, ms, ok, code}`만 남기는 로깅을 만들고(로거 주입), 성공과 실패 호출을 캡처해 로그에 프롬프트 문장, 응답 문장, API 키 값이 없음을 단위 테스트로 확인한다. 이어서 `grep -rnE "console\.(log|error)" src/lib/server/ai`가 로거 주입 부분 외에는 0건이다

- [x] 4.2 `stream`이 글자를 하나도 내보내지 못하고 끝나면(취소 제외) `ai_empty_response`를 던지고 제공자의 종료 이유를 로그에 남기는지, 가짜 제공자도 조각이 없으면 같은 오류를 던지는지 단위 테스트로 확인한다(학교 모델 실제 호출에서 한도 1024일 때 8번 중 1번 꼴로 글자 없이 끝난 것을 보고 추가)

## 5. 로컬 제공자 (선택, 이 그룹은 건너뛰어도 나머지가 동작)

- [x] 5.1 `local.ts`에 `LocalProvider`를 `fetch`로 만들고(`fetch` 주입), `LOCAL_LLM_BASE_URL`은 비서와 같은 값(`/v1`까지 포함), `LOCAL_LLM_API_KEY`, `LOCAL_LLM_MODEL`을 읽는다. 주소가 `http://`이면 요청 없이 `ai_not_configured`, 줄 단위 이벤트 스트림을 쪼개져 오는 경우까지 포함해 파싱하고 `[DONE]`에서 끝나는지, 인증서 검증을 끄는 코드가 없는지(`grep -rn "rejectUnauthorized" src` 0건) 단위 테스트와 검색으로 확인한다
- [x] 5.2 (집 서버에서 사용자가 실행) `AI_PROVIDER=local`로 `AI_LIVE_TEST=1 npm run test:ai-live`를 실행해 학교 모델에서 `complete`와 `stream`이 각각 한 번 성공하는지 확인한다. 실패하면 오류 코드와 단계(주소, 인증서, 인증, 응답)를 `docs/dev/ai-provider.md`의 "알려진 문제"에 적는다

## 6. 문서와 마무리

- [x] 6.1 `.env.example`에 변수 이름만 추가한다(`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `LOCAL_LLM_BASE_URL`, `LOCAL_LLM_API_KEY`, `LOCAL_LLM_MODEL`, `AI_PROVIDER`, `AI_PROVIDER_TRANSLATION`, `AI_PROVIDER_ANALYSIS`, 등급별 모델 변수). `git diff .env.example`에서 `=` 뒤가 모두 비어 있고, 이 파일은 커밋 도구의 비밀 파일 차단에 걸리므로 일반 `git add`로 커밋해야 한다는 점을 보고에 적는다
- [x] 6.2 `docs/dev/ai-provider.md`에 환경 변수 표, 오류 코드 다섯 개와 권장 HTTP 응답(설계의 열린 질문 5), 새 제공자 추가 방법, AI 사용 원칙 한 문단을 적고, 문서와 코드에서 키 형태 문자열 검색(`grep -rnE "sk-ant|AIza"`)이 0건인지 확인한다
- [ ] 6.3 선택 실행 시험(`AI_LIVE_TEST=1 npm run test:ai-live`)을 만들고 `AI_LIVE_TEST`가 없으면 모든 시험이 건너뛰어지며 `npm test`에 포함되지 않는지 확인한다. 키를 가진 사용자가 `claude`와 `gemini`로 각각 `complete`와 `stream`을 한 번씩 실행해 성공하는지 확인한다(제안서를 쓰는 동안에는 실행하지 않았다)
- [x] 6.4 `npm run check`, `npm test`, `npm run build`, `npm run check:tokens`, `openspec validate --specs --strict`가 모두 통과하고, 빌드 산출물 `build/client`에 `ANTHROPIC`, `GEMINI`, `LOCAL_LLM` 문자열이 0건임을 확인한다

## Workflow follow-up

- 구현이 끝나면 `/opsx:archive`로 보관해 `ai-provider` 메인 스펙에 합친다.
- 이 change가 끝나야 `archi-studio-translation`과 `archi-studio-paper-analysis`를 구현할 수 있다.

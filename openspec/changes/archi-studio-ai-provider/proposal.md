# Proposal

## Why

번역과 논문 분석은 둘 다 외부 AI 모델(Claude, Gemini)을 불러 답을 받아야 한다. 벨루(기존 서비스)에는 이 호출을 한곳에 모은 공용 계층(`ai_provider.py`)이 있었는데, Archi Studio에는 아직 AI를 부르는 코드가 하나도 없다. 번역 change와 분석 change가 각자 모델 호출을 만들면 같은 코드(모델 교체, 스트리밍, 오류 처리, JSON 파싱)가 두 벌이 되므로, 두 change보다 먼저 공용 계층을 한 번 만든다.

## What Changes

- 서버 전용 공용 AI 호출 모듈을 새로 만든다(`src/lib/server/ai/`). 호출 방식은 두 가지다: 한 번에 답을 받는 `complete`, 글자가 나오는 대로 흘려보내는 `stream`.
- 모델 제공자를 환경 변수로 바꿀 수 있게 한다: `claude`, `gemini`, 그리고 학교 서버의 로컬 모델(`local`, OpenAI 호환 방식). 용도별(번역, 분석)로 제공자를 따로 고르는 것도 환경 변수로만 가능하게 한다.
- 모델 크기 두 등급(`fast` 빠름, `smart` 똑똑함)을 두고, 등급별 실제 모델 이름은 환경 변수로 덮어쓸 수 있게 한다.
- 오류를 다섯 가지 코드로 통일하고(`ai_not_configured`, `ai_unavailable`, `ai_rate_limited`, `ai_empty_response`, `ai_invalid_json`), 일시적 실패는 정해진 횟수만 다시 시도한다.
- 모델에게 "JSON만 출력하라"고 요구하는 공용 문구와, 응답에서 JSON을 안전하게 꺼내는 파서를 옮겨 온다.
- 테스트용 가짜 제공자를 만들어 번역·분석 change가 네트워크 없이 시험할 수 있게 한다.
- 옮기지 않는 것: 이미지 입력(벨루의 `images` 매개변수). 이미지를 쓰는 곳은 Model Review뿐이고 이번 이식 범위 밖이다. 벨루 코드에 따로 복사돼 있던 JSON 파서(`contextor.py`)도 옮기지 않는다(Contextor 제외).
- 번역·분석의 프롬프트 문구와 API 라우트는 이 change에 포함하지 않는다. 각 기능 change가 맡는다.

## Capabilities

### New Capabilities
- `ai-provider`: 서버가 외부·로컬 AI 모델을 부르는 공용 계층의 동작 약속. 제공자 선택, 모델 등급, 단일 응답과 스트리밍, 오류 코드와 재시도, JSON 응답 처리, 비밀값과 로그 취급을 정한다.

### Modified Capabilities
<!-- 없음. 기존 메인 스펙의 요구사항은 바뀌지 않는다. -->

## Impact

- 새 코드: `src/lib/server/ai/`(서버 전용, 클라이언트 번들에 들어가면 안 된다), 단위 테스트, `docs/dev/ai-provider.md`.
- 의존성 두 개 추가: `@anthropic-ai/sdk`, `@google/genai`. 로컬 제공자는 추가 의존성 없이 `fetch`로 만든다.
- 환경 변수 추가(값은 `.env`에만): `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `LOCAL_LLM_BASE_URL`, `LOCAL_LLM_API_KEY`, `AI_PROVIDER`, 용도별 덮어쓰기, 모델 이름 덮어쓰기. `.env.example`에는 이름만 적는다.
- API 경로와 DB는 바뀌지 않는다.
- 선행: 없음(`archi-studio-scaffold`, `archi-studio-auth` 등 이미 보관된 change 위에서 시작).
- 이 change에 의존하는 change: `archi-studio-translation`, `archi-studio-paper-analysis`.
- 참고 구현(읽기 전용): 벨루 `server/app/ai_provider.py`(인터페이스, Claude·Gemini 구현, 제공자 선택, JSON 규약과 파서), 호출 지점 `translator.py`, `paper_analyzer/core/claude_analyzer.py`. 로컬 모델 접속 규칙은 `morning-desk`의 `AGENTS.md`(HTTPS만, 인증서 검증, 내용은 로그에 남기지 않음)를 따른다.

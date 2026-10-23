# Design

## Context

- 계약은 메인 스펙 `translation`(요구사항 4개)과 `docs/api/openapi.yaml`에 있고, 이 change의 델타 스펙이 요구사항 3개를 더한다. 동기는 `proposal.md`를 본다.
- 번역 이력 테이블 `archi_translations`와 해시 색인 `(user_id, md5(source_text))`는 마이그레이션에 이미 있다(`supabase/migrations/20261018000400_history.sql`). `papers` 테이블도 이미 있다.
- 서버 코드는 `src/lib/server/`에 모여 있고, 라우트는 `api-guard`를 거쳐 `locals.user`를 받는다. 인증 구현(`auth-service.ts` + `auth-deps.ts` + `auth-harness.ts`)이 "서비스 함수에 의존성을 주입하고, 시험은 하네스로 가드와 라우트를 통째로 거친다"는 패턴을 이미 만들어 두었다. 번역도 같은 패턴을 쓴다.
- AI 호출은 `archi-studio-ai-provider`가 `src/lib/server/ai/`에 만들었다(보관됨, 메인 스펙 `ai-provider`). 이 change는 `getAiProvider('translation')`, `provider.stream({ system, user, maxTokens, tier, signal })`(글자 조각을 내보내는 `AsyncIterable<string>`, 글자 없이 끝나면 `ai_empty_response`), 모델 등급 `smart`, 시험용 `createFakeProvider`, `AiError`의 오류 코드 `ai_not_configured`/`ai_unavailable`/`ai_rate_limited`/`ai_empty_response`를 쓴다. 설정 오류는 `getAiProvider`가 바로 `AiError('ai_not_configured')`로 던진다.
- 벨루의 동작(관찰한 사실): 입력을 앞뒤 공백 제거 후 사용, 같은 사용자·같은 원문이면 저장된 번역을 `X-Cache: HIT` 헤더와 함께 반환, 새 번역은 `max_tokens=4096`, 등급 `smart`로 스트리밍하고 끝난 뒤 저장, 모델이 한 글자도 못 보내면 HTTP 200에 한국어 오류 문장을 본문으로 보냄, 이력은 최신 10개만 돌려줌.

## Goals / Non-Goals

**Goals:**
- 벨루 번역과 같은 사용 경험(글자가 나오는 대로 표시, 같은 문장은 다시 번역하지 않음)을 새 계약대로 제공한다.
- 번역 로직(입력 확인, 캐시 규칙, 저장 시점)을 모델 호출과 DB 접근에서 분리해, 네트워크와 외부 AI 없이 시험한다.

**Non-Goals:**
- 화면(`archi-studio-ui-translate-analyze`), 사전 조회(`naver-dict`), 이력 개수 조회(`?count=true`), 쪽 넘김, 사용자별 호출 횟수 제한.
- 번역 품질 평가와 프롬프트 개선. 프롬프트는 벨루의 것을 그대로 옮긴다.

## Decisions

**1. 파일 배치: `src/lib/server/translation/` 아래에 역할별로 나눈다.**
`system-prompt.ts`(프롬프트 상수), `input.ts`(입력 확인과 단어/문장 구분), `service.ts`(흐름), `repository.ts`(DB 접근), `deps.ts`(실제 제공자와 DB 클라이언트를 묶는 곳). 라우트는 `src/routes/api/translate/+server.ts`와 `src/routes/api/translate/history/+server.ts`로 얇게 두고 서비스 함수만 부른다. 이유는 서비스를 가짜 제공자와 가짜 저장소로 단위 시험하기 위해서다. 대안으로 라우트 파일 안에 모두 쓰는 방법이 있었으나 스트리밍과 DB 흐름을 라우트 시험으로만 확인해야 해서 버렸다.

**2. 번역 흐름과 저장된 번역 재사용 규칙.**
요청 처리 순서는 다음과 같고, 앞 단계에서 실패하면 뒤 단계는 하지 않는다.

| 순서 | 단계 | 실패 시 |
|---|---|---|
| 1 | 본문 크기 확인(64 KiB 초과는 413 `payload_too_large`), JSON 해석, `text`와 `paperId` 형식 확인 | 400 `invalid_request` |
| 2 | `text`를 앞뒤 공백 제거. 글자 수는 코드 포인트(`[...text].length`) 기준 1~5000 | 400 / 413 |
| 3 | `paperId`가 있으면 `papers`에서 `id`와 `user_id`로 조회 | 404 `paper_not_found`(없는 id와 남의 id를 구분하지 않음) |
| 4 | 저장된 번역 조회(결정 3의 SQL 함수) | 조회 오류는 로그만 남기고 새 번역으로 진행(벨루와 같음) |
| 5-a | 찾았으면 AI를 부르지 않고 저장된 번역을 스트리밍. `paperId`가 있고 그 논문에 같은 원문 행이 없으면 행을 새로 저장 | |
| 5-b | 못 찾았으면 모델로 번역, 스트리밍, 끝나면 저장(`paperId` 포함) | AI 오류는 결정 5 |

저장된 번역은 같은 사용자의 같은 원문 중 가장 최근 것을 쓴다. `paperId`가 없고 저장된 번역이 있으면 행을 새로 만들지 않는다.

**3. 번역문 조회는 SQL 함수(`archi_find_translation`)로 한다.**
`archi_find_translation(p_user_id uuid, p_text text, p_paper_id uuid)`는 `(translated_text text, paper_linked boolean)` 한 줄을 돌려준다. `md5(source_text) = md5(p_text)`로 해시 색인을 타 후보를 좁힌 뒤 `source_text = p_text`로 원문을 다시 대조하고, 가장 최근 행의 번역문과 "그 논문에 같은 원문 행이 이미 있는지"를 함께 돌려준다. 서비스 키(service role)만 실행할 수 있게 하고 `anon`, `authenticated`의 실행 권한은 막는다(로그인 시도 함수와 같은 방식). 이유는 PostgREST의 필터가 `md5(...)` 식을 지원하지 않고, 해시와 원문 대조를 DB 안에서 한 번에 끝내기 위해서다. 대안으로 `source_md5` 생성 열을 추가하고 `.eq('source_md5', 해시)`로 거르는 방법이 있었다. 함수 없이도 되지만 테이블 정의(방금 고친 마이그레이션)를 다시 바꿔야 하고 원문 대조를 서버 쪽에서 따로 해야 해서 함수를 골랐다. 마이그레이션 파일의 시각 접두사는 구현 시점에 비어 있는 다음 번호를 쓴다(다른 change가 같은 번호를 쓰지 않게).

**4. 스트리밍 구현: 첫 글자를 받은 뒤에 응답을 만든다.**
제공자의 `stream`에서 첫 조각을 먼저 받아 본 뒤에 `Response`(`ReadableStream`)를 만든다. 그래야 모델이 첫 글자 전에 실패했을 때 JSON 오류(502/503)를 정상 상태 코드로 돌려줄 수 있다. 응답 헤더는 `content-type: text/plain; charset=utf-8`과 `X-Cache: HIT|MISS`(벨루 유지)다. 마지막 조각을 보낸 뒤 이력을 저장하고, 저장이 끝난 뒤에 스트림을 닫는다. 저장이 실패하면 오류 이름만 로그에 남기고 이미 전달한 번역은 그대로 끝낸다(벨루와 같음). 요청자가 연결을 끊으면(스트림 취소) 모델 호출을 중단하고 저장하지 않는다. 스트림 도중 모델 오류는 스트림을 오류로 끝낸다. 벨루처럼 오류 문장을 본문에 섞지 않는다(번역문과 구분이 안 되기 때문).

**5. AI 오류를 HTTP로 옮기는 규칙.**
`ai_not_configured`는 503 `ai_not_configured`, `ai_unavailable`·`ai_rate_limited`·`ai_empty_response`는 모두 502 `ai_unavailable`로 돌려준다. 사용자에게는 "잠시 후 다시 시도"로 충분하고, 세부 원인은 서버 로그에 코드 이름만 남긴다(본문·키는 남기지 않음). 코드와 한국어 문구는 `src/lib/server/errors.ts`에 모은다.

**6. 입력 확인은 순수 함수로 둔다.**
`input.ts`는 `{ text, type }`을 돌려주는 순수 함수다. 공백 없는 한 토큰이면 `word`, 공백이 하나라도 있으면 `sentence`(벨루의 `len(text.split()) == 1`과 같다). 줄바꿈도 공백으로 본다. `paperId`는 uuid 정규식으로 확인한다.

**7. 프롬프트는 한 파일에 상수로 둔다.**
벨루 `translator.py`의 `_SYSTEM`을 `system-prompt.ts`에 그대로 옮긴다. 옮긴 뒤 벨루 원문과 내용이 같은지 구현 때 한 번 대조하고(문자열 추출 비교), 단위 시험은 필수 구획(`<role>`, `<rules>`, `<examples>`, `<output>`)과 예시 4개가 들어 있는지만 확인한다. 프롬프트 문구 자체는 이 change에서 고치지 않는다.

**8. 이력 조회.**
`archi_translations`에서 `user_id`와 선택 `paper_id`로 거르고 `created_at desc`, `limit`(기본 50, 1~200)으로 가져와 `{id, sourceText, translatedText, type, paperId, createdAt}`로 바꿔 `{items}`에 담는다. 벨루의 최신 10개 고정보다 늘렸다(스펙이 정하지 않아서 이 change가 정함).

**9. 시험 전략.**
- 단위: 가짜 제공자와 메모리 저장소로 서비스 흐름 전부(새 번역, 같은 논문 재요청, 다른 논문 재요청, `paperId` 없음, 시작 전 실패, 도중 실패, 연결 끊김, 저장 실패). 가짜 제공자는 `archi-studio-ai-provider`가 만든 것을 쓴다.
- 통합(`npm run test:auth` 설정, 로컬 Supabase): 인증 하네스로 가드와 라우트를 거치는 요청, 실제 DB 행과 SQL 함수, 논문 삭제 시 이력 연쇄 삭제. 논문 행은 서비스 키로 직접 넣는다.
- 스트리밍이 정말 조금씩 나오는지는 라우트 함수를 직접 호출해 `response.body.getReader()`로 읽으며, 가짜 제공자가 다음 조각을 내보내기 전에 첫 조각이 도착하는지 확인한다.

## Risks / Trade-offs

- [같은 문장을 동시에 두 번 요청하면 이력 행이 둘 생길 수 있다] → 이력은 논문별 기록이라 중복이 해롭지 않고 `(user_id, source_text)` 유일 제약은 일부러 두지 않았다. 허용한다.
- [해시(md5) 충돌로 다른 원문의 번역을 돌려줄 위험] → SQL 함수가 원문 일치를 다시 대조한다. 충돌을 일부러 만들어 보는 시험은 하지 않는다(실질적으로 불가능).
- [AI 사용 비용 남용] → 로그인과 승인된 사용자만 호출할 수 있지만 사용자별 호출 횟수 제한은 없다. 벨루도 없었다. 열린 질문으로 둔다.
- [`stream` 인터페이스가 아직 확정 전이다] → 선행 change가 확정되면 tasks의 함수 이름만 바꾸면 되도록 서비스가 제공자 인터페이스 하나에만 의존하게 한다.
- [`adapter-node`가 스트림을 버퍼링해 한꺼번에 보낼 위험] → 구현 때 선택 확인 항목(실제 모델로 `curl -N`)을 둔다. 단위 수준의 증거는 결정 9의 라우트 직접 호출 시험이다.

## Migration Plan

1. 새 마이그레이션(번역문 조회 함수)을 로컬 Supabase에 적용한다(`npm run db:reset`).
2. 운영(벨루) DB 적용은 `archi-studio-deploy-cutover`가 `docs/api/data-model.md` 순서대로 한 번에 한다. 이 change는 로컬에서만 검증한다.
3. 되돌리기: 함수 한 개를 지우면 된다(`drop function`). 테이블과 데이터는 바뀌지 않는다.

## Open Questions

- 사용자별 번역 호출 횟수 제한이 필요한가? 추천: 이번에는 하지 않는다. 사용자가 승인제 소수 베타이고 호출 비용이 크지 않다. 필요해지면 인증의 로그인 제한과 같은 방식으로 추가한다.
- 이력 개수(`?count=true`)를 돌려주는 경로가 필요한가? 추천: 화면 change에서 필요하다고 정해질 때 추가한다.
- 번역에 어떤 모델 제공자를 기본으로 쓸까(외부 모델 vs 학교 로컬 모델)? 이 결정은 `TODO.md`의 열린 질문 "벨루의 외부 AI 키 유지 여부"와 "AI 사용 원칙"에 달려 있다. 이 change는 제공자 선택 환경 변수에 맡기고 기본값을 정하지 않는다. 추천: 번역 대상이 공개된 논문 문장이라 외부 모델을 기본으로 한다.

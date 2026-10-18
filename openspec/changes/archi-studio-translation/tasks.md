# Tasks

## 1. 준비

- [ ] 1.1 선행 확인: `ls src/lib/server/ai`와 `grep -rn "stream" src/lib/server/ai`로 `archi-studio-ai-provider`의 `stream`, 시험용 가짜 제공자, 오류 코드 4종(`ai_not_configured`, `ai_unavailable`, `ai_rate_limited`, `ai_empty_response`)이 있는지 확인한다. 없으면 이 change를 멈추고 선행 change를 먼저 구현한다. 이름이나 인자가 `design.md`의 가정과 다르면 `design.md`의 해당 문장을 실제 이름으로 고친다
- [ ] 1.2 벨루 `server/app/translator.py`의 `_SYSTEM` 문자열을 `src/lib/server/translation/system-prompt.ts`에 그대로 옮기고, python으로 벨루 파일에서 뽑은 문자열과 이 파일의 문자열을 `diff`해 차이가 0줄인지, 단위 시험이 `<role>`, `<rules>`, `<examples>`, `<output>` 구획 4개와 예시 4개의 존재를 확인하고 `npm test`가 통과하는지 확인한다
- [ ] 1.3 `input.ts`에 입력 확인(앞뒤 공백 제거, 코드 포인트 기준 1~5000자, 공백 없으면 `word`/있으면 `sentence`, 줄바꿈은 공백으로 취급, `paperId` uuid 형식)을 만들고, 빈 문자열, 공백뿐, 5000자, 5001자, 한 토큰, 여러 토큰, 줄바꿈 포함, 이모지 포함, 문자열이 아닌 값, 잘못된 `paperId`를 표로 만든 단위 시험이 `npm test`에서 통과하는지 확인한다

## 2. 저장소와 SQL 함수

- [ ] 2.1 새 마이그레이션(시각 접두사는 비어 있는 다음 번호)에 `archi_find_translation(p_user_id, p_text, p_paper_id)`를 만들고 `anon`, `authenticated`의 실행 권한을 막은 뒤, `npm run db:start`와 `npm run db:reset` 후 psql로 확인한다: 없는 원문은 0행, 저장한 원문은 번역문과 `paper_linked`(같은 논문이면 true, 다른 논문이면 false), 다른 사용자의 같은 원문은 0행, 5,000자 원문 조회 성공, `anon` 역할로 실행하면 `permission denied`
- [ ] 2.2 `repository.ts`에 함수 호출, 이력 저장, 논문 소유 확인(`papers`에서 `id`와 `user_id`), 이력 조회를 만들고, `npm run test:auth`의 통합 시험으로 저장 후 조회, 논문 행을 지우면 연결된 이력이 0건이 되는지(연쇄 삭제)를 확인한다

## 3. 번역 흐름 (단위 시험)

- [ ] 3.1 `service.ts`에 번역 흐름을 만들고 가짜 제공자와 메모리 저장소로, 새 번역은 모델을 1번 부르고 받은 조각을 이어 붙여 저장하며, 같은 원문을 다시 요청하면 모델을 0번 부르고 같은 번역문을 같은 조각 형식으로 돌려주는지 `npm test`로 확인한다
- [ ] 3.2 저장된 번역 재사용 규칙을 시험한다: 같은 문장을 다른 논문으로 요청하면 모델 0번 호출에 이력 행이 1개 늘고, 같은 논문으로 다시 요청하면 행이 늘지 않으며, `paperId` 없이 요청하면 저장된 번역이 있어도 행이 늘지 않는다
- [ ] 3.3 실패 경로를 시험한다: 모델이 첫 글자 전에 실패하면 스트림이 만들어지지 않고 저장이 없으며 502(`ai_unavailable`), 모델 미설정은 503(`ai_not_configured`), 빈 응답은 502, 도중 실패는 스트림이 오류로 끝나고 저장이 없으며 같은 문장을 다시 요청하면 새로 번역하고, 연결을 끊으면 제공자의 중단이 호출되고 저장이 없으며, 저장이 실패해도 번역은 끝까지 전달되고 로그에 오류 이름만 남는다

## 4. 라우트

- [ ] 4.1 `POST /api/translate`를 만들고(`text/plain; charset=utf-8`, `X-Cache: HIT|MISS`, 본문 64 KiB 초과는 413) `errors.ts`에 `payload_too_large`, `paper_not_found`, `ai_not_configured`, `ai_unavailable` 응답을 추가한 뒤, `npm run test:auth`의 통합 시험(하네스, 실제 DB, 가짜 제공자)으로 확인한다: 200과 조각, 이력 1행, 400(빈 값, JSON 아님, `paperId` 형식), 413(5001자), 404(없는 id와 남의 id가 같은 본문이고 모델을 부르지 않음), 502와 503, 401(쿠키 없음, 미승인 계정), 같은 문장 재요청 때 가짜 제공자의 호출 횟수가 늘지 않음
- [ ] 4.2 스트리밍이 조금씩 나오는지 확인한다: 라우트의 `POST` 함수를 직접 호출해 `response.body.getReader()`로 읽고, 가짜 제공자가 두 번째 조각을 내보내기를 게이트로 막아 둔 상태에서 첫 조각이 이미 도착하는 시험이 `npm test`에서 통과한다
- [ ] 4.3 `GET /api/translate/history`를 만들고 통합 시험으로 확인한다: 이력 60개에서 `limit` 없이 최근 50개를 최신순으로, `limit=5`는 5개, `limit=0`, `201`, `abc`는 400 `invalid_request`, `paperId`를 주면 그 논문의 이력만, 형식이 틀린 `paperId`는 400, 남의 논문 id는 404가 아니라 빈 목록 `{"items":[]}`, 쿠키 없음은 401, 응답 필드가 `{id, sourceText, translatedText, type, paperId, createdAt}`이다

## 5. 문서와 마무리

- [ ] 5.1 `docs/api/openapi.yaml`에 번역의 502·503 응답, 이력의 `limit` 쿼리와 `paperId` 400, 응답 헤더 `X-Cache`를 추가하고 `docs/api/data-model.md`에 `archi_find_translation` 설명을 더한 뒤, `npx @redocly/cli lint docs/api/openapi.yaml`이 오류 0건인지 확인한다
- [ ] 5.2 `docs/dev/translation-test-map.md`에 메인 스펙 `translation`의 요구사항 7개(기존 4개와 이 change가 더한 3개)의 모든 시나리오를 시험 이름과 짝지은 표를 만들고, 표의 시험 이름이 모두 실제 파일에 있는지 `grep`으로 대조한다
- [ ] 5.3 (선택, 실제 모델 키가 있을 때만) 개발 서버를 띄워 `curl -N`으로 `POST /api/translate`를 호출해 글자가 조금씩 나오는지, 같은 문장을 다시 보내면 응답 헤더가 `X-Cache: HIT`인지 확인하고 서버를 종료한다. 키 값은 화면과 문서에 쓰지 않는다. 키가 없어 실행하지 않았으면 그 이유를 기록하고 넘어간다
- [ ] 5.4 `npm run db:reset` 후 `npm run check`, `npm test`, `npm run test:auth`, `npm run build`, `npm run check:tokens`, `openspec validate archi-studio-translation --strict`, `openspec validate --specs --strict`가 모두 통과하고 끝나면 `npm run db:stop`으로 로컬 DB를 내린다

## Workflow follow-up

- 구현이 끝나면 `/opsx:archive`로 보관해 `translation` 메인 스펙에 델타 요구사항 3개를 합친다.
- 이 change가 끝나면 `archi-studio-ui-translate-analyze`가 번역 화면을 만들 수 있다.

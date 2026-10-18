# Proposal

## Why

Archi Studio에는 번역 기능이 아직 없다. 벨루(기존 서비스)의 번역은 영어 논문 문장을 한국어로 번역해 글자가 나오는 대로 보여 주고 이력을 남기는데, 이를 새 앱(SvelteKit + TypeScript)으로 다시 써야 "논문 한 편에서 번역으로 이어지는" 데모 흐름이 완성된다. 계약(요청·응답 형식)은 메인 스펙 `translation`과 `docs/api/openapi.yaml`에 이미 있다. 다만 스펙 첫머리가 "세부 형식은 구현 전에 보완한다"고 밝히고 있고, 벨루 코드를 읽어 보니 스펙이 말하지 않는 상황이 둘 있다. AI 호출이 실패할 때의 응답과, 이력 조회의 개수 제한이다. 이 change가 그 둘을 정하고 구현한다.

## What Changes

- `POST /api/translate`를 구현한다: 입력 확인(1~5000자, 단어/문장 구분, 선택 값 `paperId`), 저장된 번역 재사용, 새 번역은 AI 모델이 글자를 만드는 대로 `text/plain`으로 흘려보내기, 끝나면 이력 저장.
- `GET /api/translate/history`를 구현한다: 최신순 목록, 선택 쿼리 `paperId`와 `limit`.
- 번역문 재검색용 SQL 함수(원문의 해시로 후보를 좁히고 원문 일치로 다시 대조)를 새 마이그레이션으로 추가한다. 해시 색인은 이미 있고(`archi_translations`의 `(user_id, md5(source_text))`), 이 함수가 그 색인을 실제로 쓰게 한다.
- 번역 프롬프트(벨루 `translator.py`의 `_SYSTEM`)를 서버 코드의 한 파일로 옮긴다.
- 메인 스펙에 요구사항 둘을 추가한다(델타 스펙): AI 호출 실패 시 동작, 이력 조회의 개수 제한.
- 옮기지 않는 것: 번역 이력 개수만 돌려주던 `?count=true`(새 스펙에 없고 화면 change에서 필요하면 그때 추가), 프론트가 부르던 `/translate/api/naver-dict`(벨루 서버에 대응 라우트가 없음. 사전 기능은 이식 범위 밖), 화면(별도 change `archi-studio-ui-translate-analyze`).

## Capabilities

### New Capabilities
<!-- 없음. 번역 capability는 이미 메인 스펙에 있다. -->

### Modified Capabilities
- `translation`: 요구사항 2개를 추가한다. "AI 호출 실패" (시작 전 실패는 JSON 오류, 스트림 도중 실패는 연결 오류로 끝내고 저장하지 않음)와 "이력 조회 개수 제한"(`limit` 기본값과 상한). 기존 요구사항 4개는 바꾸지 않는다.

## Impact

- 새 코드: `src/lib/server/translation/`(프롬프트, 입력 확인, 서비스, 저장소), `src/routes/api/translate/+server.ts`, `src/routes/api/translate/history/+server.ts`, 단위·통합 테스트.
- 새 마이그레이션 1개(번역문 조회 함수). 기존 마이그레이션과 벨루 테이블은 건드리지 않는다.
- 문서: `docs/api/openapi.yaml`(502·503 응답, `limit`, `X-Cache` 헤더), `docs/api/data-model.md`(함수 설명), `docs/dev/translation-test-map.md`(스펙 시나리오와 테스트 대응표).
- 새 의존성 없음.
- 선행: `archi-studio-ai-provider`(AI 호출 계층. 이 change는 그 `stream` 호출과 시험용 가짜 제공자를 쓴다). `archi-studio-papers`는 API 쪽 선행이지만 `papers` 테이블은 이미 마이그레이션에 있어서 이 change의 시험은 논문 행을 DB에 직접 넣어 진행할 수 있다.
- 이 change에 의존하는 change: `archi-studio-ui-translate-analyze`.
- 참고 구현(읽기 전용): 벨루 `server/app/translator.py`(프롬프트, 캐시, 스트리밍, 이력), `web/src/features/translator/api.ts`.

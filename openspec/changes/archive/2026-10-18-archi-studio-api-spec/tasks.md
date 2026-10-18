# Tasks

## 1. 계약 정리 (인증, Zotero, 논문 허브, 메모)

- [x] 1.1 `docs/api/openapi.yaml`에 auth, zotero-connection, papers, paper-notes 스펙의 모든 경로, 요청, 응답, 오류 코드를 옮기고, `openspec validate archi-studio-api-spec`와 OpenAPI 문법 검사가 통과하는지 확인한다
- [x] 1.2 공통 오류 형식 `{ error: { code, message } }`를 `components`에 한 번만 정의하고, 모든 4xx 응답이 이를 참조하는지 파일을 검색해 확인한다
- [x] 1.3 `docs/api/legacy-map.md`에 폴리오와 벨루의 기존 경로가 새 경로 어디로 가는지(또는 이번에 뺀 것인지) 표로 적고, 폴리오 `/api/*` 17개 그룹이 모두 한 줄씩 있는지 대조한다

## 2. 뒷순서 capability 보완 (translation, paper-analysis, briefing)

- [x] 2.1 `docs/api/openapi.yaml`에 translation, paper-analysis, briefing 경로를 추가하고, 스트리밍 응답은 `text/plain`으로 표기됐는지 확인한다
- [x] 2.2 translation 스펙에 `text` 최대 길이와 단어/문장 구분 규칙을 정한 뒤 시나리오를 추가하고 `openspec validate`가 통과하는지 확인한다

## 3. 데이터 계약 (마이그레이션 입력)

- [x] 3.1 `docs/api/data-model.md`에 `papers`(`id`, `user_id`, `item_key`, `s2_paper_id`, 제목 등), `folio_*` 3개, 번역 이력의 `paper_id`, 브리핑 테이블의 컬럼과 키 제약을 정의하고, 스펙의 모든 응답 필드가 컬럼으로 대응되는지 대조한다
- [x] 3.2 같은 문서에 "기존 벨루 테이블은 수정하지 않는다"는 원칙과 백업 후 적용 순서를 적고, 추가되는 테이블 이름이 기존 벨루 테이블과 겹치지 않는지 `server/schema.sql`과 대조한다

## 4. 검토

- [x] 4.1 사용자가 스펙 7개와 `design.md`를 검토하고 수정 사항을 반영해 `openspec validate archi-studio-api-spec --strict`가 통과하는지 확인한다

## Workflow follow-up

- 검토가 끝나면 `/opsx:apply`로 위 문서 작업을 진행한다.
- 실제 코드 구현(SvelteKit 라우트, 마이그레이션)은 이 change가 끝난 뒤 별도 change로 시작한다.

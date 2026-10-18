# Proposal

## Why

논문 허브(논문 하나에서 분석, 번역, 메모로 이어지는 화면)에서 사용자가 쓰는 메모를 서버가 읽고 저장하는 기능이 아직 없다. 기존 폴리오(Express 앱)에는 메모 저장이 있지만 새 앱(SvelteKit + TypeScript)으로 다시 써야 한다. 또한 폴리오의 메모 조회는 논문 상세 응답 안에 섞여 있고, 새 계약(메인 스펙 `paper-notes`)은 조회·저장·삭제·크기 제한을 독립된 요청으로 정하고 있어 그대로 옮길 수 없다.

## What Changes

- `GET /api/papers/{id}/memo`: 논문의 메모를 `{ markdown, updatedAt }`으로 돌려준다. 메모가 없으면 빈 문자열과 `null`이다.
- `PUT /api/papers/{id}/memo`: 마크다운 본문을 Zotero의 자식 노트(논문 항목에 딸린 메모 항목, 태그 `zotero-insight:memo`)로 저장한다. 같은 본문을 반복 저장해도 노트는 하나만 유지하고(멱등), 빈 문자열을 저장하면 노트를 삭제한다.
- 본문이 1 MB를 넘으면 413 `payload_too_large`로 거부한다. 이 제한은 기존 폴리오에는 없던 새 규칙이다.
- Zotero 노트는 HTML로 저장되므로 저장할 때 마크다운을 HTML로, 읽을 때 HTML을 마크다운으로 바꾼다(폴리오와 같은 방식, `marked`와 `turndown` 라이브러리). 폴리오가 이미 만든 메모 노트도 같은 태그라서 그대로 읽힌다.
- 메모를 저장하거나 삭제할 때 논문 목록용 `papers.has_memo` 값을 함께 갱신한다.

옮기지 않는 것:
- 논문 상세 응답에 메모를 함께 싣는 폴리오 방식(`memo.noteKey`, `memo.version`). 새 계약에서는 별도 요청이고 상세 응답에는 `hasMemo`만 있다.
- 메모 편집 화면(마크다운 편집기, 자동 저장). 화면은 `archi-studio-ui-paper-hub`가 맡는다.
- 하이라이트와 필기(PDF 주석)는 이번 범위 밖이다(`archi-studio-scaffold` 이후 합의된 제외 항목).

## Capabilities

### New Capabilities
(없음)

### Modified Capabilities
(없음. 계약은 이미 메인 스펙 `openspec/specs/paper-notes/spec.md`에 있고, 이 change는 그 계약을 구현한다. 그래서 `.openspec.yaml`에 `skip_specs: true`를 선언했다.)

## Impact

- 선행: `archi-studio-papers`(논문 `id`로 Zotero 항목 키와 사용자 Zotero 자격 정보를 찾는 부분, Zotero 호출 모듈). 그 앞의 `archi-studio-zotero-connection`도 이어서 필요하다.
- 코드: `src/routes/api/papers/[id]/memo/+server.ts`(새 라우트), `src/lib/server/`의 메모 서비스와 Zotero 노트 호출, 마크다운↔HTML 변환 모듈.
- 의존성: `marked`, `turndown`과 그 타입(`@types/turndown`)을 추가한다. 폴리오가 이미 같은 라이브러리를 쓰고 있다.
- 설정: Node 서버 어댑터의 요청 본문 기본 한도(512 KB)가 1 MB 제한보다 작아서 한도를 올려야 한다.
- 데이터: 새 테이블은 없다. 메모 본문은 DB에 저장하지 않고 Zotero에서 실시간으로 읽는다(`docs/api/data-model.md`). `papers.has_memo`만 갱신한다.
- 후속: `archi-studio-ui-paper-hub`가 이 API를 호출해 메모 화면을 만든다.

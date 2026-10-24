# paper-notes 시나리오와 테스트 대응표

`openspec/specs/paper-notes/spec.md`의 시나리오 6개와 테스트를 짝지은 표다. 통합 테스트 `src/lib/server/memo.integration.ts`는 로컬 Supabase가 떠 있어야 하며 `npm run test:auth`로 돌린다. 단위 테스트 `src/lib/server/memo/*.test.ts`는 `npm test`로 돌린다.

| # | 요구사항 / 시나리오 | 테스트 파일 | 테스트 이름 |
|---|---|---|---|
| 1 | 메모 조회 / 메모가 있는 논문 | `memo.integration.ts` | `메모가 있는 논문은 200과 마크다운 본문` |
| 2 | 메모 조회 / 메모가 없는 논문 | `memo.integration.ts` | `메모가 없는 논문은 200과 { markdown: "", updatedAt: null }` |
| 3 | 메모 저장 / 새 메모 저장 | `memo.integration.ts` | `새 메모 저장은 200과 updatedAt이고 이후 조회가 같은 본문이며 Zotero 노트에 태그가 붙는다` |
| 4 | 메모 저장 / 자동 저장 반복 | `memo.integration.ts` | `자동 저장 반복: 같은 요청 5번과 다른 본문 뒤에도 Zotero 노트는 1개이고 마지막 본문이다` |
| 5 | 메모 저장 / Zotero 미연결 | `memo.integration.ts` | `Zotero 미연결: 저장은 409 zotero_not_connected` |
| 6 | 메모 삭제 / 빈 본문 저장 | `memo.integration.ts` | `빈 본문 저장은 200이고 노트를 지우며 이후 조회는 빈 문자열이다` |
| 7 | 메모 크기 제한 / 너무 큰 메모 | `memo.integration.ts` | `UTF-8 1,048,576바이트는 통과, 1,048,577바이트는 413 payload_too_large, 한글 1 MB 근처도 같다` |

시나리오는 7행이다. 스펙의 요구사항 4개에 시나리오가 2·3·1·1개라 모두 7개다.

## 시나리오 밖에서 더 확인하는 것

- 접근 제어: `남의 논문 id와 없는 id는 둘 다 404 paper_not_found, 쿠키 없음은 401`
- 잘못된 입력: `markdown이 숫자이거나 본문이 JSON이 아니면 400 invalid_request`
- 버전 충돌 재시도: `Zotero 쪽에서 노트가 그새 바뀌면(412) 한 번 다시 읽어 저장한다`, 단위 `2.5 버전 충돌 재시도`
- `papers.has_memo`: `저장 뒤 true, 빈 문자열 저장 뒤 false, Zotero 쓰기가 실패하면 그대로이고 응답은 502`
- 변환: 단위 `2.1 마크다운 왕복 변환`, `2.2 폴리오가 만든 노트 HTML 읽기`

# 브리핑 시나리오와 테스트 대응표

`openspec/specs/briefing/spec.md`의 요구사항 3개와 시나리오 3개를 테스트와 짝지은 표다. 3개 모두 테스트에 연결돼 있다.

테스트 파일은 `src/lib/server/`에 있다. 통합 테스트(`*.integration.ts`)는 로컬 Supabase가 떠 있어야 하며 `npm run test:auth`로 돌린다. 단위 테스트(`*.test.ts`)는 `npm test`로 돌린다.

> 테스트 이름은 실제 파일의 `describe` › `it` 이름 그대로다(2026-10-25 확인).

| # | 요구사항 | 스펙 시나리오 | 테스트 파일 | 테스트 이름 |
|---|---|---|---|---|
| 1 | 브리핑 목록 | 브리핑 조회 | `briefing.integration.ts` | `4.1 브리핑 목록 페이지` › `첫 페이지 30건과 nextCursor, 두 번째 페이지 5건과 null, 날짜 내림차순` |
| 2 | 브리핑 상세 | 논문이 언급된 브리핑 | `briefing.integration.ts` | `4.2 브리핑 상세` › `본문과 paperIds(id 오름차순)를 돌려준다` |
| 3 | 읽기 전용 | 쓰기 시도 | `briefing.integration.ts`, `briefing-readonly.test.ts` | `4.3 인증과 읽기 전용` › `POST, PUT, PATCH, DELETE는 405 method_not_allowed와 Allow: GET` / `5.1 브리핑 읽기 전용` › `src/ 소스는 두 브리핑 테이블에 insert/update/upsert/delete를 호출하지 않는다` |

## 메모

- 스펙에 없는 세부는 같은 파일의 아래 테스트가 추가로 확인한다.
  - `briefing.integration.ts`: `잘못된 limit과 cursor는 400 invalid_request`
  - `briefing.integration.ts`: `다른 사용자 브리핑은 목록에 없고 상세는 404 briefing_not_found`
  - `briefing.integration.ts`: `없는 id와 UUID가 아닌 id도 같은 404`
  - `briefing.integration.ts`: `논문 행을 삭제하면 paperIds에서 빠진다`
  - `briefing.integration.ts`: `같은 사용자 같은 날짜의 두 번째 삽입은 23505로 거부된다`
  - `briefing.integration.ts`: `쿠키 없이 부르면 401 unauthenticated`
  - `briefing-readonly.test.ts`: `검사기가 쓰기 호출을 잡는다`
  - `briefing-service` 단위 테스트: `limit` 기본 30, 1·100 경계, 0·101·숫자 아님·읽을 수 없는 `cursor`는 `invalid_request`

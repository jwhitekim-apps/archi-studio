# 브리핑 시나리오와 테스트 대응표

`openspec/specs/briefing/spec.md`의 요구사항 3개와 시나리오 3개를 테스트와 짝지은 표다. 3개 모두 테스트에 연결할 계획이다.

테스트 파일은 `src/lib/server/`에 있다. 통합 테스트(`*.integration.ts`)는 로컬 Supabase가 떠 있어야 하며 `npm run test:auth`로 돌린다. 단위 테스트(`*.test.ts`)는 `npm test`로 돌린다.

> 주의: 이 표는 코드와 동시에 작성됐다. 테스트 이름은 `archi-studio-briefing` 작업 목록(tasks.md 4.1~5.1)에 계획된 내용을 기준으로 적었으므로, 구현이 합쳐진 뒤 실제 파일에서 `grep`으로 이름을 다시 확인하고 맞춘다.

| # | 요구사항 | 스펙 시나리오 | 테스트 파일 | 테스트 이름(계획) |
|---|---|---|---|---|
| 1 | 브리핑 목록 | 브리핑 조회 | `briefing.integration.ts` | 첫 페이지 30건과 `nextCursor`, 두 번째 페이지 5건과 `nextCursor` null, 날짜 내림차순 |
| 2 | 브리핑 상세 | 논문이 언급된 브리핑 | `briefing.integration.ts` | 상세가 본문과 `paperIds`(id 오름차순)를 돌려준다 |
| 3 | 읽기 전용 | 쓰기 시도 | `briefing.integration.ts`, `briefing-readonly.test.ts` | 두 경로의 `POST`·`PUT`·`PATCH`·`DELETE`는 405 `method_not_allowed`와 `Allow: GET` / `src/` 소스에 브리핑 테이블 쓰기 호출이 없다 |

## 메모

- 스펙에 없는 세부는 같은 파일의 아래 테스트가 추가로 확인한다(계획).
  - `briefing.integration.ts`: 다른 사용자 브리핑은 목록에 없고 상세는 404 `briefing_not_found`
  - `briefing.integration.ts`: 논문 행을 삭제하면 `paperIds`에서 빠진다
  - `briefing.integration.ts`: 같은 사용자·같은 날짜 두 번째 삽입은 `23505`로 거부된다
  - `briefing.integration.ts`: 쿠키 없이 두 경로를 부르면 401 `unauthenticated`
  - `briefing-service` 단위 테스트: `limit` 기본 30, 1·100 경계, 0·101·숫자 아님·읽을 수 없는 `cursor`는 `invalid_request`

# 인증 시나리오와 테스트 대응표

`openspec/specs/auth/spec.md`(원래 `archi-studio-api-spec`의 auth 스펙)의 시나리오 12개와 테스트를 짝지은 표다. 11개가 테스트에 연결돼 있고 1개는 papers change로 미뤘다.

테스트 파일은 `src/lib/server/`에 있다. 통합 테스트(`*.integration.ts`)는 로컬 Supabase가 떠 있어야 하며 `npm run test:auth`로 돌린다. 단위 테스트(`*.test.ts`)는 `npm test`로 돌린다.

| # | 스펙 시나리오 | 테스트 파일 | 테스트 이름 |
|---|---|---|---|
| 1 | 잘못된 요청 | `auth.integration.ts` | `8자 미만 비밀번호와 필드 누락: 400 invalid_request, 계정이 만들어지지 않는다`, `필드 누락: 400 invalid_request` |
| 2 | 가입 성공 | `auth.integration.ts` | `가입 성공: 201 pending_approval, 쿠키 없음, 승인 전 행이 하나` |
| 3 | 이미 가입된 이메일 | `auth.integration.ts` | `이미 있는 이메일: 409 email_taken` |
| 4 | 미승인 사용자의 로그인 | `auth.integration.ts` | `미승인 계정: 403 pending_approval, 쿠키 없음, 방금 만든 세션이 폐기된다` |
| 5 | 로그인 성공 | `auth.integration.ts` | `승인된 계정: 200과 사용자 정보, 속성이 맞는 세션 쿠키` |
| 6 | 잘못된 자격 증명 | `auth.integration.ts` | `틀린 비밀번호와 없는 이메일은 같은 401 본문` |
| 7 | 제한 초과 | `auth.integration.ts` | `같은 IP의 실패 5번 뒤 6번째는 429, 다른 IP는 영향 없다` |
| 8 | 로그아웃 성공 | `auth.integration.ts` | `204와 쿠키 삭제, 같은 쿠키로 보낸 me는 401` |
| 9 | 로그인 상태 | `auth.integration.ts` | `유효 세션: 200과 사용자 정보, zoteroConnected는 folio_users의 키 유무` |
| 10 | 비로그인 상태 | `auth.integration.ts` | `세션 없음: 401 unauthenticated` |
| 11 | 세션 없는 보호 자원 요청 | `api-guard.test.ts` | `쿠키 없음: 401 unauthenticated, 라우트는 호출되지 않는다` (경로 `/api/papers`) |
| 12 | 다른 사용자의 자원 | 없음 | papers change로 미룸 |

## 메모

- 12번은 논문 상세 API(`GET /api/papers/{id}`)가 있어야 확인할 수 있어서 papers change에서 다룬다.
- 11번은 통합 테스트가 아니라 가드의 단위 테스트다. `GET /api/papers` 라우트가 아직 없어서, 허용 목록 밖 경로가 기본으로 401이 되는지를 가드에서 확인한다. 라우트가 생기면 papers change에서 통합 테스트로도 확인한다.
- 스펙의 다른 요구사항(로그인 시도 제한의 재시작 후 유지, 미승인 403은 실패 횟수에 넣지 않음, 세션 만료 시 갱신)은 같은 파일의 아래 테스트가 추가로 확인한다.
  - `서버 재시작을 흉내 내도(새 인스턴스) 제한이 유지된다`
  - `미승인 403은 실패 횟수에 넣지 않는다`
  - `session.integration.ts`의 `만료된 접근 토큰: 갱신해서 새 쿠키 값을 돌려주고, 새 값은 그대로 유효하다`

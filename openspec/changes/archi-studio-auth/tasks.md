# Tasks

## 1. 준비

- [ ] 1.1 `@supabase/supabase-js`를 추가하고 서버 전용 Supabase 클라이언트 헬퍼(anon, service role)를 만든 뒤, `npm run check`가 오류 없이 끝나고 `grep -rn "SERVICE_ROLE" src static`에 환경 변수 이름 말고 키 값이 없으며 `npm run build` 산출물의 클라이언트 번들(`build/client`)에 `SERVICE_ROLE` 문자열이 없는지 확인한다
- [ ] 1.2 `supabase/config.toml`의 최소 비밀번호 길이를 8로 바꾸고 `npm run db:stop` 뒤 `npm run db:start`로 반영한 다음, 로컬 Auth에 7자 비밀번호로 계정을 만들면 거부되는지 확인한다

## 2. 세션

- [ ] 2.1 `SessionVerifier`의 반환을 `{ user, renewedToken? } | null`로 넓히고 `api-guard`가 `renewedToken`을 `archi_session` 쿠키로 다시 설정하게 하며 공개 경로에 `POST /api/auth/signup`, `POST /api/auth/login`을 추가한 뒤, 기존 단위 테스트를 갱신하고 갱신 쿠키 설정 테스트를 더해 `npm test`가 통과하는지 확인한다
- [ ] 2.2 쿠키 값(두 토큰 쌍)의 인코딩, 디코딩, 쿠키 속성(`httpOnly`, `SameSite=Lax`, 30일, https일 때 `Secure`) 헬퍼를 만들고, 정상, 깨진 값, 빈 값, 한쪽 토큰 누락을 단위 테스트로 확인한다
- [ ] 2.3 `verifySession`을 `getUser`와 만료 시 한 번 갱신하는 실제 구현으로 바꾸고, `npm run db:start`가 떠 있는 상태에서 `npm run test:auth`의 통합 테스트로 유효 세션, 만료 세션 갱신(새 쿠키 값 반환), 위조 값, 갱신 토큰 만료가 각각 기대대로 나오고 동시 갱신 두 건이 모두 성공하는지 확인한다

## 3. 엔드포인트

- [ ] 3.1 `POST /api/auth/signup`을 만들고, 가입 성공은 201 `{status:"pending_approval"}`과 쿠키 없음, 이미 있는 이메일은 409 `email_taken`, 8자 미만 비밀번호와 필드 누락은 400 `invalid_request`이며, 성공 뒤 SQL로 `archi_profiles.approved=false` 행이 하나 있고 행 삽입을 강제로 실패시켰을 때 계정이 남지 않는지 통합 테스트로 확인한다
- [ ] 3.2 로그인 시도 제한 모듈을 만들고, 같은 IP의 15분 안 실패 5번 뒤 6번째가 429 `too_many_attempts`이며, 모듈을 새로 만들어도(재시작 모사) 제한이 유지되고, 24시간 지난 행이 기록할 때 지워지는지 통합 테스트로 확인한다
- [ ] 3.3 `POST /api/auth/login`을 만들고, 승인된 계정은 200과 `{id,email,zoteroConnected}`와 쿠키 속성이 맞는 세션 쿠키, 틀린 비밀번호와 없는 이메일은 같은 401 `invalid_credentials` 본문, 미승인 계정은 403 `pending_approval`과 쿠키 없음이며 방금 만든 Supabase 세션이 폐기됐는지 통합 테스트로 확인한다
- [ ] 3.4 `POST /api/auth/logout`을 만들고, 204와 쿠키 만료 헤더가 오며 같은 쿠키로 보낸 `GET /api/auth/me`가 401인지 통합 테스트로 확인한다
- [ ] 3.5 `GET /api/auth/me`를 만들고, 유효 세션은 200 `{id,email,zoteroConnected}`(`folio_users`에 Zotero 키가 있으면 true, 없으면 false)이고 세션 없음은 401 `unauthenticated`인지 통합 테스트로 확인한다

## 4. 마무리

- [ ] 4.1 `archi-studio-api-spec`의 auth 스펙 시나리오 12개를 통합 테스트 이름과 짝지은 표를 `docs/dev/auth-test-map.md`에 만들고, "다른 사용자의 자원 → 404" 1개만 papers change로 미뤘음을 적으며 나머지 11개가 모두 테스트에 연결됐는지 대조한다
- [ ] 4.2 `docs/dev/setup.md`에 인증 테스트 실행법(`db:start`, 로컬 키를 `.env`에 넣는 방법, `npm run test:auth`)을 적고 문서 순서대로 처음부터 따라 해서 통합 테스트가 통과하는지, 그 뒤 `npm run check`, `npm test`, `npm run build`, `npm run check:tokens`가 모두 통과하는지 확인한다

## Workflow follow-up

- 구현이 끝나면 `/opsx:archive`로 이 change를 보관한다. `archi-studio-api-spec`는 이 change와 papers 구현이 끝난 뒤 함께 보관해 메인 스펙에 합친다.

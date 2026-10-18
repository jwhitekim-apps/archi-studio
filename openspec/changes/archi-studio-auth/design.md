# Design

## Context

- 계약: `archi-studio-api-spec`의 `specs/auth/spec.md`, `docs/api/openapi.yaml`의 auth 경로, 그 change의 design 결정 4(쿠키 세션)와 5(승인 플래그). 이 change는 계약을 바꾸지 않고 구현만 한다.
- scaffold가 남긴 것: `createApiHandle`이 `archi_session` 쿠키를 읽어 `SessionVerifier(token)`을 부르고, 사용자가 없으면 401을 준다. 지금 `verifySession`은 항상 `null`이다. 공개 경로는 `GET /api/health` 하나다.
- DB: `archi_profiles(user_id, approved default false)`와 `archi_login_attempts(ip, attempted_at)`는 마이그레이션에 있다. `archi_profiles` 행을 만드는 트리거는 없다. `folio_users`의 `zotero_api_key`는 `zoteroConnected` 계산에 쓴다.
- Supabase Auth의 로컬 설정: 접근 토큰 유효 1시간, 갱신 토큰 회전 켜짐(재사용 허용 10초), 이메일 확인 꺼짐, 최소 비밀번호 6자.

## Goals / Non-Goals

**Goals:**
- 쿠키 하나로 30일 로그인을 유지하되, Supabase의 1시간짜리 접근 토큰이 만료돼도 사용자가 다시 로그인하지 않게 한다.
- 미승인 계정은 세션이 하나도 발급되지 않게 한다.

**Non-Goals:**
- 승인 관리 화면, 비밀번호 재설정, 이메일 확인, 소셜 로그인.
- 승인을 취소했을 때 이미 발급된 세션을 즉시 끊는 것(열린 질문 참고).

## Decisions

**1. `archi_session` 쿠키 한 개에 접근 토큰과 갱신 토큰 쌍을 담는다.**
값은 두 토큰을 JSON으로 묶어 base64url로 인코딩한 문자열이다(약 1.5KB). 쿠키 유효기간은 30일이고 속성은 `httpOnly`, `SameSite=Lax`, `path=/`, https일 때 `Secure`다. 대안 1은 갱신 토큰만 담는 것인데, 요청마다 토큰을 교환하면 회전 때문에 병렬 요청이 서로 실패한다. 대안 2는 자체 세션 테이블이다. 데이터 모델에 없는 테이블을 새로 만들어야 하고 Supabase Auth를 쓰는 이점이 줄어서 버렸다.

**2. 검증은 요청마다 `getUser(접근 토큰)`으로 하고, 만료 시에만 갱신한다.**
접근 토큰이 유효하면 그 사용자를 돌려준다. 만료로 거부되면 갱신 토큰으로 한 번 갱신하고, 성공하면 새 쌍을 `renewedToken`으로 돌려준다. 갱신도 실패하거나 쿠키가 깨졌으면 `null`이다. Supabase 서버 자체 문제는 `null`이 아니라 throw한다(기존 계약 유지). 이를 위해 `SessionVerifier`의 반환을 `{ user, renewedToken? } | null`로 넓히고, `api-guard`가 `renewedToken`이 있으면 응답에 같은 속성으로 쿠키를 다시 설정한다. 대안은 JWT를 로컬에서 서명 검증하는 것인데, 키 형식이 로컬(HS256)과 운영에서 달라질 수 있어 왕복 한 번을 감수하고 서버 확인 방식을 택했다.

**3. 가입은 서버(service role)가 계정과 승인 행을 함께 만든다.**
`admin.createUser`(이메일 확인 완료 처리)로 계정을 만들고 `archi_profiles(approved=false)`를 넣는다. 행 삽입이 실패하면 방금 만든 계정을 지워 반쪽 상태를 남기지 않는다. 가입 응답은 쿠키를 설정하지 않는다. 이메일 중복은 409 `email_taken`이다. 비밀번호 8자 미만과 형식 오류는 400 `invalid_request`이고, `supabase/config.toml`의 최소 길이도 8로 맞춘다. 대안은 `auth.users`에 거는 DB 트리거인데, 운영(벨루) 프로젝트의 `auth` 스키마에 객체를 더하는 일이라 운영 적용 change에서 다시 판단한다.

**4. 로그인 순서는 제한 확인, 자격 증명, 승인 확인이다.**
(1) 이 IP의 최근 15분 실패가 5번 이상이면 429 `too_many_attempts`(이 시도는 기록하지 않는다). (2) `signInWithPassword`가 실패하면 실패를 기록하고 401 `invalid_credentials`를 준다. 이메일 없음과 비밀번호 틀림은 같은 응답이다. (3) 성공했지만 `approved=false`면 방금 생긴 Supabase 세션을 바로 폐기하고 403 `pending_approval`을 준다. 쿠키는 설정하지 않으며, 이 403은 실패 횟수에 넣지 않는다(스펙에 정한 바 없어 둔 가정). (4) 모두 통과하면 쿠키를 설정하고 `{ id, email, zoteroConnected }`를 돌려준다. 성공은 기록하지 않는다.

**5. 로그인 시도 기록은 DB에 두고, 오래된 행은 기록할 때 같이 지운다.**
서버 재시작 후에도 유지돼야 하므로 메모리 대신 `archi_login_attempts`를 쓴다. 별도 정리 작업 없이, 실패를 기록할 때 24시간 지난 행을 같이 지운다(데이터 모델의 미정 항목 5를 이렇게 정한다). IP는 SvelteKit의 `getClientAddress()`로 읽는다.

**6. 로그아웃은 서버에서 세션을 끊고 쿠키를 지운다.**
Supabase 쪽 세션을 폐기한 뒤 `archi_session`을 만료시키고 204를 준다. 같은 쿠키로 보낸 다음 요청은 접근 토큰이 폐기돼 401이 된다.

**7. Supabase 클라이언트는 서버 전용 헬퍼 한 곳에서 만든다.**
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`를 서버 전용 환경 변수로 읽고, 세션을 클라이언트 안에 저장하지 않는 설정(`persistSession: false`)으로 요청마다 쓴다. service role 키는 응답, 로그, 클라이언트 번들에 나가지 않는다.

**8. 테스트는 기존 단위 테스트와 로컬 Supabase 통합 테스트를 나눈다.**
`npm test`는 지금처럼 DB 없이 통과해야 한다. 실제 계정을 쓰는 테스트는 `npm run test:auth`로 따로 두고, `npm run db:start`가 먼저 떠 있어야 한다.

## Risks / Trade-offs

- [병렬 요청이 같은 갱신 토큰을 동시에 쓰면 한쪽이 실패할 수 있다] → 로컬과 운영의 갱신 토큰 재사용 허용 시간(10초)에 기대고, 통합 테스트에서 동시 갱신 두 건이 모두 성공하는지 확인한다.
- [요청마다 Supabase에 왕복 한 번이 든다] → 베타 규모에서는 감수한다. 문제가 보이면 짧은 메모리 캐시를 따로 제안한다.
- [승인을 취소해도 이미 발급된 세션은 최대 30일 유지된다] → 이번에는 로그인 시점에만 승인을 확인한다(열린 질문).
- [Cloudflare Tunnel 뒤에서는 `getClientAddress()`가 터널 주소를 줘서 모든 사용자가 한 IP로 묶인다] → 운영 헤더 설정은 배포 change에서 한다. 이 change는 로컬에서 동작을 확인하고, 운영 적용 전 확인 항목으로 남긴다.
- [쿠키 값이 약 1.5KB라 다른 쿠키와 합쳐지면 한계에 가까워질 수 있다] → 쿠키는 `archi_session` 하나만 쓴다.

## Migration Plan

1. 로컬 Supabase에서 구현과 테스트를 끝낸다. 마이그레이션 변경은 없다.
2. 운영(벨루) DB에는 이 change에서 접속하지 않는다. 운영 적용은 별도 change에서 `data-model.md` 순서대로 한다.
3. 롤백은 이 change가 추가한 파일과 의존성을 되돌리는 것으로 충분하다(기존 서비스에 영향이 없다).

## Open Questions

- 승인을 취소한 사용자의 세션을 바로 끊으려면 검증할 때마다 `archi_profiles.approved`를 확인해야 한다(요청마다 쿼리 한 번 추가). 추천은 이번에는 하지 않고, 베타 운영 중 필요해지면 추가하는 것이다.

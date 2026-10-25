# Tasks

## 1. 접점 계약과 준비

- [ ] 1.1 `archi-studio-papers`가 끝났는지(보관 목록 `ls openspec/changes/archive`에 있거나 `papers` 구현 커밋이 있음)와 `npm run db:start`, `npm run db:reset` 뒤 `psql`로 `archi_briefings`, `archi_briefing_papers`, `papers` 테이블이 있는지 `\d`로 확인하고, 선행이 끝나지 않았다면 어떤 시험이 영향을 받는지 task 안에 적어 둔다
- [ ] 1.2 `docs/dev/briefing-contract.md`에 비서와 앱의 접점 계약(테이블, 컬럼, 하루 한 건 규칙, `date` 기준, `summary` 최대 200자, `body` 일반 텍스트 형식, `itemKey`로 논문 연결하고 못 찾으면 건너뜀, 기록 대상 사용자 지정 방법)을 적고, 컬럼 목록이 `docs/api/data-model.md` 3.10과 `supabase/migrations/20261018000500_briefings.sql`과 일치하는지 `grep`으로 대조한다

## 2. 읽기 서비스

- [ ] 2.1 `src/lib/server/briefing-service.ts`에 목록 조회(`userId` 필수, `limit` 기본 30·범위 1~100, 날짜 커서, `limit + 1`개를 읽어 `nextCursor` 계산)를 만들고, 가짜 클라이언트 단위 테스트로 기본 30, `limit=1`과 `100` 경계, `0`·`101`·숫자 아님·읽을 수 없는 `cursor`가 `invalid_request`이며, 정확히 `limit`개만 있을 때 `nextCursor`가 `null`인지 확인한다(`npm test`)
- [ ] 2.2 같은 파일에 상세 조회(`userId` 필수, 본문과 `paperIds`를 id 오름차순으로)를 만들고, 없는 id, 다른 사용자의 id, UUID가 아닌 id가 모두 같은 "없음" 결과가 되는지 단위 테스트로 확인한다(`npm test`)

## 3. 라우트

- [ ] 3.1 `src/routes/api/briefings/+server.ts`에 `GET`만 만들어 목록 서비스에 연결하고, 로그인한 사용자의 `locals.user.id`만 쓰며 서비스 오류는 공통 오류 형식으로 돌려주는지 `npm run check`와 단위 테스트로 확인한다
- [ ] 3.2 `src/routes/api/briefings/[id]/+server.ts`에 `GET`만 만들어 상세 서비스에 연결하고, 없는 브리핑은 404 `briefing_not_found`와 공통 오류 형식을 돌려주는지 `npm run check`와 단위 테스트로 확인한다

## 4. 통합 테스트(로컬 DB 필요)

- [ ] 4.1 `src/lib/server/auth-harness.ts`에 두 브리핑 경로를 등록하고, `src/lib/server/briefing.integration.ts`에서 서비스 키로 사용자 2명(승인됨), 브리핑 35건(날짜가 서로 다름), `papers` 3건, 연결 행을 직접 삽입한다. `npm run db:start` 뒤 `npm run test:auth`로 첫 페이지 30건과 `nextCursor`, 두 번째 페이지 5건과 `nextCursor`가 `null`, 날짜 내림차순이 확인되는지 본다
- [ ] 4.2 같은 통합 테스트에서 상세가 본문과 `paperIds`(id 오름차순)를 돌려주는지, 다른 사용자 브리핑이 목록에 없고 상세는 404 `briefing_not_found`인지, 논문 행을 삭제하면 `paperIds`에서 빠지는지, 같은 사용자·같은 날짜로 두 번째 삽입이 고유 제약 위반(`23505`)으로 거부되는지 확인한다(`npm run test:auth`)
- [ ] 4.3 같은 통합 테스트에서 쿠키 없이 두 경로를 부르면 401 `unauthenticated`이고, 두 경로에 `POST`, `PUT`, `PATCH`, `DELETE`를 보내면 405 `method_not_allowed`와 `Allow: GET`이 공통 오류 형식으로 오는지 확인한다(`npm run test:auth`)

## 5. 읽기 전용 고정

- [ ] 5.1 `src/lib/server/briefing-readonly.test.ts`를 만들어, 테스트 파일을 뺀 `src/` 소스에서 `archi_briefings`나 `archi_briefing_papers`를 가리키는 호출에 `insert`, `update`, `upsert`, `delete`가 붙으면 실패하게 하고(`npm test`), 일부러 임시 `insert` 한 줄을 넣으면 실패하는 것을 확인한 뒤 되돌린다

## 6. 문서와 마무리

- [x] 6.1 `docs/api/openapi.yaml`의 `/api/briefings`에 `limit` 범위(1~100)와 400 `invalid_request` 응답을 추가하고 `BriefingListItem`·`BriefingDetail` 필드가 구현과 일치하는지 대조하며, `npx @redocly/cli lint docs/api/openapi.yaml`이 오류 없이 끝난다
- [x] 6.2 `docs/dev/auth-test-map.md`와 같은 형식으로 `briefing` 스펙의 요구사항 3개와 시나리오 3개를 시험 이름과 짝지은 표를 `docs/dev/briefing-test-map.md`에 만들고, 적힌 시험 이름이 실제 파일에 있는지 `grep`으로 대조한다
- [ ] 6.3 `npm run db:reset` 뒤 `npm run check`, `npm test`, `npm run test:auth`, `npm run build`, `npm run check:tokens`, `openspec validate archi-studio-briefing --strict`, `openspec validate --specs --strict`가 모두 통과하고, 끝나면 `npm run db:stop`으로 로컬 DB를 내린다

## Workflow follow-up

- 구현이 끝나면 `/opsx:archive`로 보관한다. 이 change는 `skip_specs`라 메인 스펙은 바뀌지 않는다.
- 비서가 실제로 기록하는 쪽은 `briefing-store`(morning-desk 저장소)이고, 두 change를 합친 종단 확인(비서가 기록한 브리핑이 앱에서 읽힌다)은 `archi-studio-deploy-cutover` 단계에서 한다.

# Tasks

모든 npm 명령 앞에 `nvm use 20`이 필요하다. "통합 테스트"는 로컬 Supabase가 떠 있어야 하고 `npm run test:auth`(파일 이름이 `*.integration.ts`인 테스트)로 돌린다. 이 change는 `archi-studio-zotero-connection`이 끝난 뒤에 시작한다.

## 1. 준비

- [ ] 1.1 선행 change의 코드를 읽어 (a) 사용자의 Zotero 자격 정보 조회 함수(미연결이면 `null`), (b) Zotero API 클라이언트의 위치와 함수 목록을 `design.md` Open Questions 3의 가정과 대조하고, 다르면 이 change의 어댑터로 흡수할 방법을 `design.md`에 한 줄로 적는다. `npm run check`가 오류 0건이다
- [ ] 1.2 `design.md` Open Questions 1·2(Zotero 미연결과 장애 때의 응답)의 결론을 사용자에게 확인받고, 결론이 "추가"이면 `papers` 델타 스펙(MODIFIED)과 `docs/api/openapi.yaml`에 409·502 응답을 먼저 반영한 뒤 `openspec validate archi-studio-papers --strict`가 통과한다
- [ ] 1.3 새 마이그레이션 파일에 목록·검색·커서 함수와 컬렉션 개수 함수를 만들고(기존 마이그레이션과 테이블은 수정하지 않는다), `npm run db:reset` 뒤 SQL로 확인한다: 검색어 `50%`가 글자 그대로 찾아지고, 제목과 저자 모두에서 찾아지며, 커서로 전체를 순회하면 중복과 누락이 없고, 컬렉션 개수가 실제 개수와 같다. 이 함수들을 `docs/api/data-model.md`의 "함수" 절에 적는다

## 2. 조회 API

- [ ] 2.1 응답 변환 함수(`toPaperListItem`, `toPaperDetail`)와 커서 인코딩·해독을 만들고 단위 테스트로 확인한다: 제목 `null`은 `""`, 연도 `"2017-06-12"`와 `"c. 1999"`는 `2017`과 `1999`, `"n.d."`와 빈 문자열은 `null`, 깨진 커서는 오류를 던진다. `npm test`가 통과한다
- [ ] 2.2 `GET /api/papers`를 만들고 통합 테스트로 확인한다: 빈 서재는 200 `{items:[],nextCursor:null}`, 제목 검색, 저자 검색, 컬렉션 필터, `limit=2`로 전체 순회 시 중복·누락 없음, `limit=0`·`limit=201`·깨진 커서는 400 `invalid_request`, 쿠키 없음은 401이다
- [ ] 2.3 `GET /api/papers/{id}`를 만들고 통합 테스트로 확인한다: 모든 상세 필드(`itemKey`, `s2PaperId`, `attachment.type`, `translationCount`, `analysisCount`)가 응답에 있고, 번역 행 2개와 분석 행 1개를 넣으면 개수가 2와 1이며, 없는 `id`와 UUID 형식이 아닌 `id`는 404 `paper_not_found`다
- [ ] 2.4 `GET /api/collections`를 만들고 통합 테스트로 확인한다: 컬렉션 배열이 `key`, `name`, `parentKey`, `paperCount`를 갖고, 논문에 속한 개수와 일치하며, 컬렉션이 없는 사용자는 빈 배열이다
- [ ] 2.5 사용자 A·B를 만들어 A의 논문 `id`로 B가 `GET /api/papers/{id}`, `GET /api/papers/{id}/file`, `DELETE /api/papers/{id}`를 요청하면 모두 없는 논문과 똑같은 404이고(본문 `error.code`도 같음) A의 데이터는 그대로인 것을 통합 테스트로 확인한다. 이로써 인증 스펙의 "다른 사용자의 자원은 404" 시나리오가 확인된다. 이 시험은 3.1과 3.3의 라우트가 생긴 뒤 마지막에 완성한다

## 3. 원문 파일, 웹페이지 추가, 삭제

- [ ] 3.1 `GET /api/papers/{id}/file`을 만들고 가짜 Zotero로 확인한다: PDF는 200 `application/pdf`이고 본문이 가짜 PDF 바이트와 같으며, zip으로 묶인 HTML 스냅샷은 풀린 HTML이 `text/html`로 오고 `Content-Security-Policy` 헤더가 있으며, 첨부 없는 논문은 404 `attachment_not_found`, Zotero 미연결은 Open Questions 1의 결론대로 응답한다. 실제로 빌드한 서버에 로그인 쿠키를 붙여 `curl -si`로 PDF의 `Content-Type`과 `Content-Disposition: inline`을 확인한다
- [ ] 3.2 SSRF 방어 모듈을 만들고 단위 테스트로 확인한다: `http://127.0.0.1`, `http://localhost`, `http://10.0.0.1`, `http://169.254.169.254`, IPv6 루프백은 거부되고, 공개 주소가 사설 주소로 리다이렉트되면 이동 시점에 거부되며, 응답 본문은 1MB에서 끊기고, 리다이렉트는 최대 횟수를 넘으면 중단된다
- [ ] 3.3 `POST /api/papers/webpage`를 만들고 가짜 Zotero와 가짜 웹 서버로 확인한다: 유효한 URL은 201과 새 논문 상세(제목은 페이지 `<title>`에서 `| 사이트명` 꼬리를 정리한 값)이고, 제목을 못 읽으면 URL이 제목이며, `ftp://`와 빈 값은 400 `invalid_request`, 사설 주소는 400, Zotero 미연결은 409 `zotero_not_connected`, 같은 URL을 두 번 보내도 `(user_id, item_key)` 중복 행이 생기지 않는다
- [ ] 3.4 `DELETE /api/papers/{id}`를 만들고 가짜 Zotero로 확인한다: 호출 순서가 버전 조회, Zotero 삭제, 앱 행 삭제이고, Zotero가 412를 돌려주면 한 번 재시도하며, Zotero에서 이미 없는 항목(404)이면 204로 끝나고, Zotero 단계가 실패하면 앱 행이 그대로 남는다. 성공 뒤 상세는 404이고 통합 테스트에서 번역 2개와 분석 1개를 먼저 넣어 두면 삭제 뒤 SQL로 0건임을 확인한다

## 4. 마무리

- [ ] 4.1 모든 새 라우트의 오류 응답이 `{error:{code,message}}` 형식이고, 쿠키 없는 요청은 전부 401이며, 인코딩한 경로(`/%61pi/papers`)도 401임을 통합 테스트 한 파일로 확인한다
- [ ] 4.2 `docs/api/openapi.yaml`의 papers·collections 경로를 실제 응답과 맞춰 본다: 각 경로의 응답 상태 코드, 필수 필드 이름, 오류 코드가 구현과 같은지 테스트의 단정문과 대조하고 어긋나면 한쪽을 고친다. 고친 내용은 `design.md`에 한 줄로 남긴다. `npx --yes @redocly/cli lint docs/api/openapi.yaml`이 오류 0건이다
- [ ] 4.3 스펙 시나리오와 테스트 이름을 짝지은 표 `docs/dev/papers-test-map.md`를 만들고, 메인 스펙 `papers`의 시나리오가 모두 어느 테스트에 연결됐는지 `grep`으로 대조한다. 테스트 이름은 실제 파일에 있는 것만 적는다
- [ ] 4.4 `npm run db:reset` 뒤 `npm run check`, `npm test`, `npm run test:auth`, `npm run build`, `npm run check:tokens`, `openspec validate archi-studio-papers --strict`, `openspec validate --specs --strict`가 모두 통과하고, 클라이언트 번들에 서비스 키 이름이 없으며(`grep -rl SERVICE_ROLE build/client`가 0건), 끝나면 `npm run db:stop`으로 로컬 DB를 내린다

## Workflow follow-up

- 구현이 끝나면 `/opsx:archive`로 보관한다. 델타 스펙을 추가하지 않았다면 메인 스펙은 바뀌지 않는다.
- 다음 change: `archi-studio-paper-notes`, `archi-studio-translation`, `archi-studio-paper-analysis`는 이 change가 끝난 뒤 시작할 수 있다.

# Tasks

## 1. 준비

- [x] 1.1 선행 change(`archi-studio-papers`, `archi-studio-zotero-connection`)가 끝났는지 `openspec list --specs`와 `openspec/changes/archive`로 확인하고, 논문 `id`로 소유자 확인과 Zotero 항목 키·자격 정보를 찾는 모듈의 함수 이름을 이 change의 `design.md` 결정 1에 적는다. 선행이 끝나지 않았으면 여기서 멈추고 보고한다
- [x] 1.2 `marked`, `turndown`, `@types/turndown`을 추가하고 `npm run check`, `npm run build`가 오류 없이 끝나는지 확인한다

## 2. 변환과 서비스

- [x] 2.1 마크다운↔HTML 변환 모듈(제목 `atx`, 코드 `fenced`, 목록 `-`, 앞뒤 공백 제거)을 만들고, 제목·목록·코드 블록·링크·한글·빈 줄이 든 대표 본문 6종을 저장 변환 후 조회 변환했을 때 앞뒤 공백 제거 후 같은지 `npm test`로 확인한다. 같지 않은 문법은 `design.md` 열린 질문 2에 목록으로 적는다
- [x] 2.2 폴리오가 만든 실제 형태의 노트 HTML 샘플 3개(`/home/joon/workspace/zotero-folio`의 코드가 만드는 HTML과 같은 형태)를 마크다운으로 바꿔 읽히는지 `npm test`로 확인한다
- [x] 2.3 Zotero 노트 호출 인터페이스(`findMemoNote`, `createMemoNote`, `updateNote`, `deleteNote`)와 메모리 가짜 구현을 만들고, 가짜 구현이 `If-Unmodified-Since-Version`처럼 버전이 어긋나면 412를 돌려주는 동작까지 흉내 내는지 단위 테스트로 확인한다
- [x] 2.4 메모 서비스를 만들어 조회(노트 없음이면 `{ markdown: "", updatedAt: null }`)와 저장(노트 없으면 생성, 있으면 수정, 공백뿐이면 삭제)을 구현하고, 가짜 구현으로 다음을 `npm test`에서 확인한다: 새 저장 뒤 조회가 같은 본문, 같은 본문 연속 5번 저장 뒤 노트 1개, 빈 문자열 저장 뒤 노트 0개와 `updatedAt: null`
- [x] 2.5 수정 중 버전 충돌(412)이 나면 노트를 다시 읽어 한 번만 다시 수정하고, 두 번째도 실패하면 오류가 되는지 가짜 구현으로 `npm test`에서 확인한다

## 3. 엔드포인트

- [x] 3.1 `GET /api/papers/{id}/memo`를 만들고 `npm run db:start`가 떠 있는 상태에서 통합 테스트로 확인한다: 메모 있는 논문 200과 본문, 메모 없는 논문 200과 `{ "markdown": "", "updatedAt": null }`, 남의 논문 id와 없는 id가 둘 다 404 `paper_not_found`, 쿠키 없음 401
- [x] 3.2 `PUT /api/papers/{id}/memo`를 만들고 통합 테스트로 확인한다: 새 저장 200과 `updatedAt`, 같은 요청 반복 뒤에도 노트 1개, 빈 문자열 저장 200, `markdown`이 숫자인 요청과 JSON이 아닌 본문은 400 `invalid_request`, Zotero 미연결 사용자는 409 `zotero_not_connected`(오류 형식은 `{ error: { code, message } }`)
- [x] 3.3 저장과 삭제 때 `papers.has_memo`가 갱신되는지 통합 테스트로 확인한다: 저장 뒤 SQL로 `true`, 빈 문자열 저장 뒤 `false`, Zotero 쓰기가 실패하면 값이 바뀌지 않음
- [x] 3.4 본문 크기 제한을 구현한다. UTF-8 기준 1,048,576바이트는 통과, 1,048,577바이트는 413 `payload_too_large`인지 통합 테스트로 확인하고, 한글 약 40만 자(1 MB 근처)로도 확인한다. Node 어댑터 기본 본문 한도(512 KB)를 메모 경로에서 올리는 방법(환경 변수 `BODY_SIZE_LIMIT` 또는 라우트 설정)을 정해 `npm run build` 산출물에 띄운 서버로 `curl`로 1 MB 초과 요청이 JSON 413을 돌려주는지 확인한다
- [x] 3.5 다른 `/api` 경로의 본문 한도는 바뀌지 않았는지, 예컨대 `POST /api/auth/login`에 600 KB 본문을 보내면 이전과 같은 응답인지 `curl`로 확인한다

## 4. 마무리

- [x] 4.1 메인 스펙 `paper-notes`의 시나리오 7개(처음 6개로 잘못 셌다)와 통합 테스트 이름을 짝지은 표를 `docs/dev/paper-notes-test-map.md`에 만들고 7개 모두 연결됐는지 `grep`으로 대조한다
- [ ] 4.2 `docs/dev/setup.md`에 메모 시험 방법(가짜 Zotero로 단위 테스트, 통합 테스트 실행 명령, 실제 Zotero 계정으로 손으로 확인하는 절차)을 적는다. 실제 Zotero 계정을 쓰는 확인(저장한 메모가 Zotero 앱에서 태그 `zotero-insight:memo`가 붙은 자식 노트로 보이는지)은 사용자가 직접 하는 항목으로 표시한다
  - 메모: `archi-studio-deploy-cutover`의 첫 배포 전 실제 Zotero 수동 점검(2.7)으로 옮겼다.
- [x] 4.3 `npm run check`, `npm test`, `npm run test:auth`(또는 통합 테스트 명령), `npm run build`, `npm run check:tokens`, `openspec validate archi-studio-paper-notes --strict`, `openspec validate --specs --strict`가 모두 통과하는지 확인하고 끝나면 `npm run db:stop`으로 로컬 DB를 내린다

## Workflow follow-up

- 구현이 끝나면 `/opsx:archive`로 보관한다. 이 change는 스펙을 바꾸지 않으므로(`skip_specs`) 메인 스펙 합치기는 없다.
- 이어서 `archi-studio-ui-paper-hub`가 이 API로 메모 화면을 만든다.

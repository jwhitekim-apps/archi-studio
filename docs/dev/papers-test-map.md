# papers 시나리오와 테스트 대응표

`openspec/specs/papers/spec.md`의 시나리오와 테스트를 짝지은 표다. 이 change(`archi-studio-papers`)가 추가한 시나리오 3개(Zotero 미연결·장애)는 `specs/papers/spec.md` 델타에 있고 보관 때 메인 스펙에 합쳐진다. 인증 스펙의 "다른 사용자의 자원" 시나리오도 여기서 확인한다.

테스트 파일은 `src/lib/server/`에 있다. 통합 테스트(`*.integration.ts`)는 로컬 Supabase가 떠 있어야 하며 `npm run test:auth`로 돌린다. 단위 테스트(`*.test.ts`)는 `npm test`로 돌린다.

| # | 요구사항 / 시나리오 | 테스트 파일 | 테스트 이름 |
|---|---|---|---|
| 1 | 논문 자원 식별 / 두 키를 모두 가진 논문 | `papers.integration.ts` | `모든 상세 필드와 번역·분석 개수를 돌려준다` |
| 2 | 논문 목록과 검색 / 제목 검색 | `papers.integration.ts` | `제목 검색, 저자 검색, 컬렉션 필터, 최근 동기화 순` |
| 3 | 논문 목록과 검색 / 컬렉션 필터 | `papers.integration.ts` | `제목 검색, 저자 검색, 컬렉션 필터, 최근 동기화 순` |
| 4 | 논문 목록과 검색 / 빈 서재 | `papers.integration.ts` | `빈 서재는 200 { items: [], nextCursor: null }` |
| 5 | 논문 목록 항목 형식 / 첨부 없는 논문 | `papers.integration.ts` | `제목 검색, 저자 검색, 컬렉션 필터, 최근 동기화 순` |
| 5 | (같은 시나리오, 변환 규칙) | `papers-mapping.test.ts` | `html 첨부와 첨부 없음은 hasPdf가 false이고 attachment.type을 그대로 쓴다` |
| 6 | 논문 상세 / 상세 조회 | `papers.integration.ts` | `모든 상세 필드와 번역·분석 개수를 돌려준다` |
| 7 | 논문 상세 / 없는 논문 | `papers.integration.ts` | `없는 id와 UUID가 아닌 id는 404 paper_not_found` |
| 8 | 컬렉션 목록 / 컬렉션 조회 | `papers.integration.ts` | `key, name, parentKey, paperCount를 돌려주고 개수가 실제와 같다` |
| 9 | 원문 파일 제공 / PDF 제공 | `papers-zotero.integration.ts` | `PDF는 200 application/pdf, inline, 본문이 Zotero의 바이트와 같다` |
| 10 | 원문 파일 제공 / 첨부 없음 | `papers-zotero.integration.ts` | `첨부가 없거나 Zotero에 파일이 없으면 404 attachment_not_found` |
| 11 | 원문 파일 제공 / Zotero 미연결 또는 장애 (추가) | `papers-zotero.integration.ts` | `Zotero를 연결하지 않았으면 409, Zotero가 실패하면 502이고 키나 응답 원문이 없다` |
| 12 | 웹페이지 논문 추가 / 추가 성공 | `papers-zotero.integration.ts` | `유효한 URL은 201과 새 논문 상세이고 제목은 \| 꼬리를 뗀 페이지 <title>` |
| 13 | 웹페이지 논문 추가 / Zotero 미연결 | `papers-zotero.integration.ts` | `Zotero 미연결은 409, Zotero 장애는 502이고 목록은 바뀌지 않는다` |
| 14 | 웹페이지 논문 추가 / Zotero 장애 (추가) | `papers-zotero.integration.ts` | `Zotero 미연결은 409, Zotero 장애는 502이고 목록은 바뀌지 않는다` |
| 15 | 논문 삭제 / 삭제 성공 | `papers-zotero.integration.ts` | `버전 조회 → Zotero 삭제 → 앱 행 삭제 순서이고 번역·분석 이력도 사라진다` |
| 16 | 논문 삭제 / Zotero 미연결 또는 장애 (추가) | `papers-zotero.integration.ts` | `Zotero 단계가 실패하거나 연결이 없으면 앱 행이 그대로 남는다` |
| 17 | 인증 / 다른 사용자의 자원 | `papers-zotero.integration.ts` | `B가 A의 논문 id로 상세·파일·삭제를 요청하면 없는 id와 같은 응답이고 A의 데이터는 그대로다` |
| 18 | 인증 / 세션 없는 보호 자원 요청 | `papers-zotero.integration.ts` | `쿠키가 없으면 전부 401 unauthenticated이고 인코딩한 경로도 같다` |

## 시나리오 밖에서 더 확인하는 것

- 커서 순회와 잘못된 인자: `papers.integration.ts`의 `limit=2로 끝까지 따라가면 중복과 누락이 없다`, `limit=0, limit=201, 숫자가 아닌 limit, 깨진 cursor는 400 invalid_request`.
- 커서 인코딩·해독과 응답 변환: `papers-mapping.test.ts`.
- 웹페이지 추가의 입력 검사와 사설 주소 거부: `papers-zotero.integration.ts`의 `ftp, 빈 값, 본문 없음, 사설 주소는 400 invalid_request이고 Zotero에 항목을 만들지 않는다`, 그리고 `ssrf.test.ts` 전체.
- 삭제의 412 재시도와 이미 없는 항목: `Zotero가 412를 한 번 돌려주면 다시 조회해 재시도하고, 계속 412면 502이며 앱 행은 남는다`, `Zotero에 이미 없는 항목(404)이면 204로 끝나고 앱 행도 지운다`.
- 오류 응답 형식: `로그인했을 때 오류 응답은 { error: { code, message } } 형식이다`.

# Tasks

각 단계(2~6)는 외부 서비스 없이 단독으로 검증된다. 7단계(예비안)는 나머지와 독립이라 일정이 밀리면 먼저 해도 된다. 명령은 `/home/joon/workspace/archi-studio`에서 실행하고, `npm`과 `openspec`은 `nvm use 20` 뒤에 쓴다.

## 1. 준비

- [ ] 1.1 `src/lib/server/analysis/types.ts`에 분석 결과·저널 점수·PDF 추출 결과 타입과 오류 클래스를 정의하고, `docs/api/openapi.yaml`의 `Analysis` 스키마(필드는 델타 스펙 "분석 결과 형식"과 같게)와 `docs/api/data-model.md` 3.9의 `result` 설명을 갱신한다. `npm run check` 오류 0건, `npx --yes @redocly/cli lint docs/api/openapi.yaml`에 오류 0건(권고 경고는 허용), `openspec validate archi-studio-paper-analysis --strict` 통과, `grep -n "세부 필드는 구현 전에 보완" docs/api/openapi.yaml`이 `Analysis` 스키마에서 0건인지 확인한다
- [ ] 1.2 `scripts/make-analysis-fixture.mjs`가 시험용 PDF 3개(제목 18pt·초록 문단 10pt·DOI·arXiv 줄이 있는 `sample.pdf`, 초록이 없는 `no-abstract.pdf`, 깨진 `broken.pdf`)를 `src/lib/server/analysis/fixtures/`에 만들게 한다(외부 라이브러리 없이 손으로 PDF를 쓴다). 스크립트를 두 번 실행해 `sha256sum` 결과가 같고 `file` 명령이 앞의 둘을 PDF로 인식하며 파일마다 20KB 이하인지 확인한다

## 2. PDF 읽기 (1단계)

- [ ] 2.1 설치 전에 `npm view pdfjs-dist license engines`로 라이선스와 Node 요구 버전을 확인해 design.md의 표를 확정하고(맞지 않으면 대안 후보를 같은 방식으로 확인), `npm install pdfjs-dist` 뒤 `src/lib/server/analysis/pdf-extract.ts`와 단위 테스트를 만든다. `npx vitest run src/lib/server/analysis/pdf-extract.test.ts`에서 `sample.pdf`의 제목·초록(80자 이상)·DOI·arXiv 번호가 기대값과 같고, `no-abstract.pdf`는 초록이 빈 문자열, `broken.pdf`는 `PdfUnreadableError`, 50MB 초과 버퍼는 읽기 전에 `PdfTooLargeError`인지 확인하고 `npm run check`가 통과한다
- [ ] 2.2 사용자가 정해 주는 PDF 3~5개(저장소에 넣지 않는다)로 같은 PDF를 벨루의 `extract_from_pdf`(읽기 전용 실행)와 새 모듈에 각각 돌려, 제목·초록 앞 200자·DOI를 표로 `docs/dev/analysis-pdf-compare.md`에 기록한다. 정규화한 제목이 같은 비율이 80% 이상이어야 통과이고, 다른 것은 원인(2단 편집, 글꼴 크기 차이 등)을 적는다

## 3. 저널 점수 (2단계)

- [ ] 3.1 벨루의 `scimagojr 2025.csv`와 `venue_aliases.json`을 `data/analysis/`로 복사해 `sha256sum`이 원본과 같은지 확인하고, `src/lib/server/analysis/journal-score.ts`와 단위 테스트를 만든다. `npx vitest run src/lib/server/analysis/journal-score.test.ts`에서 작은 CSV 조각으로 별칭, 정확 일치, 단어 겹침 0.59는 불일치·0.6은 일치, 쉼표 소수의 숫자 변환, 빈 `venue`의 null 여섯 값을 확인하고 실제 CSV로 `Nature Reviews Molecular Cell Biology`(Q1, sjr 35.568), `Ca-A Cancer Journal for Clinicians`(sjr 104.065), `TBME`(정식 이름 `IEEE Transactions on Biomedical Engineering`), 순위표에 없는 이름(null)이 나오는지 확인한다. 색인을 처음 만드는 시간과 두 번째 조회 시간을 테스트 출력에 남기고 두 번째 조회는 10ms 안이어야 한다

## 4. Semantic Scholar (3단계)

- [ ] 4.1 `src/lib/server/analysis/semantic-scholar.ts`에 `fetch`와 `sleep`을 주입받는 클라이언트를 만든다. `npx vitest run src/lib/server/analysis/semantic-scholar.test.ts`에서 429 두 번 뒤 200이면 성공하고 대기 호출이 `[1,2]`, 429가 네 번 계속되면 `RateLimitError`이고 대기 호출이 `[1,2,4]`(마지막 시도 뒤에는 기다리지 않는다: 벨루와 다른 점), 401·403은 `S2AuthError`, 15초 시간 초과는 `S2TimeoutError`, `S2_API_KEY`가 없으면 요청 사이 `sleep(1)`이 호출되고 있으면 호출되지 않으며 저자 보강 3건이 동시에 나가는지(키 있음)·차례로 나가는지(키 없음), 요청 필드 목록이 `title,year,venue,externalIds,abstract,authors,citationCount`인지 확인한다
- [ ] 4.2 `src/lib/server/analysis/resolve-s2.ts`에 연결 규칙(`s2PaperId` → arXiv 번호 → DOI → 정규화한 제목이 정확히 같을 때만 제목 검색)을 만들고 같은 가짜 `fetch`로 시험한다. `s2PaperId`가 있으면 조회가 한 번뿐이고, arXiv·DOI·제목 각각 올바른 경로로 찾으며, 제목이 비슷하지만 다르면 null(찾지 못함), 조회 실패는 예외를 던져 "못 찾음"과 구분되는지 확인한다

## 5. AI 요약과 저장 (4단계)

- [ ] 5.1 `src/lib/server/analysis/prompts.ts`(벨루의 초록용·제목용 한국어 프롬프트, `relevance` 항목 제외)와 `summarize.ts`를 만든다. 공용 AI 계층의 가짜 제공자로 `npx vitest run src/lib/server/analysis/summarize.test.ts`에서 AI 요청에 초록 문장만 있고 본문 표식 문자열은 없으며, 초록이 없으면 제목과 DOI만 있고, 초록도 제목도 없으면 AI를 호출하지 않고 `NoSourceError`를 던지며, `summary`가 세 `*_short`를 줄바꿈으로 이은 문자열이고, AI의 `ai_*` 오류가 `UpstreamError`로 바뀌는지 확인한다. (선택, 사용자 승인 후 실제 호출 3번) 샘플 초록 3개로 결과 필드가 모두 채워지는지 눈으로 확인한다
- [ ] 5.2 `src/lib/server/analysis/analysis-service.ts`에 전체 흐름(논문 조회, 저장된 분석 확인, PDF 읽기, Semantic Scholar 연결, 저널 점수, 요약, 저장)을 만들고 `vitest.analysis.config.ts`와 `npm run test:analysis` 스크립트를 추가한다. `npm run db:start` 뒤 `npm run test:analysis`에서 첫 분석은 AI 1회·행 1개, 재요청은 AI 0회·같은 결과, 동시 두 건은 행 1개·같은 결과, Semantic Scholar 실패+PDF는 `sources.semanticScholar`가 false인 채 저장, AI 실패는 행이 0개, 논문을 지우면 분석 행도 지워짐, 연결되면 `papers.s2_paper_id`가 채워짐, 남의 논문은 찾지 못함으로 처리되는지 확인한다

## 6. API (5단계)

- [ ] 6.1 `src/routes/api/papers/[id]/analysis/+server.ts`에 POST와 GET을 만든다. `npm run test:analysis`의 인증 하네스 시험에서 쿠키 없음 401, 없는 논문·남의 논문 404 `paper_not_found`, 분석 없는 논문의 GET 404 `analysis_not_found`, 자료 없음 422 `no_source_for_analysis`, AI 실패 502 `upstream_unavailable`, 첫 요청 200, 재요청 200(AI 0회), 응답에 `origin` 필드가 없음을 확인한다. `npm run build` 뒤 빌드한 서버(`PORT=4173 ORIGIN=http://127.0.0.1:4173 node build`)에 쿠키 없이 `curl -si -X POST http://127.0.0.1:4173/api/papers/00000000-0000-0000-0000-000000000000/analysis`가 401과 공통 오류 본문이고 `/%61pi/papers/.../analysis`도 401인지 확인한 뒤 서버를 종료한다

## 7. 예비안: 벨루 분석 결과 가져오기

- [ ] 7.1 `scripts/import-veloo-analyses.mjs`를 만든다(기본은 확인만 하는 dry-run, `--apply`에서만 쓴다, 벨루 `paper_history`는 읽기만, 쓰는 대상은 `archi_analyses`뿐). 시험은 로컬 DB에 벨루 모양의 `paper_history` 임시 테이블을 만들고 행 3개(일치하는 논문 있음 2, 없음 1)와 매핑 파일(`data/veloo-user-map.json`, `.gitignore`에 추가)로 확인한다: dry-run은 한 행도 쓰지 않고 "가져옴 2, 건너뜀 1(제목 표시)"을 출력하고, `--apply` 뒤 `archi_analyses`가 2행이며 `sjr`이 숫자, `summary`가 세 줄, `relevance`가 없고 `origin`이 `veloo-import`이고, 다시 실행해도 행이 늘지 않으며, `grep -nE "insert|update|delete" scripts/import-veloo-analyses.mjs`에서 대상이 `archi_analyses`뿐인지 확인한다
- [ ] 7.2 `docs/dev/analysis-fallback.md`에 전환 판단 체크리스트(날짜별 기준: 11/03에 4단계 미완이면 7.1을 먼저, 11/10에 6단계 미완이면 데모는 가져온 결과로), 실행 순서(백업 → dry-run → `--apply` → 확인 SQL), 롤백(`origin`이 `veloo-import`인 행 삭제)을 적고, 문서의 명령만 따라 로컬 DB에서 처음부터 끝까지 실행해 결과가 7.1과 같은지 확인한다

## 8. 마무리

- [ ] 8.1 `.env.example`에 `S2_API_KEY`(이름만, 값 비움)를 추가하고(`.env` 이름 패턴이라 커밋 도구가 막으면 일반 `git commit`을 쓴다), `docs/dev/setup.md`에 분석 시험 실행법과 `data/analysis/`가 배포 이미지에 들어가야 한다는 메모를 적은 뒤, `npm run db:reset` 후 `npm run check`, `npm test`, `npm run test:auth`, `npm run test:analysis`, `npm run build`, `npm run check:tokens`, `openspec validate archi-studio-paper-analysis --strict`, `openspec validate --specs --strict`가 모두 통과하고 끝나면 `npm run db:stop`으로 로컬 DB를 내리는지 확인한다

## Workflow follow-up

- 선행 change(`archi-studio-ai-provider`, `archi-studio-papers`)가 끝난 뒤에 `/opsx:apply`를 시작한다.
- 구현이 끝나면 `/opsx:archive`로 보관해 `paper-analysis` 메인 스펙에 델타(ADDED 6개)를 합친다.

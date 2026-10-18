# Proposal

## Why

벨루(기존 서비스)의 "논문 분석"(논문 요약과 저널 점수)이 Archi Studio에는 아직 없다. 논문 허브에서 분석 결과를 다시 열려면 이 기능이 새 앱의 `POST /api/papers/{id}/analysis`로 옮겨져야 한다. 벨루는 Python이라 PDF 읽기, 저널 순위표 조회, Semantic Scholar(논문 정보 검색 서비스) 호출을 TypeScript로 다시 써야 하고, 이것이 이번 이식에서 가장 무거운 작업이다. 이미 정해진 메인 스펙 `paper-analysis`는 "요약 수준"이라 결과의 세부 필드와 외부 서비스 장애 시 동작이 비어 있어 이 change에서 채운다.

## What Changes

- `POST /api/papers/{id}/analysis`와 `GET /api/papers/{id}/analysis`를 구현한다. 한 번 만든 분석은 `archi_analyses`에 저장하고, 같은 논문을 다시 요청하면 AI를 부르지 않고 저장된 결과를 돌려준다.
- 분석에 쓰는 자료는 두 가지다. 논문의 PDF(Zotero에 첨부된 것)에서 제목, 초록, DOI·arXiv 번호를 읽고, Semantic Scholar에서 학회·저널 이름, 인용 수, 저자 정보를 가져온다. 둘 중 하나만 있어도 분석한다.
- 저널 점수는 SCImago(저널 순위 공개 데이터) CSV 파일에서 찾는다. 약어(예: TBME)는 별칭 파일로 정식 이름으로 바꾼 뒤 이름이 같거나 단어가 60% 이상 겹치는 저널을 찾는다.
- 요약은 공용 AI 계층(`archi-studio-ai-provider`)으로 만든다. AI에는 초록(없으면 제목)만 보내고 PDF 전문은 보내지 않는다.
- 분석 결과의 세부 필드를 정하고 `docs/api/openapi.yaml`의 `Analysis`와 `docs/api/data-model.md`에 반영한다.
- 외부 서비스(Semantic Scholar, AI)가 막혔을 때의 동작을 정한다. PDF가 있으면 Semantic Scholar 없이 PDF만으로 분석하고, 그래도 불가능하면 502 `upstream_unavailable`을 돌려준다.
- 예비안: 11/10까지 이 기능이 끝나지 않으면, 벨루에 이미 저장된 분석 결과를 `archi_analyses`로 옮겨 오는 가져오기 스크립트로 데모를 진행한다(HANDOFF 5절 6번 결정). 가져오기만으로 데모가 되도록 결과 형식을 처음부터 벨루 결과와 맞춰 둔다.

## Capabilities

### New Capabilities
<!-- 없음 -->

### Modified Capabilities
- `paper-analysis`: 분석 결과의 세부 형식, 저널 점수 산정 규칙, Semantic Scholar 연결과 `papers.s2_paper_id` 저장, 외부 서비스 장애 시 동작을 요구사항으로 추가한다(ADDED 4개). 기존 요구사항(분석 요청, 분석 불가 응답, 분석 조회)은 바꾸지 않는다.

## Impact

- 코드: 새 `src/lib/server/analysis/`(PDF 읽기, 저널 점수, Semantic Scholar 클라이언트, 요약 프롬프트, 분석 서비스), 새 `src/routes/api/papers/[id]/analysis/+server.ts`, 가져오기 스크립트 `scripts/import-veloo-analyses.mjs`.
- 데이터 파일: 벨루의 `scimagojr 2025.csv`(약 11MB)와 `venue_aliases.json`(약 3KB)을 저장소로 옮긴다.
- 의존성: PDF 읽기용 라이브러리 1개(추천: `pdfjs-dist`, 비교는 design.md). 새 의존성은 이 change의 task에서 추가하며 계획 단계에서는 설치하지 않는다.
- 환경 변수: `S2_API_KEY`(선택, Semantic Scholar 호출 제한 완화). `.env.example`에는 이름만 적는다.
- 문서: `docs/api/openapi.yaml`, `docs/api/data-model.md`, `docs/dev/setup.md`, 새 `docs/dev/analysis-fallback.md`.
- DB: 마이그레이션 변경 없음. 기존 `archi_analyses`, `papers`를 쓴다.
- 선행: `archi-studio-ai-provider`(AI 호출), `archi-studio-papers`(논문 조회와 Zotero에서 PDF 가져오기). 이 change를 쓰는 곳: `archi-studio-ui-translate-analyze`(분석 화면).
- 참고 구현(읽기 전용): 벨루 `server/app/paper_analyzer/api.py`, `core/pdf_extractor.py`, `core/journal_quality.py`, `core/semantic_scholar.py`, `core/base_analyzer.py`, `core/claude_analyzer.py`, `data/`.

## Out of Scope

- 그림(Figure) 추출. 벨루의 `analyze-pdf`는 PDF에서 그림 3장을 뽑아 돌려줬지만 메인 스펙과 OpenAPI에 없다.
- PDF 직접 업로드와 URL 입력으로 분석하기. 새 앱의 분석 입력은 이미 동기화된 논문 하나(`{id}`)로 통일됐다(`legacy-map.md`).
- Semantic Scholar 제목 검색 화면용 API(`POST /paper/search`). 이번에는 분석 안에서 논문을 찾는 내부 용도로만 쓴다.
- 분석 다시 하기(저장된 결과를 지우고 새로 만들기), 분석 이력 목록.
- 벨루 사용자 이관과 운영 DB 적용(`archi-studio-deploy-cutover`).

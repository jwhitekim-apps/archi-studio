# Design

## Context

- 이 change는 벨루(기존 서비스)의 논문 분석을 SvelteKit + TypeScript로 다시 쓴다. 벨루는 세 가지 일을 한다. PDF에서 제목·초록·DOI를 읽고(PyMuPDF), Semantic Scholar(논문 정보 검색 서비스)에서 학회·저널 이름과 인용·저자 정보를 가져오고, SCImago(저널 순위 공개 데이터)로 저널 점수를 매긴 뒤 AI에 초록을 보내 요약한다(`server/app/paper_analyzer/`).
- 계약은 메인 스펙 `paper-analysis`(요구사항 3개)와 `docs/api/openapi.yaml`의 `/api/papers/{id}/analysis`다. 둘 다 "세부 필드는 구현 전에 보완한다"고 적혀 있어서, 이 change의 델타 스펙(ADDED 6개)이 결과 형식과 장애 시 동작을 채운다.
- 저장소는 `archi_analyses`(`user_id`, `paper_id`, `result` jsonb, unique `(user_id, paper_id)`, 논문 삭제 시 함께 삭제)가 이미 마이그레이션에 있다. 논문 행은 `papers`(`s2_paper_id`, `attachment_type`, `title` 등)에 있고 DOI 컬럼은 없다.
- 벨루 결과 모양(참고): `{basic, analysis{keywords, domain, problem_short, problem, method_short, method, conclusion_short, conclusion, relevance, relevance_reason}, authors[], quality{matched_title, sjr, quartile, issn, type, country}}`. 벨루는 `sjr`을 "35,568"처럼 문자열로 돌려줬다.
- 선행 change가 제공한다고 가정하는 것(해당 change가 이름을 정하며 이 change의 구현 때 확인): `archi-studio-ai-provider`의 `complete`(한 번에 답을 받는 호출)와 JSON 파서·가짜 제공자, `archi-studio-papers`의 "내 논문 한 건 조회"와 "Zotero에서 첨부 PDF 가져오기".

## Goals / Non-Goals

**Goals:**
- 논문 하나를 분석해 요약과 저널 점수를 저장하고 다시 열 수 있게 한다.
- 단계마다(PDF 읽기, 저널 점수, Semantic Scholar, AI 요약·저장, API) 외부 서비스 없이 단독으로 검증된다.
- 11/10 전에 끝나지 않아도 데모가 되도록 벨루 분석 결과를 가져오는 예비안을 같이 만든다.

**Non-Goals:**
- 그림 추출, PDF 업로드·URL 입력, 제목 검색 API, 분석 다시 하기, 분석 이력 목록.
- 이미지를 AI에 보내는 기능(공용 AI 계층이 지원하지 않는다).

## Decisions

**1. 흐름과 모듈.** 모든 모듈은 `src/lib/server/analysis/` 아래에 두고, 바깥 세계(HTTP `fetch`, 시간 지연, AI 호출, Zotero 파일 가져오기, DB)는 함수 인자로 주입해서 테스트가 가짜를 넣는다.

```
POST /api/papers/{id}/analysis
  |
  +-- 논문 조회 (내 것이 아니면 404 paper_not_found)
  +-- archi_analyses에 있으면 그대로 반환 (AI 호출 없음)
  |
  +-- PDF 있음? --> Zotero에서 파일 --> pdf-extract: 제목, 초록, DOI, arXiv
  +-- Semantic Scholar: s2PaperId -> arXiv -> DOI -> 제목(정확 일치만)
  |       실패해도 PDF가 있으면 계속, 없으면 502 (조회 성공+못 찾음이면 422)
  +-- journal-score: venue -> 별칭 -> SCImago
  +-- summarize: 초록(없으면 제목) -> AI -> JSON
  +-- 저장 (충돌 시 기존 행을 읽어 반환) --> 200
```

**2. PDF 읽기 라이브러리는 `pdfjs-dist`를 추천한다.** 필요한 것은 첫 페이지의 글자 크기와 앞 3쪽의 텍스트뿐이다(그림은 범위 밖).

| 후보 | 장점 | 단점 |
|---|---|---|
| `pdfjs-dist` | 폴리오가 이미 같은 계열을 씀. 글자 크기·위치를 얻을 수 있음. 라이선스 Apache-2.0(2026-10-23 `npm view`로 확인) | Node에서는 `legacy` 빌드를 불러야 함. 5.7 이후와 6.x는 Node 22.13 이상이 필요해, Node 20.19 이상을 지원하는 마지막 판 `5.6.205`로 고정함(2026-10-23 확인). Node 22로 올리면 최신판으로 바꿀 수 있음 |
| `mupdf` (WASM) | 벨루의 PyMuPDF와 같은 엔진이라 결과가 가장 비슷함. 그림 추출도 가능 | 라이선스 AGPL-3.0(확인 필요), WASM 파일이 큼 |
| `unpdf` | pdf.js를 서버용으로 감싸 설치가 쉬움 | 글자 크기를 못 얻어 제목 추정 불가(확인 필요) |
| `pdf-parse` | 가장 간단 | 오래된 pdf.js에 묶여 있고 글자 크기를 못 얻음(확인 필요) |

대안으로 `mupdf`는 그림 추출을 되살릴 때 다시 검토한다. 선택: `pdfjs-dist@5.6.205`(정확한 판으로 고정).

**3. 제목·초록·번호 읽기는 벨루의 방식을 그대로 옮긴다.** 제목은 첫 쪽에서 크기 10pt 초과인 줄 중 가장 큰 글자의 88% 이상인 줄을 최대 4줄 이어 붙인다. 초록은 앞 3쪽에서 "Abstract" 머리글부터 다음 절(Introduction, Keywords, Index Terms 등) 전까지를 세 가지 방식으로 시도하고, 하이픈 줄바꿈과 공백을 정리해 80자 이상일 때만 최대 3,000자까지 쓴다. DOI와 arXiv 번호는 앞 2쪽에서 정규식으로 찾는다. 같은 한계(2단 편집, 특이한 서식)를 그대로 가져오는 대신 벨루와 같은 결과가 나오는지 비교하는 것을 우선한다. 파일 크기 상한은 벨루와 같은 50MB다. 한 가지는 일부러 다르게 했다(구현 때 발견): 벨루는 제목 줄을 `(크기, 문자열)` 튜플로 역순 정렬해, 크기가 같은 여러 줄 제목이 알파벳 역순으로 섞였다(예: "You Need"가 "Attention Is All" 앞에 옴). 새 모듈은 벨루 주석의 의도대로 문서 순서를 지킨다.

**4. 저널 점수.** SCImago CSV(세미콜론 구분, 따옴표 있음, 소수점이 쉼표)를 처음 쓸 때 한 번 읽어 "소문자 제목 → 행" 표와 "단어 → 제목 목록" 색인을 만든다. 벨루는 요청마다 모든 행을 훑었다. 동작은 같게 유지한다(별칭 → 정확 일치 → 단어 겹침 비율 0.6 이상 중 최고). `sjr`은 쉼표를 점으로 바꿔 숫자로 돌려준다. 데이터 파일은 `data/analysis/`에 두고 실행 때 파일로 읽는다(11MB를 서버 번들에 넣지 않는다). 배포 이미지에 `data/analysis/`가 들어가야 하므로 `archi-studio-deploy-cutover`에 알린다.

**5. Semantic Scholar 클라이언트.** 벨루의 동작을 옮긴다. 기본 주소와 요청 필드(`title,year,venue,externalIds,abstract,authors,citationCount`), 429이면 1, 2, 4, 8초 간격으로 최대 4번, 401·403은 설정 오류, 시간 초과 15초, `S2_API_KEY`가 없으면 요청 사이 1초 간격을 둔다. 저자 보강은 상위 3명만, 키가 있으면 병렬, 없으면 순차다. `fetch`와 `sleep`을 주입하면 테스트가 실제로 기다리지 않는다. 인증 없이 쓰면 한 번 분석에 몇 초가 걸리므로 데모 전에 키를 발급받는 것을 권한다(열린 질문 2).

**6. 연결 규칙.** `papers.s2_paper_id` → PDF의 arXiv 번호 → DOI → 제목 순서다. 제목 검색은 정규화(소문자, 공백·문장부호 제거)한 제목이 같을 때만 같은 논문으로 본다. 벨루는 검색 결과를 사용자가 고르게 했지만 새 앱은 후보를 고르는 화면이 없으므로 잘못 연결하는 것보다 연결하지 않는 쪽이 안전하다. 연결되면 `papers.s2_paper_id`를 채운다.

**7. 요약 프롬프트.** 벨루의 한국어 프롬프트 두 개(초록용, 제목용)를 `prompts.ts`로 옮기고 공용 AI 계층의 JSON 규약 문구와 파서를 쓴다. 벨루의 `relevance`·`relevance_reason`("PRML 연구실과의 관련성")은 연구실 하나에 묶인 항목이라 옮기지 않는다(열린 질문 1). AI에는 초록(또는 제목과 DOI)만 보낸다. `summary` 문자열은 세 개의 `*_short`를 줄바꿈으로 이어 만들고, 저장하는 JSON에는 `*_short`도 남겨 화면이 쓸 수 있게 한다. 모델 등급은 벨루의 기본 등급과 맞추고 품질을 비교해 정한다(확인 필요). 응답이 JSON이 아니면 공용 AI 계층의 재시도 규칙을 따르고 그래도 실패하면 502다.

**8. 저장과 동시 요청.** `archi_analyses`에 `insert ... on conflict (user_id, paper_id) do nothing`으로 쓰고, 충돌하면 기존 행을 읽어 돌려준다. 같은 논문을 동시에 두 번 요청하면 AI를 두 번 부를 수는 있지만 행은 하나이고 두 응답은 같다. 잠금을 쓰는 방법도 있으나 드문 경우를 위해 복잡해질 필요가 없다고 보았다. 저장 JSON은 API 응답에서 `paperId`를 뺀 것이고, `origin`(`native` 또는 `veloo-import`)을 함께 넣어 두되 API 응답에는 내보내지 않는다.

**9. 오류 매핑.**

| 상황 | 응답 |
|---|---|
| 로그인 안 함 | 401 `unauthenticated` |
| 없는 논문, 남의 논문 | 404 `paper_not_found` |
| 분석된 적 없는 논문의 GET | 404 `analysis_not_found` |
| PDF 없음 + Semantic Scholar에서 못 찾음(조회는 성공) | 422 `no_source_for_analysis` |
| AI 실패, 또는 PDF 없음 + Semantic Scholar 조회 실패 | 502 `upstream_unavailable` (내부 원인 코드는 로그에 이름만) |

**10. 예비안(11/10).** 벨루의 `paper_history` 행(`user_id`는 벨루 사용자, `paper_id`는 Semantic Scholar 키, `result`는 위 벨루 모양)을 `archi_analyses`로 옮기는 스크립트 `scripts/import-veloo-analyses.mjs`를 만든다. 벨루 DB가 곧 새 앱의 기준 DB라 같은 프로젝트에서 읽는다. 규칙은 이렇다. 기본은 확인만 하는 실행(dry-run)이고 `--apply`를 줘야 쓴다. 벨루 사용자와 새 계정의 대응은 직접 만든 매핑 파일(`data/veloo-user-map.json`, 사용자 이름이 들어가므로 git 추적 제외)에서 읽는다. `papers.s2_paper_id`가 일치하는 논문에만 넣고, 일치하는 논문이 없는 행은 새 논문을 만들지 않고 보고서에 제목과 함께 나열한다. 결과는 새 형식으로 바꾸고(`quality`의 `matched_title`→`matchedTitle`, `sjr` 문자열→숫자, `*_short`로 `summary` 만들기, `relevance` 제거) `sources`는 `{pdf:false, semanticScholar:true}`, `origin`은 `veloo-import`로 둔다. 다시 실행해도 중복되지 않는다. 가져온 논문은 `POST`를 해도 저장된 결과가 바로 돌아오므로 API와 화면은 그대로다.

**11. 시험 전략(외부 서비스 없이).**
- PDF: 손으로 만든 최소 PDF 파일(제목 18pt, 초록 문단 10pt, DOI 줄)을 스크립트로 만들어 저장소에 둔다. 저작권이 있는 논문 파일은 쓰지 않는다.
- 저널 점수: 아주 작은 CSV 조각으로 규칙(별칭, 정확 일치, 겹침 0.6, 쉼표 소수)을, 실제 CSV로는 대표 저널 5개의 값을 확인한다.
- Semantic Scholar: 가짜 `fetch`(429 두 번 뒤 200, 429 네 번, 401, 시간 초과)와 가짜 `sleep`.
- AI: 공용 AI 계층의 가짜 제공자로 프롬프트에 초록만 들어갔는지, 호출 횟수가 몇 번인지 확인한다.
- DB: `npm run db:start`가 켜진 상태의 통합 테스트(저장, 재요청 시 AI 호출 0회, 동시 두 건, 논문 삭제 시 함께 삭제, `s2_paper_id` 저장).

## Risks / Trade-offs

- **PDF 라이브러리를 바꾸는 위험**: PyMuPDF와 pdf.js는 글자 묶음 방식이 달라 같은 PDF에서 제목이 조금 다르게 나올 수 있다. 완화: 벨루에서 쓰던 PDF 3~5개로 두 결과를 비교하는 task를 둔다(개인 논문은 저장소에 넣지 않고 결과만 기록).
- **Semantic Scholar 호출 속도**: 키가 없으면 요청 사이 1초 간격이라 분석에 5초 안팎이 걸릴 수 있다. 완화: 키 발급, 저자 보강은 3명까지.
- **데이터 파일 크기와 라이선스**: 11MB CSV를 저장소에 넣는다. SCImago 데이터의 이용 조건(출처 표기 등)은 확인하지 못했다.
- **연결을 포기하면 정보가 줄어듦**: 제목이 조금이라도 다르면 Semantic Scholar 정보 없이 분석한다. 대신 잘못된 논문에 점수를 붙이지 않는다.
- **일정**: 이 기능이 가장 무겁다. 가져오기 스크립트(예비안)는 나머지와 독립이라 일정이 밀리면 먼저 만든다.

## Migration Plan

1. 이 change는 새 테이블을 만들지 않는다(`archi_analyses`는 이미 있음). `data/analysis/` 파일과 `.env.example`의 `S2_API_KEY` 이름만 추가된다.
2. 예비안을 쓰는 경우 운영(벨루) DB에는 읽기만 하고 `archi_analyses`에만 쓴다. 쓰기 전에 `deploy-cutover`의 백업을 거친다.
3. 롤백은 `archi_analyses`에서 `origin`이 `veloo-import`인 행을 지우는 것으로 충분하다.

## Open Questions

1. **관련성(`relevance`) 항목을 뺄까요?** 벨루는 "PRML 연구실과의 관련성"을 판단했다. 추천: 뺀다(연구실 하나에 묶인 항목이라 일반 앱에 맞지 않음). 필요하면 나중에 설정으로 넣는다.
2. **Semantic Scholar API 키를 발급받을까요?** 추천: 데모 전에 무료 키를 발급한다(속도와 429 방지).
3. **외부 서비스 장애의 오류 코드**: 이 change는 502 `upstream_unavailable`로 정했다. `archi-studio-translation`도 같은 코드를 쓰도록 맞춰야 한다. 추천: 두 change 모두 `upstream_unavailable`.
4. **SCImago CSV를 저장소에 그대로 둘까요?** 추천: 원본 그대로 두고 실행 때 색인을 만든다(출처 추적이 쉬움). 이용 조건은 확인 필요.
5. **제목으로 찾을 때 일치 기준**: 추천: 정규화한 제목이 정확히 같을 때만. 느슨하게 하면 오연결 위험이 커진다.
6. **요약 모델 등급(`fast`/`smart`)**: 추천: 벨루의 기본 등급과 맞춘 뒤 샘플 5편으로 품질을 비교해 정한다.
7. **분석 다시 하기**: 이번에는 범위 밖이다. 추천: 화면이 생긴 뒤 별도 change로.
8. **예비안으로 전환하는 기준**: 추천: 11/03에 Semantic Scholar 단계(task 4.x)가 끝나지 않았으면 가져오기 스크립트를 먼저 완성하고, 11/10에 5단계가 끝나지 않았으면 데모는 가져온 결과로 한다.

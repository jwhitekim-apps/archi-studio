# PDF 읽기 비교: 벨루 vs 새 모듈

2026-10-23. 같은 PDF를 벨루 `core/pdf_extractor.py`(PyMuPDF, `veloo:local` 이미지 안에서 네트워크 없이 읽기 전용 실행)와 새 `src/lib/server/analysis/pdf-extract.ts`(pdf.js)에 넣었다. PDF는 arXiv에서 받아 임시 폴더에만 두었고 저장소에는 넣지 않았다.

## 1. 제목

| arXiv 번호 | 실제 제목 | 벨루 | 새 모듈(고치기 전) | 새 모듈(고친 뒤) |
|---|---|---|---|---|
| 2407.16741 | OpenHands: An Open Platform for AI Software Developers as Generalist Agents | `arXiv:2407.16741v3  [cs.SE]  18 Apr 2025` | `arXiv:2407.16741v3 [cs.SE] 18 Apr 2025` | `OPENHANDS: AN OPEN PLATFORM FOR AI SOFTWARE DEVELOPERS AS GENERALIST AGENTS` |
| 2405.15793 | SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering | `arXiv:2405.15793v3  [cs.SE]  11 Nov 2024` | `arXiv:2405.15793v3 [cs.SE] 11 Nov 2024` | `SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering` |
| 2308.00352 | MetaGPT: Meta Programming for a Multi-Agent Collaborative Framework | `arXiv:2308.00352v7  [cs.AI]  1 Nov 2024` | `arXiv:2308.00352v7 [cs.AI] 1 Nov 2024` | `METAGPT: META PROGRAMMING FOR A MULTI-AGENT COLLABORATIVE FRAMEWORK` |

- **옮긴 규칙이 같은가:** 고치기 전 새 모듈은 정규화(공백 하나로, 소문자) 제목이 벨루와 3개 중 3개 같았다(통과 기준 80%).
- **둘 다 틀린 원인:** arXiv 판은 첫 쪽 왼쪽 여백에 세로 도장(`arXiv:번호 [분야] 날짜`)을 크게 찍는다. 가장 큰 글자를 제목으로 고르는 규칙이 이 도장을 고른다. 벨루의 분석 결과는 Semantic Scholar 제목이 우선이라 대개 가려졌지만, Semantic Scholar 연결이 실패하면 도장이 제목으로 저장된다.
- **고친 것:** 새 모듈은 세로 글자를 제목 후보에서 뺀다. 그러자 작은 대문자 제목이 `M ETA GPT`처럼 갈라져, 조각 사이를 공백 조각이 있거나 간격이 글자 크기의 20%를 넘을 때만 띄우게 했다. 고친 뒤 3개 중 3개가 실제 제목과 같다(대소문자는 PDF 표기 그대로). 벨루와는 3개 중 0개가 같지만 차이는 모두 이 수정 때문이다.

## 2. 초록 앞 200자, 번호

세 PDF 모두 벨루와 새 모듈의 초록 앞 200자, arXiv 번호가 글자까지 같았다. DOI는 셋 다 PDF 본문에 없어 양쪽 모두 null이다.

| arXiv 번호 | 초록 앞 200자(양쪽 같음) | arXiv 번호 | DOI |
|---|---|---|---|
| 2407.16741 | Software is one of the most powerful tools that we humans have at our disposal; it allows a skilled programmer to interact with the world in complex and profound ways. At the same time, thanks to impr | 2407.16741v3 | null |
| 2405.15793 | Language model (LM) agents are increasingly being used to automate complicated tasks in digital environments. Just as humans benefit from powerful software applications, such as integrated development | 2405.15793v3 | null |
| 2308.00352 | Remarkable progress has been made on automated problem solving through societies of agents based on large language models (LLMs). Existing LLM-based multi-agent systems can already solve simple dialog | 2308.00352v7 | null |

## 3. 다시 돌리는 법

```bash
# 벨루(읽기 전용, 네트워크 없음). x.py는 extract_title/extract_abstract/extract_ids를 불러 JSON으로 찍는 짧은 스크립트
docker run --rm --network none -v <벨루>/server/app/paper_analyzer/core:/velu:ro -v <pdf폴더>:/pdfs:ro \
  -v <x.py>:/x.py:ro --entrypoint python veloo:local -I /x.py /pdfs/*.pdf
# 새 모듈: extractFromPdf를 부르는 .mts 스크립트를 npx tsx로 실행
```

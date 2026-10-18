# Spec Delta

## ADDED Requirements

### Requirement: 분석 결과 형식
시스템은 분석 결과를 `paperId`, `summary`(문제·방법·결론 한 줄 요약을 이은 한국어 문자열), `keywords`, `domain`, `problem`, `method`, `conclusion`, `basic`(`title`, `year`, `venue`, `doi`, `arxivId`, `citationCount`), `authors`(최대 3명, `name`, `hIndex`, `citationCount`), `journalScore`, `sources`(`pdf`, `semanticScholar`)로 돌려줘야 한다(SHALL). 알 수 없는 값은 필드를 빼지 않고 null로, 목록은 빈 배열로 둔다.

#### Scenario: PDF와 Semantic Scholar가 모두 있는 논문
- **WHEN** PDF가 첨부돼 있고 Semantic Scholar에서 찾을 수 있는 논문의 분석을 요청한다
- **THEN** 시스템은 200과 모든 필드를 채운 결과를 돌려주고 `sources`의 두 값이 모두 true다

#### Scenario: PDF만 있는 논문
- **WHEN** Semantic Scholar에서 찾을 수 없는 논문의 PDF만으로 분석을 요청한다
- **THEN** 시스템은 200을 돌려주고 `basic`은 PDF에서 읽은 값으로 채우며 `authors`는 빈 배열, `journalScore`의 값은 모두 null, `sources.semanticScholar`는 false다

#### Scenario: Semantic Scholar만 있는 논문
- **WHEN** 첨부가 없고 `s2PaperId`로 Semantic Scholar에서 찾을 수 있는 논문의 분석을 요청한다
- **THEN** 시스템은 200을 돌려주고 초록은 Semantic Scholar 것을 쓰며 `sources.pdf`는 false다

### Requirement: 저널 점수 산정
시스템은 `basic.venue`로 `journalScore`(`matchedTitle`, `sjr`, `quartile`, `issn`, `type`, `country`)를 만들어야 한다(SHALL). 별칭 표로 약어를 정식 이름으로 바꾼 뒤(대소문자 무시) 같은 이름의 저널을 고르고, 없으면 단어가 60% 이상 겹치는 저널 중 가장 많이 겹치는 것을 고른다. `sjr`은 숫자다. 찾지 못하면 여섯 값을 모두 null로 둔다.

#### Scenario: 약어로 찾기
- **WHEN** `venue`가 `TBME`다
- **THEN** `matchedTitle`은 `IEEE Transactions on Biomedical Engineering`이다

#### Scenario: 이름이 정확히 같은 저널
- **WHEN** `venue`가 `Nature Reviews Molecular Cell Biology`다
- **THEN** `quartile`은 `Q1`이고 `sjr`은 숫자 35.568이다

#### Scenario: 이름이 비슷한 저널
- **WHEN** `venue`가 순위표 이름과 단어가 60% 이상 겹치지만 같지는 않다
- **THEN** 겹침이 가장 큰 저널의 값을 돌려준다

#### Scenario: 찾지 못하거나 venue가 비어 있음
- **WHEN** 순위표에 없는 `venue`이거나 `venue`가 빈 문자열이다
- **THEN** `journalScore`의 여섯 값은 모두 null이고 분석은 실패하지 않는다

### Requirement: Semantic Scholar 연결
시스템은 논문의 `s2PaperId`가 있으면 그것으로, 없으면 PDF에서 읽은 arXiv 번호, DOI, 제목 순서로 Semantic Scholar 논문을 찾아야 한다(SHALL). 제목으로 찾을 때는 대소문자·공백·문장부호를 무시하고 제목이 같은 결과만 같은 논문으로 본다. 분석에 쓸 논문이 정해지면 `papers.s2_paper_id`를 채운다.

#### Scenario: s2PaperId가 이미 있음
- **WHEN** 논문에 `s2PaperId`가 있다
- **THEN** 시스템은 그 값으로 조회하고 다른 방법은 쓰지 않는다

#### Scenario: arXiv 번호로 찾아 저장
- **WHEN** `s2PaperId`가 없고 PDF에서 arXiv 번호를 읽었다
- **THEN** 시스템은 그 번호로 찾은 논문의 `paperId`를 `papers.s2_paper_id`에 저장한다

#### Scenario: 제목만 비슷함
- **WHEN** 제목 검색 결과의 제목이 논문 제목과 정확히 같지 않다
- **THEN** 시스템은 그 결과를 연결하지 않고 Semantic Scholar 정보가 없는 것으로 진행한다

### Requirement: 외부 서비스 장애 시 동작
Semantic Scholar 호출이 실패해도(재시도 뒤에도 429, 인증 오류, 시간 초과) PDF가 있으면 시스템은 PDF만으로 분석하고 `sources.semanticScholar`를 false로 해야 한다(SHALL). AI 호출이 실패하거나, PDF가 없는데 Semantic Scholar가 실패하면 시스템은 502와 `error.code`가 `upstream_unavailable`인 본문을 돌려주고 아무것도 저장하지 않아야 한다(MUST). 오류 본문에 외부 서비스의 응답 내용이나 키를 넣지 않는다.

#### Scenario: Semantic Scholar 장애에 PDF가 있음
- **WHEN** Semantic Scholar가 429로 계속 실패하고 논문에 PDF가 있다
- **THEN** 시스템은 200과 PDF 기반 결과를 돌려주고 `sources.semanticScholar`는 false다

#### Scenario: AI 호출 실패
- **WHEN** 요약을 만드는 AI 호출이 재시도 뒤에도 실패한다
- **THEN** 시스템은 502 `upstream_unavailable`을 돌려주고 `archi_analyses`에 행을 만들지 않는다

#### Scenario: 자료가 없는 것과 장애를 구분
- **WHEN** PDF가 없고 Semantic Scholar 조회가 성공했지만 찾지 못한다
- **THEN** 시스템은 422 `no_source_for_analysis`를 돌려주고, 같은 상황에서 조회 자체가 실패했다면 502 `upstream_unavailable`을 돌려준다

### Requirement: 중복 저장 방지
시스템은 같은 사용자의 같은 논문 분석을 동시에 두 번 요청받아도 `archi_analyses`에 행을 하나만 두고 두 요청 모두 같은 결과를 돌려줘야 한다(MUST).

#### Scenario: 동시 요청
- **WHEN** 분석되지 않은 같은 논문의 분석을 동시에 두 번 요청한다
- **THEN** 두 요청 모두 200과 같은 결과를 받고 `archi_analyses`의 해당 행은 하나다

### Requirement: AI 입력 범위
시스템은 AI에 초록(없으면 제목과 DOI)만 보내야 하고(MUST), PDF 본문이나 파일 자체를 보내서는 안 된다.

#### Scenario: 초록이 있음
- **WHEN** 초록을 읽은 PDF의 분석을 요청한다
- **THEN** AI 요청에는 초록 문장만 들어 있고 PDF의 다른 본문은 들어 있지 않다

#### Scenario: 초록이 없음
- **WHEN** 초록이 없고 제목만 있다
- **THEN** AI 요청에는 제목과 DOI만 들어 있고 요약에는 제목에서 추정한 내용임이 드러난다

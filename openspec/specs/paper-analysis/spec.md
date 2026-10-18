# paper-analysis Specification

## Purpose

논문의 요약과 저널 품질 점수를 만드는 분석 기능을 정의한다. 분석 결과는 논문에 연결되어 논문 허브에서 다시 열 수 있다. 이 capability는 요약 수준이며 세부 형식은 구현 전에 보완한다.

## Requirements

### Requirement: 논문 분석 요청
시스템은 `POST /api/papers/{id}/analysis`로 논문의 PDF 또는 Semantic Scholar 정보를 바탕으로 분석을 만들어야 한다(SHALL). 같은 논문의 분석이 이미 있으면 새로 만들지 않고 저장된 결과를 돌려준다.

#### Scenario: 첫 분석
- **WHEN** 분석한 적 없는 논문의 분석을 요청한다
- **THEN** 시스템은 200과 요약과 저널 점수를 담은 결과를 돌려주고 저장한다

#### Scenario: 저장된 분석
- **WHEN** 이미 분석된 논문의 분석을 요청한다
- **THEN** 시스템은 AI를 다시 호출하지 않고 저장된 결과를 돌려준다

### Requirement: 분석 불가 응답
분석에 쓸 PDF도 Semantic Scholar 정보도 없으면 시스템은 분석을 거부해야 한다(MUST).

#### Scenario: 자료 없음
- **WHEN** 첨부도 외부 정보도 없는 논문의 분석을 요청한다
- **THEN** 시스템은 422와 `error.code`가 `no_source_for_analysis`인 본문을 돌려준다

### Requirement: 분석 조회
시스템은 `GET /api/papers/{id}/analysis`로 저장된 분석을 돌려줘야 한다(SHALL).

#### Scenario: 분석 없음
- **WHEN** 분석되지 않은 논문의 분석을 조회한다
- **THEN** 시스템은 404와 `error.code`가 `analysis_not_found`인 본문을 돌려준다

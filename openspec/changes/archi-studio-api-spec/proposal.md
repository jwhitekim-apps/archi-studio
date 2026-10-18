# Proposal

## Why

벨루(FastAPI)와 폴리오(Express)는 로그인, DB, 논문 식별 키가 서로 달라서 "한 논문에서 분석, 번역, 메모로 이어지기"가 불가능하다. Archi Studio는 이를 하나의 앱으로 통합하는데, 11/24 데모 전에 이식을 시작하려면 새 API 계약을 먼저 합의해야 한다. 계약이 없으면 화면, 서버, DB를 병렬로 만들 수 없다.

## What Changes

- 새 앱의 HTTP API를 `/api/...` 아래에 처음부터 다시 정의한다. 기존 벨루·폴리오 경로와 호환하지 않는다.
- 로그인을 Supabase Auth 하나로 통일하고, Zotero는 로그인이 아닌 "연결"로 분리한다.
- 논문을 중심 자원으로 삼는다. 논문 하나는 Zotero `item_key`와 Semantic Scholar `s2_paper_id`를 모두 가질 수 있다.
- 번역 이력에 논문 참조(`paper_id`)를 추가해 번역을 논문에 연결한다.
- 우선순위: 인증, Zotero 연결, 논문 허브(서재, 상세, 컬렉션), 메모 API를 상세히 정의한다. 번역, 분석, 브리핑은 뒷순서로 요약 수준만 정의한다.
- 이 change는 명세만 작성한다. 코드, 스키마 마이그레이션, 데이터 이관은 포함하지 않는다.

## Capabilities

### New Capabilities

- `auth`: Supabase Auth 기반 가입, 로그인, 로그아웃, 현재 사용자 조회, 베타 사용자 승인
- `zotero-connection`: Zotero OAuth1 연결과 해제, 연결 상태 조회, 증분 동기화
- `papers`: 서재 목록, 검색, 컬렉션, 논문 상세, 첨부(PDF/HTML) 제공, 웹페이지 논문 추가, 삭제
- `paper-notes`: 논문별 마크다운 메모의 조회, 저장(Zotero 자식 노트), 삭제
- `translation`: 영→한 스트리밍 번역과 논문에 연결되는 번역 이력 (요약 수준)
- `paper-analysis`: 논문 분석 요청과 결과 이력, 저널 점수 (요약 수준)
- `briefing`: 비서가 만든 일일 브리핑 기록의 조회 (요약 수준)

### Modified Capabilities

(없음. 이 프로젝트에는 기존 spec이 없다.)

## Impact

- 새 저장소 `archi-studio`의 SvelteKit 서버 라우트(`/api/...`)가 이 계약을 구현한다.
- 기준 DB는 벨루 Supabase 프로젝트다. 개발은 Docker 로컬 Supabase에서 하고(무료 요금제라 별도 클라우드 프로젝트를 만들 수 없다), 완성되면 같은 마이그레이션을 벨루 프로젝트에 적용한다. 기존 벨루 테이블은 수정하지 않고 `folio_` 테이블 3개와 `papers` 관련 신규 테이블만 추가하며, 적용 전에 백업한다.
- 비서(morning-desk)와 폴리오 서버는 Supabase 접속 값 교체가 필요하다(이 change 밖).
- 벨루의 Python 분석 로직은 TypeScript로 다시 쓰며, 순서는 design.md에서 정한다.
- 기존 벨루, 폴리오 서비스는 새 앱이 완성될 때까지 그대로 유지한다.

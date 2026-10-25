# Proposal

## Why

비서(morning-desk, 하루 한 번 돌며 메일·GitHub·폴리오를 읽고 할 일을 정리해 카카오톡으로 보내는 프로그램)가 만든 브리핑은 지금 카카오톡 메시지로만 남고 다시 찾아볼 곳이 없다. Archi Studio가 하나의 앱이 되려면 브리핑도 앱 안에서 날짜별로 다시 볼 수 있어야 하고, 브리핑이 언급한 논문에서 그 논문의 허브(분석·번역·메모)로 바로 이어져야 한다. 데모의 마지막 장면("서재 → 논문 → 분석 → 번역 → 메모 → 브리핑")을 이 API가 받친다.

## What Changes

- `GET /api/briefings`(목록, 최신순, `limit`·`cursor` 페이지)와 `GET /api/briefings/{id}`(본문과 언급된 논문 `paperIds`)를 구현한다. 둘 다 로그인한 사용자 본인의 브리핑만 돌려준다.
- 앱은 브리핑을 **읽기만** 한다. `POST` 등 쓰기 메서드는 405이고, 앱 코드가 브리핑 테이블에 쓰지 않는다는 것을 자동 검사로 고정한다.
- 비서가 기록하는 쪽과 앱이 읽는 쪽이 만나는 **접점 계약**(테이블, 컬럼, 본문 형식, 논문 연결 규칙, 어느 사용자의 브리핑인지 정하는 방법)을 문서(`docs/dev/briefing-contract.md`)로 확정한다. 비서 쪽 change `briefing-store`가 이 문서를 그대로 따른다.
- 비서 없이도 검증할 수 있게, 통합 테스트가 시험용 브리핑과 논문 연결을 SQL(서비스 키 삽입)로 직접 만든다.
- **옮기지 않는 것**: 브리핑을 만드는 일(비서 몫), 화면(`archi-studio-ui-briefing` 몫), 브리핑 삭제·수정·재생성.

## Capabilities

### New Capabilities
없음. 새 동작 계약은 만들지 않는다.

### Modified Capabilities
없음. 계약은 이미 메인 스펙 `briefing`(`openspec/specs/briefing/spec.md`)에 있고 이 change는 그것을 구현한다. 그래서 `.openspec.yaml`에 `skip_specs: true`를 선언했다. 스펙이 정하지 않은 세부(`limit` 최대값, 잘못된 `cursor`의 응답 등)는 `design.md`의 결정으로 두고 `docs/api/openapi.yaml`에 적는다.

## Impact

- **선행**: `archi-studio-papers`(브리핑이 언급한 논문을 앱의 `papers` 행과 연결하려면 논문 테이블에 데이터가 있어야 한다). 인증은 이미 완료됐다(`archi-studio-auth`).
- **연계**: `briefing-store`(morning-desk 저장소, 비서가 브리핑을 기록), `archi-studio-ui-briefing`(이 API를 쓰는 화면).
- **코드**: `src/lib/server/`에 읽기 서비스와 시험 하네스 확장, `src/routes/api/briefings/` 두 경로, 통합·단위 테스트. DB 변경은 없다(테이블은 이미 마이그레이션 `20261018000500_briefings.sql`에 있다).
- **문서**: `docs/dev/briefing-contract.md`(신규), `docs/api/openapi.yaml`(400 응답과 `limit` 범위 보완).
- **운영**: 운영 DB 적용은 `archi-studio-deploy-cutover` 몫이다.

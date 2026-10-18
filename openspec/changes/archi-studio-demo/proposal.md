# Proposal

## Why

11월 24일 소프트컴퓨팅 세미나에서 "따로 만든 연구 도구 3개(벨루, 폴리오, 비서)를 하나의 앱 Archi Studio로 통합했다"를 보여 줘야 한다. 기능을 모두 만들어도 발표 흐름, 시험용 데이터, 예비 영상, 발표 장소의 접속 방법이 준비돼 있지 않으면 현장에서 실패할 수 있다. 또 "통합했다"는 말이 사실이 되려면 로그인, 메뉴, 논문 데이터가 정말 하나여야 하므로, 그 주장을 화면에서 확인하는 절차도 필요하다.

## What Changes

이 change는 코드가 아니라 **발표 준비 문서와 절차**를 만든다. 구현 단계에서 `docs/demo/` 아래에 다음을 작성한다.

- **데모 대본**: 3장면(① 흩어진 모습: 프로젝트 3개, 로그인 3개, 언어 3개 ② 통합된 한 흐름: 서재 → 논문 → 분석 → 번역 → 메모 → 브리핑 ③ 통합의 근거: 데이터 하나, 로그인 하나, 디자인 하나, AI 사용 원칙)의 화면 순서, 말할 내용, 장면별 소요 시간.
- **검증 항목**: "통합했다"는 주장마다 화면에서 확인할 증거(같은 계정으로 모든 화면에 들어가는지, 같은 논문이 모든 화면에서 이어지는지, 같은 디자인인지)를 표로 적는다. 증거가 없는 주장은 발표에서 쓰지 않는다.
- **시험용 데이터와 계정**: 샘플 논문, 번역 이력, 분석 결과, 브리핑을 만드는 절차와 데모 전용 계정 준비(승인 완료 상태).
- **예비 녹화 영상**: 인터넷이나 학교 LLM이 막힐 때 틀 영상의 촬영 계획, 보관 위치, 재생 점검.
- **리허설 체크리스트**: 기능을 더 이상 바꾸지 않는 시점(기능 동결) 이후 처음부터 끝까지 돌리는 절차와 실패했을 때의 대체 경로.
- **발표 장소 점검표**: 발표 장소의 노트북에서 앱을 여는 방법, 네트워크, 화면 해상도, 학교 LLM 호출 경로(앱을 돌리는 집 서버가 호출하므로 노트북에는 인증서가 필요 없음) 확인 항목.

이 change는 코드를 바꾸지 않으며 새 요구사항(스펙)도 만들지 않는다(`skip_specs`).

## Capabilities

### New Capabilities
없음. 새로운 시스템 동작을 만들지 않는 문서와 절차 change다.

### Modified Capabilities
없음.

## Impact

- 새 파일: `docs/demo/script.md`, `docs/demo/evidence-checklist.md`, `docs/demo/seed-data.md`, `docs/demo/backup-video.md`, `docs/demo/rehearsal-checklist.md`, `docs/demo/venue-checklist.md`.
- 시험용 데이터를 넣을 때 데모용 계정과 데이터가 로컬 또는 운영 DB에 생긴다. 운영 DB에 넣기 전에 백업 절차(`archi-studio-deploy-cutover`)를 따른다.
- 선행: 모든 기능 change(`archi-studio-zotero-connection`, `archi-studio-papers`, `archi-studio-paper-notes`, `archi-studio-translation`, `archi-studio-paper-analysis`, `archi-studio-briefing`, `briefing-store`, 화면 4개)와 `archi-studio-deploy-cutover`. 데모용 로컬 환경(`docs/dev/setup.md`)으로도 시험은 시작할 수 있다.

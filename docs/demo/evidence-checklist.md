# 통합 증거 표

"통합했다"는 주장마다 화면에서 확인할 방법을 적는다. 확인 결과 칸은 기능 동결 후 리허설(rehearsal-checklist.md)에서 `통과 / 실패 / 예비안`으로 채운다. 증거가 없는 주장은 발표에서 쓰지 않는다.

근거가 된 저장소 상태(2026-10-25 기준):
- 보관된 change: auth, api-spec, scaffold, review-fixes, zotero-connection, papers, ai-provider, translation, paper-analysis, ui-auth-library, ui-translate-analyze, paper-notes, ui-paper-hub (`openspec/changes/archive/`).
- 진행 중인 change: briefing, ui-briefing, deploy-cutover, demo. 브리핑 행(E7)은 이 둘이 끝나야 확인할 수 있다.
- 현재 스펙: auth, auth-screens, app-shell, ui-foundation, library-screen, paper-hub-screen, papers, paper-notes, translation, translate-screen, paper-analysis, analyze-screen, ai-provider, zotero-connection, settings-panel, briefing 등 (`openspec/specs/`).

| 번호 | 주장 | 화면에서 확인하는 방법 | 근거 스펙 | 확인 결과 |
|---|---|---|---|---|
| E1 | 로그인이 하나다 | 한 번 로그인한 뒤 서재, 논문 허브, 번역, 분석, 브리핑을 차례로 열어도 로그인 화면이 다시 나오지 않는다 | auth, auth-screens | |
| E2 | 논문 데이터가 하나다 | 서재에서 연 논문의 제목이 논문 허브, 분석 결과, 번역 이력, 메모, 브리핑에서 같은 논문으로 보인다 | papers, paper-hub-screen, paper-notes | |
| E3 | 디자인이 하나다 | 모든 화면이 같은 색·글자·간격 토큰과 같은 3단 셸(왼쪽 메뉴, 본문, 오른쪽 패널)을 쓴다. 화면을 넘기며 셸이 바뀌지 않는지 본다 | ui-foundation, app-shell | |
| E4 | 메뉴가 하나다 | 왼쪽 메뉴 하나에서 서재, 번역, 분석, 브리핑, 설정으로 모두 이동한다. 다른 사이트로 나가는 링크가 없다 | app-shell, settings-panel | |
| E5 | AI 사용 원칙이 하나다 | 번역과 분석이 모두 학교 LLM 하나를 쓰고, 설정 화면에 다른 AI 제공자 선택지가 보이지 않는다 | ai-provider, translation, paper-analysis | |
| E6 | 앱이 하나다 | 주소창의 도메인이 처음부터 끝까지 한 공개 주소다. 프로젝트 3개(벨루, 폴리오, 비서)가 하나의 저장소·하나의 서버(포트 8000)로 바뀌었다 | api-foundation, local-dev-environment | |
| E7 | 브리핑도 같은 논문을 쓴다 | 브리핑 목록의 논문을 누르면 같은 논문 허브로 이동한다 (briefing change 완료 후) | briefing | |
| E8 | Zotero 서재가 그대로 이어진다 | 설정에서 Zotero를 연결하고 동기화하면 서재에 같은 논문이 나타난다. 실패하면 SQL 시드(`scripts/demo-seed.sql`)로 대체하고 예비안으로 적는다 | zotero-connection | |

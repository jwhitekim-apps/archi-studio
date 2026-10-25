# 리허설 체크리스트

기능 동결(11/21) 이후 두 번 한다. 첫 번째는 대본대로, 두 번째는 일부러 실패를 일으킨다.

## 1. 정상 리허설

1. `venue-checklist.md`의 집 서버 쪽 점검을 통과시킨다.
2. 타이머를 켜고 `script.md` 장면 1~3을 처음부터 끝까지 진행한다.
3. 장면별 시간을 적는다. 목표는 총 9분 이내.
4. `evidence-checklist.md`의 확인 결과 칸을 통과/실패/예비안으로 모두 채운다. 빈 칸 수 확인: `grep -E '\| *\|$' docs/demo/evidence-checklist.md | wc -l`이 0.

## 2. 실패 주입 리허설

| 실패 | 일으키는 방법 | 되돌리는 방법 | 대체 경로 |
|---|---|---|---|
| 인터넷 끊김 | 노트북 Wi-Fi 끄기 | Wi-Fi 다시 켜기 | 예비 영상 `demo-s1~s3.mp4` 재생 |
| 학교 LLM 차단 | 집 서버에서 `sudo iptables -I OUTPUT -d <학교 LLM 주소> -j REJECT` | `sudo iptables -D OUTPUT -d <학교 LLM 주소> -j REJECT` | 미리 만든 번역 이력과 분석 결과 표시 |
| Semantic Scholar 429 | 차단 방법은 학교 LLM과 같다(`api.semanticscholar.org` 주소) | 같은 규칙 삭제 | 미리 만든 분석 결과 |
| 분석 예비안 | 분석 기능이 미완성이면 `scripts/import-veloo-analyses.mjs`로 기존 벨루 결과를 연결 | 연결한 행 삭제 | 화면에 "기존 벨루 결과"라고 말한다 |
| Zotero 동기화 실패 | 설정에서 Zotero 연결 해제 | 다시 연결 | `scripts/demo-seed.sql`로 같은 논문 투입 |

규칙을 넣은 뒤에는 반드시 되돌리고 `sudo iptables -L OUTPUT -n`으로 규칙이 없는지 확인한다.

## 3. 기록

| 날짜 | 종류 | 총 소요 시간 | 막힌 곳 | 대체 경로 성공 |
|---|---|---|---|---|
| | 정상 | | | |
| | 실패 주입 | | | |

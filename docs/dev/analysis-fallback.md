# 분석 예비안: 벨루 분석 결과 가져오기

논문 분석 기능(`POST /api/papers/{id}/analysis`)이 발표 전에 끝나지 않으면, 벨루에 이미 저장된 분석 결과(`paper_history`)를 새 앱의 `archi_analyses`로 옮겨 데모를 한다. 가져온 결과는 새 형식으로 바뀌어 저장되므로, 화면과 API는 그대로 쓴다(`POST`를 해도 저장된 결과가 바로 돌아온다).

스크립트: `scripts/import-veloo-analyses.mjs`. 벨루 `paper_history`는 읽기만 하고, 쓰는 곳은 `archi_analyses`뿐이다.

## 1. 전환 판단 체크리스트

| 날짜 | 확인할 것 | 미완이면 |
|---|---|---|
| 11/03 | Semantic Scholar 연결(작업 4.1, 4.2)이 끝났는가 | 가져오기 스크립트(작업 7.1)를 먼저 마무리하고 이 문서대로 로컬에서 한 번 돌려 둔다 |
| 11/10 | 분석 흐름과 API(작업 5.2, 6.1)가 끝났는가 | 데모는 가져온 결과로 한다. 아래 3절을 운영 DB에 실행한다 |

2026-10-23 기준 작업 4.x, 5.2, 6.1은 끝났다. 이 예비안은 "새로 분석이 안 되는 논문을 벨루 결과로 채우는" 용도로만 남는다.

## 2. 준비

- 매핑 파일 `data/veloo-user-map.json`을 만든다. 벨루 `users.id`를 새 앱 `auth.users.id`에 짝짓는다. 사용자 이름이 들어갈 수 있어 git이 추적하지 않는다(`.gitignore`).

  ```json
  { "<벨루 users.id>": "<새 앱 auth.users.id>" }
  ```

- `.env`에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`가 있어야 한다. 운영에 쓸 때는 운영 값이 든 별도 파일을 `--env-file`로 넘긴다.
- 가져올 논문은 새 앱 `papers`에 이미 있고 `s2_paper_id`가 벨루 `paper_history.paper_id`와 같아야 한다. 없는 논문은 새로 만들지 않고 보고서에 제목과 함께 나열한다.

## 3. 실행 순서

아래 `DB` 명령은 로컬 Supabase 기준이다(호스트에 `psql`이 없어 DB 컨테이너 안의 것을 쓴다). 운영 DB에서는 `archi-studio-deploy-cutover`의 백업 절차를 먼저 거치고, SQL은 같은 내용을 운영 접속으로 실행한다.

```bash
DB="docker exec -i supabase_db_archi-studio psql -U postgres"

# 1) 백업: 지금 있는 분석 행을 파일로 남긴다
mkdir -p backup
docker exec supabase_db_archi-studio pg_dump -U postgres --data-only -t public.archi_analyses > backup/archi_analyses-$(date +%F).sql

# 2) 확인만(dry-run): 아무것도 쓰지 않고 가져올 것과 건너뛸 것을 보여 준다
node --env-file=.env scripts/import-veloo-analyses.mjs

# 3) 적용
node --env-file=.env scripts/import-veloo-analyses.mjs --apply

# 4) 확인 SQL: 가져온 행 수, sjr이 숫자인지, relevance가 없는지
$DB -c "select count(*) as imported,
               bool_and(jsonb_typeof(result->'journalScore'->'sjr') in ('number','null')) as sjr_numeric,
               bool_and(not (result ? 'relevance')) as no_relevance
          from archi_analyses where result->>'origin' = 'veloo-import';"
```

다시 실행해도 이미 분석이 있는 논문은 "이미 분석 있음"으로 건너뛰므로 행이 늘지 않는다.

## 4. 롤백

가져온 행만 지운다. 새 앱이 직접 만든 분석(`origin`이 `native`)은 남는다.

```bash
$DB -c "delete from archi_analyses where result->>'origin' = 'veloo-import';"
```

## 5. 변환 규칙

| 벨루 | 새 형식 |
|---|---|
| `analysis.*_short` 세 개 | 줄바꿈으로 이어 `summary`, 각각은 `problemShort` 등으로도 남긴다 |
| `analysis.relevance`, `relevance_reason` | 뺀다(연구실 하나에 묶인 항목) |
| `quality.matched_title` | `journalScore.matchedTitle` |
| `quality.sjr`(`"35,568"` 같은 문자열) | 숫자 `35.568` |
| `authors[].topPapers`, `authorId` | 뺀다(`name`, `hIndex`, `citationCount`만, 최대 3명) |
| (없음) | `sources`는 `{pdf: false, semanticScholar: true}`, `origin`은 `veloo-import` |

## 6. 로컬 시험 기록 (2026-10-23)

로컬 DB에 벨루 모양의 `paper_history` 임시 테이블을 만들고 행 3개(일치하는 논문 있음 2, 없음 1)로 이 문서의 3절과 4절을 그대로 돌렸다.

- 확인만: "가져옴 2, 건너뜀 1", `Unmatched Paper — 일치하는 논문 없음`. `archi_analyses`는 0행 그대로.
- 적용: 2행. `sjr`은 숫자(`"1,234"` → `1.234`), `summary`는 세 줄, `relevance` 없음, `origin`은 `veloo-import`.
- 다시 적용: "가져옴 0, 건너뜀 3", 여전히 2행.
- 롤백 뒤 0행.

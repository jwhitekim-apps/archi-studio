# Tasks

표시: **[운영 영향]** 은 운영 DB나 운영 서버를 바꾸는 단계다. 이 단계는 명령을 실행하기 직전에 사용자에게 무엇을 실행할지 보여 주고 확인을 받은 뒤에만 진행한다. 비밀값(연결 문자열, 키)은 화면과 파일에 출력하지 않고 환경 변수로만 받는다.

## 1. 사전 확인 (운영에 영향 없음)

- [ ] 1.1 사용자가 벨루 Supabase 대시보드에서 DB 용량과 한도, 연결 수 한도, 요금제 이름을 읽어 알려 주면 `docs/deploy/capacity.md`에 숫자 4개(현재 용량, 용량 한도, 연결 수 한도, 새 테이블 11개의 예상 증가량)를 적는다. 현재 용량이 한도의 70% 이상이면 이후 단계를 멈추고 사용자에게 대응(정리 또는 요금제 상향)을 묻는다. 검증: 문서에 숫자 4개가 모두 있고 70% 판정이 적혀 있다.
- [ ] 1.2 운영 호스트의 구성을 `docs/deploy/host-inventory.md`에 표로 적는다: 서비스 이름, 포트(벨루 9000, 폴리오 3002 확인), 프록시(nginx), 터널(cloudflared) 상태, 저장소 폴더. 이 서버에서 확인할 수 있는 것은 `docker ps`와 `ss -ltn`으로 확인하고, 운영 호스트 접속이 필요한 것은 사용자에게 명령을 알려 주고 결과를 받는다. 검증: 표의 모든 칸이 "확인함"과 "확인 필요" 중 하나로 채워져 있고, 확인 필요 칸이 열린 질문 3번과 연결돼 있다.

## 2. 배포 산출물 (로컬 검증, 운영에 영향 없음)

- [x] 2.1 저장소 루트에 `Dockerfile`(Node 20 멀티스테이지, `npm ci`·`npm run build` 후 `node build`)과 `.dockerignore`(`.env`, `node_modules`, `build`)를 만든다. adapter-node는 이미 설정돼 있다(`svelte.config.js`). 검증: `docker build -t archi-studio:local .`이 성공한다.
- [x] 2.2 벨루 `docker-compose.yaml`을 기반으로 `docker-compose.yaml`을 만든다: `env_file: .env`, `${PORT:-9000}` 포트, `init`, `restart: unless-stopped`, `BODY_SIZE_LIMIT=4M`, 학교 인증서 읽기 전용 마운트와 `NODE_EXTRA_CA_CERTS`. `.env.example`에 Supabase, Zotero, `LOCAL_LLM_*`, `S2_API_KEY`, `AI_PROVIDER=local`, `ORIGIN`, `PORT`, 인증서 경로 이름만(값 없이) 적고 Anthropic·Gemini 키는 넣지 않는다. 로컬 Supabase(`npm run db:start`)로 `docker compose up -d --build` 뒤 `curl -s http://127.0.0.1:<포트>/api/health`가 200 `{"status":"ok"}`이고, 컨테이너 안에서 학교 LLM 요청이 TLS 오류 없이 응답하며, `ORIGIN`을 틀리게 한 컨테이너에서 외부 출처 폼 요청이 403 `forbidden_origin`인지 확인한 뒤 정리한다.
- [ ] 2.3 벨루의 `scripts/setup-nginx-https.sh`를 `scripts/`로 복사해 고친다: `<domain> <email>` 인자와 `APP_PORT` 환경 변수를 유지하고 벨루 이름이 든 문구를 바꾼다. 검증: `sh -n`이 통과하고, 인자 없이 실행하면 사용법을 출력하고 종료 코드 2다.
- [ ] 2.4 벨루의 `scripts/wsl-http-portproxy.ps1`을 `scripts/`로 복사해 고친다: 고정 IP `192.168.219.105`를 필수 매개변수 `-ListenAddress`로, 규칙 이름을 `-RuleName`(기본 `Archi Studio`)으로 바꾼다. 검증: `grep -n 192.168 scripts/wsl-http-portproxy.ps1`이 0건이고, 가능하면 `pwsh`로 구문 분석이 통과한다.
- [ ] 2.5 `.github/workflows/deploy.yml`을 만든다. 벨루 워크플로에서 재사용하는 것(SSH 접속과 시크릿 이름 `SSH_PRIVATE_KEY`·`SSH_HOST`·`SSH_PORT`·`SSH_USER`, `wsl.exe -- bash -s`, `git fetch`·`git reset --hard`, `concurrency`, `docker compose up -d --build`, `docker compose ps`)과 바꾸는 것(저장소 폴더, 배포 전 `npm run check`와 `npm test`)을 파일 맨 위 주석에 한 줄씩 적고, 트리거는 `workflow_dispatch`만 둔다. 검증: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy.yml'))"`가 오류 없이 끝나고 `grep -n "push:" .github/workflows/deploy.yml`이 0건이다.
- [x] 2.6 `docs/deploy/rollback.md`에 새 앱 배포를 되돌리는 명령(이전 이미지 태그로 `docker compose up -d`, 새 컨테이너 중지, 구 서비스 `docker compose start`)을 단계별로 적고, 로컬에서 "이전 태그 이미지로 되돌리기"를 실제로 한 번 실행해 health 응답이 돌아오는지 확인한다.

- [ ] 2.7 실제 Zotero 계정으로 수동 점검표를 `docs/deploy/manual-check.md`에 만들고 2.2의 컨테이너에서 실행한다: (1) Zotero OAuth 연결이 끝나 논문 목록이 동기화된다, (2) 첨부 PDF가 뷰어에서 열린다, (3) 메모를 저장하고 새로고침 뒤 그대로 보이며 1MB에 가까운 메모도 저장된다. 검증: 세 항목 모두 날짜와 결과가 기록돼 있다. 첫 배포(5.1) 직후 공개 주소에서도 같은 점검을 다시 한다.

## 3. 운영 DB 적용

- [ ] 3.1 `docs/deploy/db-apply.md`에 `docs/api/data-model.md` 7절의 순서를 실행 가능한 명령으로 옮긴다(`pg_dump` 백업, `public` 테이블 목록 조회 SQL, 기존 6개 테이블 행 수 기록 SQL, `psql -1`로 마이그레이션 6개 적용, 적용 후 확인 SQL, 롤백 SQL). 그다음 로컬 DB에 `veloo.2joon.com/server/schema.sql`을 먼저 적용하고 샘플 행을 넣은 상태에서 이 문서의 명령을 그대로 실행한다. 검증: 적용 뒤 새 테이블 11개가 모두 있고 RLS(행 수준 보안)가 켜져 있으며 기존 6개 테이블의 행 수가 적용 전과 같고, 롤백 SQL 실행 뒤 새 테이블이 모두 사라지고 기존 행 수가 여전히 같다.
- [ ] 3.2 **[운영 영향]** 운영 DB를 백업한다. 사용자 확인 뒤 연결 문자열을 환경 변수로 받아 `pg_dump`를 실행하고, 파일은 저장소 밖에 둔다. 검증: 백업 파일 크기가 0보다 크고, 같은 파일을 로컬 DB에 복원했을 때 기존 6개 테이블의 행 수가 운영 조회 값과 같다. 롤백: 이 단계는 읽기 전용이라 되돌릴 것이 없다.
- [ ] 3.3 **[운영 영향]** 운영 DB에 마이그레이션을 적용한다. 먼저 `public` 테이블 목록을 조회해 새 이름 11개와 겹치지 않는지 확인하고(겹치면 `papers`를 `archi_papers`로 바꾸는 별도 승인을 받는다), 사용자 확인 뒤 `psql -1`로 6개 파일을 적용한다. 검증: 적용 후 새 테이블 11개와 RLS 켜짐을 SQL로 확인하고 기존 6개 테이블의 행 수가 3.1 기록과 같다. 롤백: `docs/deploy/db-apply.md`의 롤백 SQL을 실행하고 행 수를 다시 비교한다.
- [ ] 3.4 **[운영 영향]** 운영 Supabase Auth 설정을 `supabase/config.toml`의 로컬 값(최소 비밀번호 길이 8, 이메일 확인 끔, 가입 허용, 사이트 주소)과 표로 대조하고 다른 항목 목록을 사용자에게 보여 준다. 사용자가 대시보드에서 직접 바꾼 뒤 시험 계정으로 가입해 승인 전 로그인이 403 `pending_approval`인지 확인하고 그 계정을 삭제한다. 롤백: 바꾼 설정을 대조표의 이전 값으로 되돌린다.
- [ ] 3.5 **[운영 영향]** 비서(`morning-desk`)와 폴리오 서버의 `SUPABASE_URL`과 service 키를 벨루 프로젝트 값으로 바꾼다(코드는 건드리지 않고 환경 변수만). 비서는 드라이런으로, 폴리오는 로그인 뒤 목록 조회로 오류 없이 동작하는지 확인한다. 기존 폴리오 사용자는 새 앱에서 다시 가입하고 Zotero를 다시 연결해야 한다는 안내문을 `docs/deploy/folio-users-notice.md`에 쓴다. 롤백: 환경 변수를 이전 값으로 되돌리고 재시작한다. 이전 값은 바꾸기 전에 저장소 밖 파일에 보관한다.

## 4. 기존 벨루 사용자 이관

- [ ] 4.1 사용자가 운영 DB에서 `select count(*), count(email), count(*) filter (where is_approved) from users;` 결과를 알려 주면 `docs/deploy/user-migration.md`에 대상 수(전체, 이메일 있음, 승인됨)를 적고, 이메일이 없는 사용자의 처리 방식(사용자에게 이메일을 받아 이관)을 확정한다. 검증: 문서에 숫자 3개와 처리 방식이 있다.
- [ ] 4.2 `scripts/migrate-veloo-users.ts`를 만든다. 기본이 시험 실행이며 `--apply` 없이는 쓰지 않는다. 입력은 벨루 `users`의 내려받은 행, 출력은 "이관 N명, 건너뜀 M명(이유 포함)"이다. 로컬 Supabase에 승인된 사용자, 미승인 사용자, 이메일 없는 사용자 샘플 3명으로 리허설해, 승인된 사용자가 이관 후 같은 비밀번호로 로그인되는지(해시 호환), 미승인 사용자가 403 `pending_approval`인지, 이메일 없는 사용자가 건너뜀 목록에 나오는지 확인한다. 해시가 호환되지 않으면 방식 B(재설정 안내)로 바꾸고 문서에 이유를 적는다.
- [ ] 4.3 **[운영 영향]** 운영 이관을 실행한다. 시험 실행 결과(이관 N명, 건너뜀 M명)를 사용자에게 보여 주고 확인을 받은 뒤 `--apply`로 실행한다. 이관된 계정에는 `migrated_from=veloo` 표식이 붙는다. 검증: 이관 수가 시험 실행과 같고, 이관된 승인 사용자 한 명(사용자가 정함)이 새 앱에서 로그인되며, 기존 벨루 `users` 행 수는 그대로다. 롤백: 표식이 있는 계정만 지우는 SQL을 `docs/deploy/user-migration.md`에 두고 실행 뒤 이관 수가 0인지 확인한다.

## 5. 전환과 종료

- [ ] 5.1 **[운영 영향]** 새 앱을 처음 배포한다. 2.7 수동 점검이 통과한 뒤에만 한다. 외부 접속 방식(열린 질문 7)이 Nginx면 사용자 확인 뒤 호스트에서 `APP_PORT=<포트> ./scripts/setup-nginx-https.sh <도메인> <이메일>`을, Windows에서 관리자로 `scripts/wsl-http-portproxy.ps1 -ListenAddress <호스트 IP>`를 실행한다. 그다음 사용자가 GitHub Actions에서 배포 워크플로를 수동 실행한다. 검증: 호스트에서 `docker compose ps`가 새 앱을 보여 주고, 공개 주소로 `curl -s <주소>/api/health`가 200이며, 브라우저에서 가입과 로그인이 정상이며(`ORIGIN` 오류 없음) 2.7의 Zotero 점검 세 항목이 공개 주소에서도 통과한다. 롤백: `docs/deploy/rollback.md`의 명령으로 새 컨테이너를 중지한다.
- [ ] 5.2 병행 운영을 점검한다. 새 앱 배포 뒤 기존 벨루·폴리오 컨테이너의 로그에서 오류 건수를 확인하고, 새 앱이 기존 6개 테이블에 쓰지 않았는지 `pg_stat_user_tables`의 쓰기 수로 확인한다. 검증: 점검 결과를 `docs/deploy/parallel-run.md`에 날짜와 함께 기록한다.
- [ ] 5.3 **[운영 영향]** 기존 벨루·폴리오 서비스를 중지한다. 열린 질문 1에서 정한 시점이 되면 사용자 확인 뒤 각 호스트 폴더에서 `docker compose stop`을 실행한다(삭제하지 않는다). 검증: 새 앱이 정상이고 기존 주소가 새 앱으로 안내된다. 롤백: `docker compose start`로 되살리고 health 응답을 확인한다.

## Workflow follow-up

- 각 **[운영 영향]** 단계는 `/opsx:apply` 중에도 실행 직전에 사용자 확인을 받는다. 확인 없이 다음 단계로 넘어가지 않는다.
- 구현이 끝나면 `/opsx:archive`로 이 change를 보관한다.

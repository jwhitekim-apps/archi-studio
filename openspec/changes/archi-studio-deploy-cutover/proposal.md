# Proposal

선행: 기능 change 전부(`archi-studio-zotero-connection`, `archi-studio-papers`, `archi-studio-paper-notes`, `archi-studio-translation`, `archi-studio-paper-analysis`, `archi-studio-briefing`, `briefing-store`, 화면 change 4개)가 끝난 뒤에 시작한다. 이 change만 운영 서버와 운영 DB에 영향을 준다.

## Why

지금까지 만든 Archi Studio는 로컬 개발 환경에서만 돈다. 11/24 발표에서 "흩어진 도구를 하나의 앱으로 통합했다"가 사실이 되려면, 새 앱이 벨루의 운영 DB를 쓰고, 기존 벨루 사용자가 새 로그인으로 들어오고, 기존 벨루·폴리오를 대신해 한 주소에서 떠 있어야 한다. 이 단계는 되돌리기 어려운 작업이 모인 곳이라, 실행 전에 각 단계의 확인 지점과 되돌리는 방법을 먼저 정해 둔다.

## What Changes

- 벨루 Supabase(운영 DB)의 무료 한도(용량, 연결 수)를 확인하고, 적용 전에 백업한다.
- 로컬에서 검증한 마이그레이션 6개를 운영 DB에 **새 테이블만 추가하는 방식**으로 한 트랜잭션에 적용한다. 기존 벨루 테이블은 건드리지 않는다. 적용·롤백 SQL은 로컬에서 "벨루 스키마가 이미 있는 DB"를 만들어 먼저 리허설한다.
- Supabase Auth의 운영 설정(최소 비밀번호 길이, 이메일 확인, 주소)을 로컬 설정과 맞춘다.
- 비서(morning-desk)와 폴리오 서버가 쓰는 DB 접속 값을 벨루 프로젝트 값으로 바꾼다.
- 기존 벨루 사용자(사용자명, bcrypt 비밀번호 해시, 승인 여부, 선택적 이메일)를 Supabase Auth로 옮긴다. 이관 스크립트는 기본이 시험 실행(dry-run)이다.
- 새 앱의 배포 산출물을 만든다. 벨루(`veloo.2joon.com`)의 배포 자산 4개를 가져와 고친다.
  - `scripts/setup-nginx-https.sh`(Nginx·certbot 설치, 앱 기동 대기, HTTP→인증서→HTTPS 설정)를 복사하고, 도메인·포트를 인자나 환경 변수로 받게 바꾼다.
  - `docker-compose.yaml`(env_file `.env`, `${PORT:-9000}`, `init`, `restart: unless-stopped`)과 `.github/workflows/deploy.yml`(SSH → `git fetch/reset` → `docker compose up -d --build`)을 기반으로 하되(운영 호스트가 리눅스이므로 `wsl.exe`와 `/mnt/c` 경로는 빼고 `~/workspace/archi-studio`에서 바로 실행), 자동 배포는 꺼 두고 수동 실행으로만 시작한다.
  - 새 `Dockerfile`(Node 20, `adapter-node` 빌드)을 만든다. 실행에는 학교 모델 인증서(`NODE_EXTRA_CA_CERTS`, 컨테이너에 마운트), `BODY_SIZE_LIMIT=4M`(1MB 메모 허용), `.env`(Supabase, Zotero, `LOCAL_LLM_*`, `S2_API_KEY`, `AI_PROVIDER=local`)가 모두 필요하다. Anthropic·Gemini는 쓰지 않고 학교 LLM만 쓴다.
- 배포 전에 실제 Zotero 계정으로 OAuth 연결, PDF 열기, 메모 저장을 손으로 확인한다.
- 새 앱을 처음 배포하고, 병행 운영 기간을 거쳐 기존 벨루·폴리오 서비스를 **중지**(삭제하지 않음)한다. **BREAKING**: 종료 후 기존 벨루·폴리오 주소는 새 앱으로 안내된다.

## Capabilities

### New Capabilities
없음. 운영 절차와 배포 산출물이라 스펙 수준의 동작 변경이 없다(`skip_specs`).

### Modified Capabilities
없음. 계약은 이미 메인 스펙 `auth`가 정한 것(이메일과 비밀번호 로그인, 가입 후 승인 대기)을 그대로 따른다.

## Impact

- **운영 DB**: 벨루 Supabase에 새 테이블 11개와 함수·트리거가 추가된다. 기존 6개 테이블은 변경하지 않는다.
- **운영 서버**: 새 앱 컨테이너 하나가 추가되고, 이관 뒤 벨루·폴리오 컨테이너가 멈춘다. GitHub Actions 배포 워크플로가 새로 생긴다. 호스트의 Nginx에 새 앱 설정과 certbot 인증서가 추가된다.
- **다른 저장소**: 비서(`morning-desk`)와 폴리오(`zotero-folio`)의 환경 변수 값만 바뀐다. 코드는 건드리지 않는다.
- **이 change가 하지 않는 것**: 벨루의 기존 이력(`paper_history` 등)과 폴리오 사용자의 Zotero 연결 이관, 승인 관리 화면. 이유는 design.md의 Non-Goals에 있다.
- **확인한 것**: 운영 호스트는 지금 이 리눅스 서버다. 저장소는 `~/workspace/`(벨루 `veloo.2joon.com` 9000, 폴리오 `zotero-folio` 3002, 새 앱 `archi-studio` 8000)에 있다. nginx가 80/443에서 동작하고 cloudflared는 꺼져 있어 외부 접속은 Nginx+certbot으로 정했다.
- **확인하지 못한 것**: 벨루 Supabase의 현재 사용량, 현재 도메인 네임서버 상태. 계획 단계에서는 운영에 접속하지 않았다.

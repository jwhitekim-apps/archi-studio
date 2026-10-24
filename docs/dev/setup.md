# 로컬 개발 환경

이 문서는 이 서버(집 서버)에서 Archi Studio를 개발하는 방법을 적는다.

## 포트 확인 (2026-10-18, `ss -ltn`)

이 서버에서 이미 쓰는 포트는 22, 53, 80, 443, 3002(폴리오 컨테이너), 5959, 8001, 8002, 9000이고 그 밖에 로컬 전용 임시 포트가 몇 개 있다.

| 용도 | 포트 | 결과 |
|---|---|---|
| 로컬 Supabase API | 54321 | 비어 있음 |
| 로컬 Supabase DB | 54322 | 비어 있음 |
| 로컬 Supabase Studio | 54323 | 비어 있음 |
| 로컬 Supabase Inbucket(메일) | 54324 | 비어 있음 |
| 로컬 Supabase 분석 | 54327 | 비어 있음 |
| 개발 서버(Vite) | 5173 | 비어 있음 |
| 미리보기(`vite preview`) | 4173 | 비어 있음 |

충돌하는 포트는 없다. 다른 서비스가 이 포트를 쓰게 되면 `supabase/config.toml`(로컬 DB)이나 `vite.config.ts`(개발 서버)에서 바꾼다.

## 로컬 DB (Docker 로컬 Supabase)

운영(벨루) DB에는 접속하지 않고 이 서버의 Docker에서만 개발한다. Supabase CLI는 전역 설치 없이 저장소의 devDependency를 쓴다. Docker가 실행 중이어야 한다.

```bash
npm install          # 처음 한 번 (Supabase CLI 포함)
npm run db:start     # 로컬 DB·인증 서비스 시작. 처음에는 이미지를 받느라 몇 분 걸린다
npm run db:reset     # 로컬 DB를 지우고 supabase/migrations 를 순서대로 다시 적용
npm run db:stop      # 종료 (데이터는 도커 볼륨에 남는다)
```

- 접속 주소: API `http://127.0.0.1:54321`, DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, Studio `http://127.0.0.1:54323`.
- 접속 키는 `db:start`가 터미널에 출력한다. 키를 파일에 적어 커밋하지 않는다(`.env.local`은 `.gitignore` 대상이다).
- 포트가 겹치면 `db:start`가 실패하고 어느 포트인지 알려준다. 기존 프로세스는 건드리지 않는다. 바꿀 때는 `supabase/config.toml`을 고친다.
- 마이그레이션은 `supabase/migrations/`에 있고 파일 이름순으로 적용된다. 생성 순서는 `docs/api/data-model.md` 7절을 따른다.
- 새 테이블은 모두 RLS를 켜고 정책은 두지 않는다. 서버가 service 키로 접속한다.

### 확인 방법

```bash
docker exec supabase_db_archi-studio psql -U postgres -d postgres -At \
  -c "select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1;"
```

`db:reset` 후 테이블 11개가 모두 `relrowsecurity = t`로 나와야 한다.

### 측정 (2026-10-18)

- 시작 시간: 이미지를 처음 받을 때 약 3분 30초, 이미지를 받은 뒤에는 짧다. 종료는 약 12초.
- 메모리(`docker stats`, 컨테이너 12개 합계): 약 1.7GiB. 가장 큰 것은 analytics 약 570MiB, 그다음 realtime 약 220MiB, studio 약 200MiB, storage 약 160MiB, db 약 140MiB다.
- 서버 전체 메모리 15GiB 중 시작 전 사용량은 약 3.4GiB였다.

## 화면 셸 검증 (스크린샷과 포커스 검사)

`scripts/shell-screens.mjs`는 Playwright의 Chromium으로 셸을 열어 1280px, 767px, 390px의 레이아웃,
라이트·다크 두 테마, 모바일 패널의 포커스 이동·복귀·배경 `inert`를 검사하고 스크린샷을 저장한다.
검사가 하나라도 실패하면 종료 코드가 1이다. DB는 필요 없다.

### 1. Node

Node는 `^20.19.0 || >=22.12.0`이어야 한다(Vite 7의 요구). 이 저장소는 Node 20을 기준으로 한다.

```bash
nvm install 20 && nvm use 20
node -v          # v20.19.0 이상이어야 한다
npm install
```

### 2. Chromium

```bash
npx playwright install chromium     # ~/.cache/ms-playwright 에 설치된다
```

### 3. 시스템 라이브러리 (없을 때만)

Chromium이 쓰는 라이브러리(`libatk`, `libgbm`, `libasound` 등)가 서버에 없고 `sudo`를 쓸 수 없으면,
패키지를 받아 임시 폴더에 풀고 `LD_LIBRARY_PATH`로만 쓴다. 시스템은 바뀌지 않는다.
패키지 이름은 Ubuntu 24.04 이후 기준이다.

먼저 빠진 라이브러리가 있는지 본다. 아무것도 안 나오면 이 단계는 건너뛴다.

```bash
ldd ~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell | grep "not found"
```

빠진 것이 있으면:

```bash
LIBS=$HOME/.cache/archi-chromelibs
mkdir -p "$LIBS/debs" "$LIBS/root"
(cd "$LIBS/debs" && apt-get download libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 \
  libatspi2.0-0t64 libgbm1 libxcomposite1 libxdamage1 libxfixes3 libxi6 libxrandr2 \
  libxrender1 libxres1)
for f in "$LIBS"/debs/*.deb; do dpkg-deb -x "$f" "$LIBS/root"; done
export LD_LIBRARY_PATH="$LIBS/root/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
ldd ~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell | grep -c "not found"   # 0 이어야 한다
```

`LD_LIBRARY_PATH`는 터미널을 새로 열 때마다 다시 지정한다.
Chromium을 `LD_LIBRARY_PATH` 없이 시작하면 `error while loading shared libraries: libatk-1.0.so.0` 처럼 종료한다.

### 4. 글꼴 설정 (없을 때만)

서버에 `/etc/fonts`가 없으면 Chromium이 글자를 그리다 `SkFontMgr_FontConfigInterface … Not implemented`로 바로 종료한다
(Playwright 오류는 `Target page, context or browser has been closed`). 한글 글꼴 패키지를 같은 임시 폴더에 풀고 설정 파일로만 알려 준다.

```bash
LIBS=$HOME/.cache/archi-chromelibs
mkdir -p "$LIBS/fontdebs" "$LIBS/fontcache"
(cd "$LIBS/fontdebs" && apt-get download fonts-nanum)
for f in "$LIBS"/fontdebs/*.deb; do dpkg-deb -x "$f" "$LIBS/root"; done
printf '<?xml version="1.0"?>\n<fontconfig>\n  <dir>%s</dir>\n  <cachedir>%s</cachedir>\n</fontconfig>\n' \
  "$LIBS/root/usr/share/fonts" "$LIBS/fontcache" > "$LIBS/fonts.conf"
export FONTCONFIG_FILE="$LIBS/fonts.conf"
```

`FONTCONFIG_FILE`도 `LD_LIBRARY_PATH`처럼 터미널마다 다시 지정한다. 이렇게 하면 스크린샷에 한글이 보인다.

### 5. 실행

셸이 있으면서 로그인 없이 열리는 화면은 개발 서버의 `/dev/components`뿐이다(빌드한 서버에서는 404).
다른 서비스가 쓰는 포트(위 포트 표)와 겹치지 않게 고른다.

```bash
npm run dev -- --port 5273 --host 127.0.0.1 &
curl -s -o /dev/null http://127.0.0.1:5273/dev/components; sleep 5      # 첫 접속에 Vite가 의존성을 다시 최적화하며 페이지를 새로고침하므로 먼저 한 번 열어 둔다
node scripts/shell-screens.mjs http://127.0.0.1:5273/dev/components "$(mktemp -d)"
kill %1
```

- 출력의 `OK`/`FAIL` 줄이 검사 결과다. 스크린샷은 두 번째 인자로 준 폴더에 `light|dark-1280.png`, `-390.png`, `-390-menu.png`, `-390-panel.png`로 저장된다.
- 끝나면 띄운 서버를 반드시 종료한다(`kill %1`).

## 화면 검사 (scripts/ui-screens.mjs)

공통 부품, 로그인·가입, 서재, 설정 화면을 Playwright로 검사하고 스크린샷을 남긴다. 위 "화면 셸 검증"의 1~4단계(Node, Chromium,
라이브러리, 글꼴)를 먼저 마친다. 검사가 하나라도 실패하면 종료 코드가 1이다.

| 검사 묶음 | 내용 | 로컬 DB |
|---|---|---|
| `components` | `/dev/components`의 부품: 진행 중 버튼 중복 실행, 포커스 윤곽, 대화상자, 스트리밍, 글자 대비 | 필요 없음 |
| `signup` | 가입·로그인 화면의 입력 검사와 오류 안내(가짜 응답) | 필요 없음 |
| `auth` | 가입 → 승인 → 로그인 → 로그아웃, 오류 문구, 시도 제한(실제 인증 API) | 필요 |
| `library` | 서재 목록·검색·컬렉션·동기화·웹페이지 추가·삭제(가짜 응답, 로그인은 실제) | 필요 |
| `settings` | 설정 화면의 Zotero 연결 상태와 해제, 거부 안내(가짜 응답) | 필요 |
| `layout` | 10개 화면(번역·분석 결과 포함) × 라이트·다크 × 1280·767·390px의 가로 넘침과 세 영역 | 필요 |
| `library-real` | SQL로 넣은 논문 55건으로 실제 서버의 목록·검색·컬렉션·더 보기 | 필요 |
| `translate` | 번역 화면: 조각 표시, 중지, 복사, 오류 상태, 논문 연결, 이력, 자동 번역, Tab 순서(브라우저 안 가짜 스트림) | 필요 |
| `analyze` | 분석 화면: 논문 선택기, 저장된 분석 우선, 분석 실행, 오류 상태, 결과 표시, 설정 패널 전환(가짜 응답) | 필요 |

```bash
export LD_LIBRARY_PATH="$HOME/.cache/archi-chromelibs/root/usr/lib/x86_64-linux-gnu"
export FONTCONFIG_FILE="$HOME/.cache/archi-chromelibs/fonts.conf"
npm run db:start
npm run dev -- --port 5273 --host 127.0.0.1 &
curl -s -o /dev/null http://127.0.0.1:5273/dev/components; sleep 5
node scripts/ui-screens.mjs http://127.0.0.1:5273 "$(mktemp -d)"                     # 모든 묶음
node scripts/ui-screens.mjs http://127.0.0.1:5273 "$(mktemp -d)" components,signup   # DB 없이 도는 묶음만
kill %1
npm run db:stop
```

- 검사는 `ui-check-…@example.com` 계정을 만들어 쓰고 끝나면 지운다. 로그인 실패 기록(`archi_login_attempts`)도 127.0.0.1 것만 지운다.
- `auth` 묶음은 같은 IP의 로그인 시도 제한(15분에 5번)을 일부러 넘긴다. 검사가 중간에 멈추면 다음 실행 전에 `delete from public.archi_login_attempts`를 직접 실행한다.
- `translate` 묶음은 실제 AI를 부르지 않는다. 브라우저의 `fetch`를 `/api/translate`에 한해 감싸 시간차 조각, 한글 바이트 분할, 중간 끊김, 상태 코드별 오류를 흉내 낸다(`installFakeTranslate`).
- 스크린샷은 두 번째 인자 폴더에 `light|dark-<화면>-<폭>.png`, `library-list.png`, `settings-confirm.png` 등으로 저장된다.

## 인증 테스트 실행

인증 통합 테스트(`npm run test:auth`)는 로컬 Supabase가 떠 있고 접속 정보가 `.env`에 있어야 돌아간다. 일반 `npm test`는 로컬 DB 없이 돈다.

필요한 변수 이름은 4개다. 값은 로컬 Supabase가 정하며 문서와 저장소에 적지 않는다. `.env`는 `.gitignore` 대상이다.

| `.env` 변수 | 로컬 Supabase 출력의 이름 | 용도 |
|---|---|---|
| `SUPABASE_URL` | `API_URL` | 로컬 API 주소 |
| `SUPABASE_ANON_KEY` | `ANON_KEY` | 사용자 로그인과 토큰 확인 |
| `SUPABASE_SERVICE_ROLE_KEY` | `SERVICE_ROLE_KEY` | 계정 생성, 승인 행 쓰기 |
| `SUPABASE_JWT_SECRET` | `JWT_SECRET` | 테스트 전용. 만료된 토큰을 만들 때만 쓴다 |

```bash
npm install
npm run db:start     # 로컬 DB·인증 서비스 시작 (처음에는 몇 분)
npm run db:reset     # 마이그레이션을 처음부터 적용

# 키를 화면에 찍지 않고 .env 로 바로 쓴다 (기존 .env 는 덮어쓴다)
npx supabase status -o env | sed -n \
  -e 's/^API_URL=/SUPABASE_URL=/p' \
  -e 's/^ANON_KEY=/SUPABASE_ANON_KEY=/p' \
  -e 's/^SERVICE_ROLE_KEY=/SUPABASE_SERVICE_ROLE_KEY=/p' \
  -e 's/^JWT_SECRET=/SUPABASE_JWT_SECRET=/p' > .env

npm run test:auth    # 인증 통합 테스트
npm run db:stop      # 끝나면 종료
```

- 시나리오와 테스트의 대응은 `docs/dev/auth-test-map.md`에 있다.
- 테스트는 로컬 DB에 계정을 만들고 지운다. 운영(벨루) DB에는 접속하지 않는다.
- 전체 확인: `npm run check`, `npm test`, `npm run build`, `npm run check:tokens`.

## Zotero 연결 설정

Zotero 연결 코드(`src/lib/server/zotero/`)는 서버 환경 변수 6개를 읽는다. 이름만 `.env.example`에 있고 값은 `.env`에만 적는다.

| 변수 | 용도 |
|---|---|
| `ZOTERO_CLIENT_KEY`, `ZOTERO_CLIENT_SECRET` | zotero.org에 등록한 앱 키. 등록은 배포 단계(`archi-studio-deploy-cutover`)에서 한다 |
| `APP_BASE_URL` | 새 앱의 공개 주소. 콜백 주소는 `APP_BASE_URL/api/zotero/callback`이다 |
| `ZOTERO_KEY_ENCRYPTION_SECRET` | 사용자 Zotero 키를 저장 전에 암호화하는 비밀값. 32바이트를 base64로 쓴 값 |
| `ZOTERO_API_BASE_URL`, `ZOTERO_OAUTH_BASE_URL` | 비워 두면 실제 Zotero 주소를 쓴다. 시험에서만 가짜 서버 주소로 바꾼다 |

```bash
# 암호화 비밀값 만들기. 출력된 값을 .env의 ZOTERO_KEY_ENCRYPTION_SECRET= 뒤에 붙여 넣는다 (저장소에 적지 않는다)
openssl rand -base64 32
```

- 이 비밀값을 잃으면 저장된 Zotero 키를 풀 수 없어 모든 사용자가 다시 연결해야 한다(논문 목록은 남는다). 서버 `.env`와 별도 안전한 곳에 백업한다. 교체 절차는 아직 정하지 않았다(암호문 접두사 `v1`이 교체 시 구분용이다).
- 앱 키가 없으면 `connect`와 `callback`은 설정 오류로 500이 된다. 동기화·상태·해제는 앱 키 없이 동작한다.

### 가짜 Zotero 서버로 시험하기

실제 Zotero에는 접속하지 않는다. `src/lib/server/zotero/fake-zotero.ts`가 Node `http`로 OAuth와 Web API 일부(`items/top`, 첨부 변경, `deleted`, `children`, `collections`, 페이지 나누기)를 흉내 낸다.

- `npm test`: 가짜 서버만으로 도는 단위 시험(암호화, 서명, 클라이언트, 변환 규칙).
- `npm run test:auth`: 로컬 Supabase와 가짜 서버로 연결 → 동기화 → 해제 전체를 시험한다. Zotero 변수는 시험 코드가 직접 채우므로 `.env`에는 위 `SUPABASE_*` 4개만 있으면 된다.
- 실제 Zotero 앱 키 등록과 실제 계정 연결 시험은 배포 단계에서 한다.

## 논문 분석 시험 실행

분석 기능(`src/lib/server/analysis/`)은 세 갈래로 시험한다. 외부 서비스(AI, Semantic Scholar, Zotero)는 모두 가짜를 쓴다.

```bash
npm test                 # 단위: PDF 읽기, 저널 점수(실제 SCImago CSV 포함), Semantic Scholar 클라이언트, 연결 규칙, 요약
npm run db:start
npm run test:analysis    # 통합: 분석 흐름과 /api/papers/{id}/analysis (실제 로컬 DB)
```

- 시험용 PDF는 `node scripts/make-analysis-fixture.mjs`가 `src/lib/server/analysis/fixtures/`에 만든다(외부 라이브러리 없이 손으로 쓴 PDF, 여러 번 실행해도 같은 바이트).
- PDF 읽기 라이브러리 `pdfjs-dist`는 `5.6.205`로 고정했다. 5.7 이후는 Node 22.13 이상이 필요하다.
- 저널 점수 데이터는 `data/analysis/`(`scimagojr 2025.csv` 약 11MB, `venue_aliases.json`)에 있고 서버가 실행 위치 기준으로 읽는다. **배포 이미지에 `data/analysis/`가 함께 들어가야 한다**(서버 번들에는 들어가지 않는다).
- `S2_API_KEY`는 선택이다. 없으면 Semantic Scholar 요청마다 1초씩 쉬어 분석 한 번에 몇 초가 더 걸린다.
- 벨루 분석 결과 가져오기(예비안)는 `docs/dev/analysis-fallback.md`를 본다.

## 메모 시험 실행

메모 API(`GET/PUT /api/papers/{id}/memo`, 코드는 `src/lib/server/memo/`)는 메모를 Zotero 자식 노트(태그 `zotero-insight:memo`)로 읽고 쓴다. 시험은 실제 Zotero에 접속하지 않는다.

```bash
npm test                 # 단위: 마크다운↔HTML 왕복, 폴리오 노트 읽기, 메모리 가짜 노트(412 흉내), 저장·삭제·재시도
npm run db:start
npm run test:auth        # 통합: memo.integration.ts (가짜 Zotero 서버 + 로컬 DB, has_memo 갱신과 1 MB 제한 포함)
```

- **배포 설정**: Node 어댑터의 본문 한도 기본값(512 KB)은 1 MB 메모보다 작다. 서버를 `BODY_SIZE_LIMIT=4M`으로 띄운다(메모 요청 본문 상한 4 MiB 이상이어야 한다). 메모 저장(`PUT /api/papers/{id}/memo`) 밖의 `/api` 경로는 가드(`api-guard.ts`의 `limitBody`)가 그대로 512 KB로 막는다. 한도를 올리지 않으면 512 KB를 넘는 메모가 413 `payload_too_large`로 거부된다.
- 손으로 확인(빌드 산출물): `npm run build` 뒤 `PORT=<빈 포트> ORIGIN=http://localhost:<포트> BODY_SIZE_LIMIT=4M node --env-file=.env build`로 띄우고, 로그인 쿠키로 1,048,577바이트 메모를 `curl -X PUT`하면 JSON 413, 600 KB 본문의 `POST /api/auth/login`은 한도를 올리기 전과 같은 400 `invalid_request`다(2026-10-24 확인).
- **실제 Zotero 계정 확인(사용자가 직접)**: 실제 Zotero를 연결한 계정으로 논문 허브에서 메모를 저장한 뒤 Zotero 앱(또는 zotero.org 웹 서재)에서 그 논문 아래에 태그 `zotero-insight:memo`가 붙은 자식 노트가 하나만 생겼는지, 같은 메모를 여러 번 저장해도 하나인지, 빈 메모를 저장하면 노트가 휴지통으로 가는지 본다. 폴리오가 만든 기존 메모 노트가 있는 논문은 그 본문이 그대로 읽히는지도 본다.

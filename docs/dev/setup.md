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

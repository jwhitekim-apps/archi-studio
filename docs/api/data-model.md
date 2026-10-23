# Archi Studio 데이터 모델 (마이그레이션 입력)

change `archi-studio-api-spec`의 tasks 3.1, 3.2 산출물이다. 이 문서는 마이그레이션을 쓰기 위한 입력이고 SQL 파일이 아니다. 기준 DB는 벨루 Supabase 프로젝트이고, 개발은 Docker 로컬 Supabase에서 한다.

근거는 `openspec/changes/archi-studio-api-spec/`의 스펙 7개와 `design.md`다. 벨루 스키마는 `veloo.2joon.com/server/schema.sql`, 폴리오 스키마는 `zotero-folio/server/supabase/schema.sql`을 읽기만 했다.

## 1. 원칙

1. **기존 벨루 테이블은 수정하지 않는다.** 대상은 `users`, `sessions`, `paper_history`, `translation_history`, `arch_history`, `contextor_history`와 이 테이블들의 인덱스, `users.email` 열이다. `alter`, `drop`, 행 삽입·수정·삭제를 모두 하지 않는다.
2. **추가만 한다.** 새 테이블, 인덱스, 함수만 만든다. 새 테이블은 기존 벨루 테이블을 외래 키로 참조하지 않는다. 그래야 롤백이 "추가한 것만 지우기"로 끝난다.
3. **사용자 키는 Supabase Auth(`auth.users.id`) 하나다.** 기존 벨루 `users`와 계정을 합치는 일은 별도 change다(design.md의 Non-Goals).
4. **새 테이블은 `create table`을 `if not exists` 없이 쓴다.** 폴리오 스키마 주석에 있듯이 `if not exists`는 이름이 겹쳐도 조용히 넘어간다. 겹치면 실패해야 알 수 있다.
5. **RLS는 켜고 정책은 두지 않는다.** 폴리오와 벨루의 방식을 따른다. 서버가 service 키로 접속해 `user_id`로 직접 거른다. 다른 사용자의 자원은 404로 답한다(auth 스펙).

## 2. 테이블 개요

| 테이블 | 용도 | 출처 |
|---|---|---|
| `archi_profiles` | 승인 여부 | auth 스펙 (신규) |
| `archi_login_attempts` | 로그인 실패 기록 | auth 스펙 (신규) |
| `folio_users` | Zotero 연결 정보 | 폴리오 (변형) |
| `folio_papers` | Zotero 메타데이터 캐시, 비서 호환용 | 폴리오 (그대로) |
| `folio_sync_state` | 사용자별 동기화 상태 | 폴리오 (그대로) |
| `archi_collections` | 컬렉션 이름과 계층 | papers 스펙 (신규) |
| `papers` | 앱의 중심 자원 | papers 스펙 (신규) |
| `archi_translations` | 번역 이력 | translation 스펙 (신규) |
| `archi_analyses` | 논문 분석 결과 | paper-analysis 스펙 (신규) |
| `archi_briefings` | 브리핑 기록 | briefing 스펙 (신규) |
| `archi_briefing_papers` | 브리핑이 언급한 논문 | briefing 스펙 (신규) |

## 3. 테이블 정의

표기: PK 기본 키, FK 외래 키, NN not null.

### 3.1 `archi_profiles`
승인 여부를 둔다. 가입 시 서버가 행을 만든다(`auth.users`에 트리거를 걸지 않는다).

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `user_id` | uuid | PK, FK `auth.users(id)` on delete cascade | |
| `approved` | boolean | NN, default false | 관리자가 DB에서 직접 true로 바꾼다 |
| `created_at` | timestamptz | NN, default now() | |

### 3.2 `archi_login_attempts`
같은 IP에서 15분 안에 5번 실패하면 막는다. 서버 재시작 후에도 유지되어야 하므로 DB에 둔다. 실패만 기록한다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | bigint | PK, identity | |
| `ip` | text | NN | |
| `attempted_at` | timestamptz | NN, default now() | |

인덱스: `(ip, attempted_at desc)`

### 3.3 `folio_users`
폴리오 스키마에서 바꾼 점이 둘 있다. 이유는 아래에 적었다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | uuid | PK, FK `auth.users(id)` on delete cascade | `auth.users.id`와 같은 값. 원본은 따로 만든 uuid였다 |
| `zotero_user_id` | text | unique (null 허용) | 원본은 NN |
| `zotero_username` | text | NN, default '' | |
| `zotero_api_key` | text | null 허용 | 암호화한 값을 저장한다. null이면 연결 안 됨. 원본은 NN |
| `created_at` | timestamptz | NN, default now() | |
| `updated_at` | timestamptz | NN, default now() | 트리거 `folio_touch_updated_at`로 갱신 |

- `id`를 `auth.users.id`와 같게 한 이유: 모든 `user_id`가 한 종류가 된다.
- `zotero_api_key`를 nullable로 한 이유: `DELETE /api/zotero/connection`은 자격 정보를 지우되 논문 목록은 유지해야 한다(zotero-connection 스펙). 행을 지우면 `folio_papers`가 cascade로 사라지므로, 키만 비운다.
- `zoteroConnected`는 `zotero_api_key is not null`로 계산한다.

### 3.4 `folio_papers` (폴리오 그대로)
Zotero 메타데이터 캐시다. 비서(morning-desk)가 읽으므로 구조를 바꾸지 않는다.

| 컬럼 | 타입 | 제약 |
|---|---|---|
| `id` | bigserial | PK |
| `user_id` | uuid | NN, FK `folio_users(id)` on delete cascade |
| `item_key` | text | NN |
| `item_version` | bigint | NN |
| `title` | text | |
| `authors` | jsonb | NN, default '[]' |
| `year` | text | |
| `attachment_key` | text | |
| `attachment_type` | text | 'pdf', 'html', null |
| `collections` | jsonb | NN, default '[]' |
| `synced_at` | timestamptz | NN, default now() |

제약: unique `(user_id, item_key)`. 인덱스 3개는 폴리오 스키마와 같다.

### 3.5 `folio_sync_state` (폴리오 그대로)
PK `(user_id, key)`, `value text`, `user_id`는 FK `folio_users(id)` on delete cascade.

쓰는 키는 둘이다. `lastVersion`은 폴리오가 이미 쓰고, `lastSyncedAt`은 연결 상태 응답의 `lastSyncedAt`을 위해 추가한다(키 값만 늘고 구조는 안 바뀐다).

### 3.6 `archi_collections`
컬렉션 응답의 `name`, `parentKey`를 담을 곳이 없어서 추가했다(§5 참고).

| 컬럼 | 타입 | 제약 |
|---|---|---|
| `user_id` | uuid | NN, FK `folio_users(id)` on delete cascade |
| `key` | text | NN |
| `name` | text | NN |
| `parent_key` | text | |

PK `(user_id, key)`. `paperCount`는 저장하지 않고 `papers.collections`에서 센다.

### 3.7 `papers` (중심 자원)

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | 모든 `/api/papers/{id}`의 `id` |
| `user_id` | uuid | NN, FK `auth.users(id)` on delete cascade | |
| `item_key` | text | | Zotero 키 |
| `item_version` | bigint | | Zotero 항목 버전 |
| `s2_paper_id` | text | | Semantic Scholar 키 |
| `title` | text | | null 허용. 응답(`title`)에서는 null이면 빈 문자열 `""`로 바꾼다 |
| `authors` | jsonb | NN, default '[]' | 문자열 배열 |
| `year` | text | | 폴리오와 같은 타입(Zotero의 날짜 문자열 그대로). 응답(`year`)은 처음 나오는 네 자리 숫자를 정수로 바꾸고, 없거나 비어 있으면 null이다 |
| `collections` | jsonb | NN, default '[]' | 컬렉션 키 배열 |
| `attachment_key` | text | | 원문 파일을 Zotero에서 가져올 때 쓴다 |
| `attachment_type` | text | check in ('pdf','html') | null이면 첨부 없음 |
| `has_memo` | boolean | NN, default false | 목록의 `hasMemo`용(§5 참고) |
| `synced_at` | timestamptz | NN, default now() | 목록 정렬 기준 |
| `created_at` | timestamptz | NN, default now() | |

제약:
- unique `(user_id, item_key)`. null은 여러 개 허용된다. 스펙: "한 사용자 안에서 `itemKey`는 유일하다".
- check `item_key is not null or s2_paper_id is not null`. 외부 키가 하나도 없는 논문은 없다.
- check `(attachment_key is null) = (attachment_type is null)`.
- `s2_paper_id`는 unique로 하지 않는다. 같은 논문이 Zotero에 두 번 있을 수 있다.

인덱스: `(user_id, synced_at desc, id)`(목록과 커서), `(user_id, title)`, `collections` GIN `jsonb_path_ops`, `(user_id, s2_paper_id) where s2_paper_id is not null`.

`folio_papers`와는 외래 키 없이 `(user_id, item_key)`로만 대응한다. 동기화가 두 테이블을 같은 트랜잭션에서 쓴다.

### 3.8 `archi_translations`
번역 이력이다. 기존 `translation_history`는 `user_id`가 벨루 `users`를 가리켜서, Supabase Auth 사용자는 거기에 쓸 수 없다. 그래서 새 테이블을 쓴다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | API의 `TranslationRecord.id`(uuid)와 같은 값 |
| `user_id` | uuid | NN, FK `auth.users(id)` on delete cascade | |
| `paper_id` | uuid | FK `papers(id)` on delete cascade | `POST /api/translate`의 선택 값 `paperId`. 없으면 null. 논문을 지우면 연결된 이력도 함께 지워진다. 요청 때 본인 논문인지 확인하고 아니면 404 |
| `source_text` | text | NN | 요청의 `text` |
| `translated_text` | text | NN | |
| `type` | text | NN, check in ('word','sentence') | 구분 규칙은 task 2.2에서 정한다 |
| `created_at` | timestamptz | NN, default now() | |

인덱스: `(user_id, created_at desc)`, `(user_id, md5(source_text))`(캐시 조회), `(paper_id) where paper_id is not null`.

`source_text`는 최대 5000자까지 저장해야 한다(translation 스펙). btree 인덱스에는 행 크기 한계가 있어 원문 전체를 인덱스에 넣을 수 없으므로 `md5(source_text)`에 인덱스를 걸고, 캐시 조회는 해시로 후보를 좁힌 뒤 `source_text` 일치도 함께 확인한다.

### 3.9 `archi_analyses`

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `user_id` | uuid | NN, FK `auth.users(id)` on delete cascade | |
| `paper_id` | uuid | NN, FK `papers(id)` on delete cascade | 논문을 지우면 분석도 함께 지워진다 |
| `result` | jsonb | NN | 요약과 저널 점수. 필드는 구현 전에 정한다(스펙이 요약 수준) |
| `created_at` | timestamptz | NN, default now() | |

제약: unique `(user_id, paper_id)`. 스펙: "같은 논문의 분석이 이미 있으면 새로 만들지 않는다".

분석이 Semantic Scholar 논문과 연결되면 `papers.s2_paper_id`를 채운다(papers 스펙의 "두 키를 모두 가진 논문").

### 3.10 `archi_briefings`, `archi_briefing_papers`
비서가 service 키로 쓰고, 앱은 읽기만 한다.

`archi_briefings`:

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `user_id` | uuid | NN, FK `auth.users(id)` on delete cascade | |
| `date` | date | NN | |
| `summary` | text | NN | 목록 항목 |
| `body` | text | NN | 상세 본문 |
| `created_at` | timestamptz | NN, default now() | |

제약: unique `(user_id, date)`("하루 한 번"). 인덱스: `(user_id, date desc)`.

`archi_briefing_papers`: PK `(briefing_id, paper_id)`, `briefing_id`는 FK `archi_briefings(id)` on delete cascade, `paper_id`는 FK `papers(id)` on delete cascade. 상세 응답의 `paperIds`가 된다.

### 3.11 함수
`folio_touch_updated_at()`(폴리오 그대로)와 `folio_users`의 트리거 하나다.

서버(`service_role`)만 호출하는 함수가 있다. `anon`, `authenticated`는 실행할 수 없다.

| 함수 | 용도 | 만든 곳 |
|---|---|---|
| `archi_reserve_login_attempt`, `archi_release_login_attempt` | 로그인 시도 제한 | 인증 |
| `archi_apply_zotero_sync` | 동기화 결과를 `folio_papers`, `papers`, `archi_collections`, 동기화 상태에 한 트랜잭션으로 반영 | Zotero 연결 |
| `archi_list_papers(user, query, collection, limit, cursor_synced_at, cursor_id)` | 논문 목록·검색. `(synced_at, id)` 내림차순 커서 방식. 검색어의 `\`, `%`, `_`는 글자 그대로 찾고, 제목과 저자 어느 쪽이든 일치하면 돌려준다 | 논문 |
| `archi_collection_counts(user)` | 컬렉션과 그 컬렉션 키를 가진 논문 수(`paper_count`) | 논문 |
| `archi_find_translation(user, text, paper_id)` | 저장된 번역 찾기. `md5(source_text)` 해시 색인으로 후보를 좁히고 원문 일치로 다시 대조한다. 같은 원문이 없으면 0행, 있으면 가장 최근 번역문(`translated_text`)과 그 논문에 같은 원문 행이 이미 있는지(`paper_linked`)를 한 줄로 돌려준다 | 번역 |

## 4. 스펙 응답 필드 대조

7개 스펙의 응답 필드를 모두 올렸다.

| 스펙 | 응답 필드 | 대응 |
|---|---|---|
| auth | `id`, `email` | `auth.users.id`, `auth.users.email` |
| auth | `zoteroConnected` | `folio_users.zotero_api_key is not null` |
| auth | 승인 상태 (`pending_approval`) | `archi_profiles.approved` |
| auth | 로그인 제한 (`too_many_attempts`) | `archi_login_attempts` |
| zotero | `connected`, `zoteroUsername` | 위와 같음, `folio_users.zotero_username` |
| zotero | `lastSyncedAt` | `folio_sync_state` 키 `lastSyncedAt` |
| zotero | `added`, `updated`, `removed`, `syncedAt` | 저장하지 않음. 동기화 중 계산, `syncedAt`은 `lastSyncedAt`에 저장 |
| papers | `id`, `title`, `authors`, `year`, `collections` | `papers`의 같은 이름 컬럼 |
| papers | `hasPdf` | `attachment_type = 'pdf'` |
| papers | `hasMemo` | `papers.has_memo` |
| papers | `nextCursor` | `(synced_at, id)`에서 계산 |
| papers | `itemKey`, `s2PaperId` | `item_key`, `s2_paper_id` |
| papers | `attachment.type` | `attachment_type` |
| papers | 연결된 번역·분석 개수 | `archi_translations.paper_id`, `archi_analyses.paper_id`를 센다 |
| papers | 컬렉션 `key`, `name`, `parentKey` | `archi_collections` |
| papers | 컬렉션 `paperCount` | `papers.collections`에서 센다 |
| papers | 원문 파일 | 저장하지 않음. `attachment_key`로 Zotero에서 가져온다 |
| paper-notes | `markdown`, `updatedAt` | 저장하지 않음. Zotero 노트를 실시간으로 읽는다(`zotero-insight:memo` 태그) |
| translation | 번역문 스트림, 이력 항목 | `archi_translations`. 이력 항목은 `{id, sourceText, translatedText, type, paperId, createdAt}`(`openapi.yaml`의 `TranslationRecord`) |
| paper-analysis | 분석 결과 | `archi_analyses.result` |
| briefing | `id`, `date`, `summary` | `archi_briefings` |
| briefing | 본문, `paperIds` | `archi_briefings.body`, `archi_briefing_papers` |

## 5. 스펙에 저장 방식이 없어서 이 문서가 정한 것 (확정 필요)

1. **`papers`와 `folio_papers`가 같은 메타데이터를 두 번 가진다.** 비서가 `folio_papers`를 읽으므로 남겼다. 비서를 `papers`로 옮기면 `folio_papers`를 없앨 수 있다.
2. **`papers.has_memo`** 는 목록마다 Zotero를 부르지 않으려고 둔 컬럼이다. 동기화와 메모 저장 때 갱신한다.
3. **`archi_collections`** 는 컬렉션 이름과 부모를 저장하는 테이블이다. Zotero에서 실시간으로 읽으면 이 테이블이 필요 없다.
4. **번역 캐시 적중 시 행을 새로 만든다(확정)**: 같은 `text`를 다른 `paperId`로 요청하면 논문별 이력에 남기려고 행을 하나 더 만든다. 그래서 `(user_id, source_text)`를 unique로 하지 않았다.
5. **`archi_login_attempts`의 오래된 행을 언제 지울지** 정하지 않았다.
6. **같은 Zotero 계정을 다른 사용자가 연결하면** `zotero_user_id` unique 위반이 난다. 스펙에 이 경우의 오류 코드가 없다.

## 6. 이름 충돌 대조

기존 벨루 `server/schema.sql`의 테이블은 `users`, `sessions`, `paper_history`, `translation_history`, `arch_history`, `contextor_history` 6개다. 새 테이블 11개(`archi_profiles`, `archi_login_attempts`, `folio_users`, `folio_papers`, `folio_sync_state`, `archi_collections`, `papers`, `archi_translations`, `archi_analyses`, `archi_briefings`, `archi_briefing_papers`)와 겹치는 이름은 없다.

- 인덱스: 기존은 `sessions_*`, `paper_history_*`, `translation_history_*`, `arch_history_*`, `contextor_history_*` 접두사다. 새 인덱스는 새 테이블 이름을 접두사로 쓰므로 겹치지 않는다.
- 함수: 벨루 스키마에는 함수가 없다. `folio_touch_updated_at`은 새 이름이다.
- **확인하지 못한 것**: 이 대조는 스키마 파일 기준이다. 벨루 Supabase에 실제로 있는 테이블(스키마 파일에 없는 것 포함)은 조회하지 못했다. 특히 `papers`는 흔한 이름이다. 적용 전에 운영 DB의 `public` 테이블 목록을 조회해 다시 대조한다. 겹치면 `papers`를 `archi_papers`로 바꾼다.

## 7. 적용 순서

1. 로컬 Supabase(Docker)에서 마이그레이션을 쓰고 검증한다. 같은 파일을 운영에 그대로 쓴다.
2. 벨루 프로젝트의 사용량과 요금제 한도를 확인한다(design.md의 위험).
3. 벨루 DB를 백업한다. `pg_dump`로 직접 받는 것을 기본으로 한다. 무료 요금제의 자동 백업 여부는 확인하지 못했다.
4. 운영 DB의 `public` 테이블 목록을 조회해 §6을 다시 대조한다.
5. 기존 6개 테이블의 행 수를 기록한다.
6. 마이그레이션을 한 트랜잭션으로 적용한다. 생성 순서는 `archi_profiles`, `archi_login_attempts`, `folio_users`, `folio_sync_state`, `folio_papers`, `archi_collections`, `papers`, `archi_translations`, `archi_analyses`, `archi_briefings`, `archi_briefing_papers`, 함수와 트리거다.
7. 기존 6개 테이블의 행 수가 5번과 같은지 확인한다.
8. 비서와 폴리오 서버의 `SUPABASE_URL`과 service 키를 교체하고, Zotero 재동기화로 논문 목록을 채운다(이 change 밖).

**롤백**은 추가한 테이블을 의존 순서의 역순으로 지우는 것이다. 새 테이블이 기존 벨루 테이블을 참조하지 않으므로 기존 데이터에는 영향이 없다. 백업은 이 롤백으로 안 될 때를 위한 것이다.

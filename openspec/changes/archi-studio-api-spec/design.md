# Design

## Context

- 벨루: FastAPI, 자체 users/sessions, 논문 키는 Semantic Scholar `paper_id`. 폴리오: Express, Zotero OAuth1, 논문 키는 Zotero `item_key`. 두 앱의 Supabase 프로젝트는 서로 다르다.
- 폴리오의 메모, 하이라이트, 필기는 DB가 아니라 Zotero API에서 실시간으로 읽는다. 논문 목록(`folio_papers`)은 재동기화가 가능한 캐시다.
- 기준 DB는 벨루 Supabase 프로젝트다. 무료 요금제라 별도 클라우드 개발 프로젝트를 만들 수 없다.
- 동기: proposal.md 참조.

## Goals / Non-Goals

**Goals:**
- 화면, 서버, DB를 병렬로 만들 수 있는 API 계약을 확정한다.
- 논문(`papers`)을 중심 자원으로 삼아 번역, 분석, 메모, 브리핑이 모두 논문에 연결되게 한다.

**Non-Goals:**
- 하이라이트와 필기(ink) API. 폴리오 기능이지만 데모 흐름 밖이라 이번 명세에서 뺀다.
- 승인 관리 화면, Contextor, Model Review, 폴리오 에이전트.
- 기존 벨루 사용자 계정의 Supabase Auth 이관 절차(별도 change에서 다룬다).

## Decisions

**1. 개발은 Docker 로컬 Supabase, 운영은 벨루 프로젝트.**
같은 마이그레이션 파일을 로컬에서 먼저 돌리고, 완성되면 벨루 프로젝트에 그대로 적용한다. 기존 벨루 테이블은 수정하지 않고 새 테이블(`folio_*`, `papers` 등)만 추가한다. `papers`가 기존 벨루 테이블 이름과 겹치면 `archi_papers`로 바꾼다(`docs/api/data-model.md`). 적용 전에 백업을 받는다. 대안은 벨루 운영 DB에서 바로 개발하는 것이었으나 실사용자 데이터를 건드릴 위험이 커서 버렸다.

**2. 경로는 `/api/{자원}` 평평한 구조, 논문은 내부 UUID로 가리킨다.**
`itemKey`와 `s2PaperId`는 응답 필드로만 노출한다. 외부 키를 경로에 쓰면 Zotero 사용자 간 충돌이 있고(`item_key`는 라이브러리 안에서만 유일), 외부 키가 없는 논문(Semantic Scholar만 있는 경우)을 다룰 수 없다.

**3. 오류 형식을 하나로 통일한다.**
`{ "error": { "code", "message" } }`. 벨루와 폴리오가 서로 다른 오류 형식을 쓰고 있어 클라이언트 공통 처리를 위해 정한다. 상세 코드는 auth 스펙에 있다.

**4. 세션은 쿠키 기반이며 서버가 사용자 컨텍스트를 요청마다 주입한다.**
Supabase Auth의 세션을 `httpOnly` 쿠키로 보관한다. 폴리오의 메모리 세션은 재시작 시 사라지므로 쓰지 않는다. 대안인 `Authorization` 헤더 방식은 PDF를 `<iframe>`이나 뷰어로 직접 여는 `GET /api/papers/{id}/file`과 맞지 않아 버렸다. 쿠키 이름은 구현 단계에서 확정하고, 세션 유지 기간은 30일이다(auth 스펙).

**5. 승인(beta)은 DB 플래그로 두고 UI는 만들지 않는다.**
현재 벨루도 수동 승인이므로 동일하게 유지한다. 가입자 수가 적은 베타 단계에는 충분하다. 승인 플래그는 `archi_profiles.approved`에 둔다(`docs/api/data-model.md`).

**6. 스트리밍은 `text/plain` 청크로 한다.**
벨루 번역과 호환되는 방식이고 SvelteKit `ReadableStream`으로 구현할 수 있다. SSE는 이벤트 구분이 필요 없어 과하다.

**7. 구현 순서는 명세 우선순위와 같다.**
인증, Zotero 연결, 논문 허브, 메모를 먼저 구현하고, 번역은 그다음, 분석(PDF 추출, 저널 점수)은 가장 늦게 한다. 11/10까지 분석이 끝나지 않으면 데모에서는 기존 벨루 결과를 연결하는 예비안을 쓴다.

## Risks / Trade-offs

- [Supabase Auth를 벨루 프로젝트에 추가하면 기존 벨루 `users`와 계정 체계가 둘이 된다] → 기존 테이블은 건드리지 않고, 계정 통합은 별도 change로 분리한다.
- [`zotero_api_key`를 평문으로 저장하던 폴리오 방식을 그대로 옮기면 DB 유출 시 Zotero 계정이 노출된다] → 저장 전 암호화하고 어떤 응답에도 내보내지 않는다(zotero-connection 스펙).
- [Zotero API 호출이 메모 저장의 지연과 실패 원인이 된다] → 저장은 멱등으로 정의했고, 실패 시 클라이언트가 재시도할 수 있게 한다.
- [무료 요금제의 한도(용량, 연결 수)를 확인하지 못했다] → 마이그레이션 적용 전에 벨루 프로젝트의 사용량을 확인한다.
- [분석 기능의 TypeScript 재작성이 일정을 밀 수 있다] → 결정 7의 순서와 예비안으로 줄인다.

## Migration Plan

1. 로컬 Supabase(Docker)에서 마이그레이션을 작성하고 검증한다.
2. 완성 후 벨루 프로젝트를 백업한다.
3. 같은 마이그레이션을 벨루 프로젝트에 적용한다. 되돌리기는 추가한 테이블만 지우는 롤백 스크립트와 백업으로 한다.
4. 비서와 폴리오 서버의 `SUPABASE_URL`과 service 키를 벨루 프로젝트 값으로 교체한다.
5. Zotero 재동기화로 논문 목록을 채운다.

## Open Questions

- 11/24 이후 기존 벨루, 폴리오 서비스를 내릴 시점.
- 벨루 외부 AI 키를 계속 쓸지(현재는 유지로 가정).

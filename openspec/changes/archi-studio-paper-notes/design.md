# Design

## Context

- 계약은 메인 스펙 `paper-notes`(조회, 저장, 삭제, 크기 제한)와 `docs/api/openapi.yaml`의 `/api/papers/{id}/memo`에 있다. 오류는 모두 공통 형식 `{ "error": { "code", "message" } }`다.
- 메모 본문은 DB에 저장하지 않는다. Zotero에서 태그 `zotero-insight:memo`가 붙은 자식 노트를 실시간으로 읽고 쓴다(`docs/api/data-model.md` 4절). 논문 목록의 `hasMemo`를 위해 `papers.has_memo`만 DB에 둔다.
- 기존 폴리오(`/home/joon/workspace/zotero-folio/server/server.js`)의 동작:
  - 저장: 같은 태그의 자식 노트를 찾는다. 있으면 수정, 없으면 생성한다. 본문이 공백뿐이면 노트를 삭제한다.
  - 변환: 저장할 때 `marked`로 마크다운을 HTML로, 읽을 때 `turndown`(제목은 `#` 방식, 코드는 펜스 방식, 목록은 `-`)으로 HTML을 마크다운으로 바꾼다.
  - 수정은 Zotero의 낙관적 잠금(`If-Unmodified-Since-Version` 헤더, 노트의 버전이 바뀌었으면 거부)을 쓴다.
  - 삭제는 Zotero 휴지통으로 보낸다. 복구할 수 있다.
  - 본문 크기 제한은 없고, 응답은 `{ noteKey, version }`이다.
- 새 앱에서 논문은 내부 UUID `id`로 가리킨다. 서버는 `id`로 논문 행을 찾아 소유자와 Zotero 항목 키(`item_key`)를 확인하고, 사용자의 Zotero 자격 정보(`folio_users`)로 Zotero를 호출한다. 이 조회와 Zotero 호출 모듈은 선행 change가 만든다.

## Goals / Non-Goals

**Goals:**
- 메인 스펙 `paper-notes`의 요구사항 4개와 시나리오 6개를 그대로 만족한다.
- 폴리오가 이미 만든 메모 노트(같은 태그)를 새 앱이 그대로 읽고 이어서 저장한다.
- Zotero 없이도 검증할 수 있게 Zotero 호출을 바꿔 끼울 수 있는 경계(가짜 구현 주입)를 둔다.

**Non-Goals:**
- 메모 편집 화면과 자동 저장 타이밍(화면 change의 몫).
- 메모 이력, 여러 메모, 메모 공유, 동시 편집 병합.
- 하이라이트와 필기.
- 메모 본문의 DB 복제나 검색.

## Decisions

**1. 메모 서비스는 Zotero 호출을 인터페이스로 받는다.**
`findMemoNote(itemKey)`, `createMemoNote(itemKey, html)`, `updateNote(noteKey, version, html)`, `deleteNote(noteKey, version)`만 가진 작은 인터페이스를 메모 서비스가 받는다. 실제 구현은 선행 change의 Zotero 호출 모듈이 맡고, 테스트는 메모리에 노트를 들고 있는 가짜 구현을 쓴다. 이렇게 하면 Zotero 계정 없이 멱등 저장과 삭제를 검증할 수 있다. 대안(서비스가 직접 `fetch`)은 시험할 때마다 외부 호출을 흉내 내야 해서 버렸다.

**2. 변환은 폴리오와 같은 라이브러리와 같은 옵션을 쓴다.**
`marked`(마크다운→HTML)와 `turndown`(HTML→마크다운, 제목 `atx`, 코드 `fenced`, 목록 `-`). 이미 폴리오가 만든 노트와 왕복 결과가 같아야 하기 때문이다. 본문 앞뒤 공백은 `trim`한다.

**3. "같은 본문"의 의미를 정한다.**
저장한 마크다운을 다시 조회했을 때 문자 하나까지 같다고 보장하지 않는다. HTML을 거치므로 표현이 약간 달라질 수 있다(예: 줄 끝 공백, 목록 기호). 계약의 "이후 조회가 같은 본문을 돌려준다"는 시험용 대표 본문(제목, 목록, 코드 블록, 링크, 한글, 빈 줄)을 저장하고 조회했을 때 앞뒤 공백 제거 후 일치한다는 뜻으로 검증한다. 일치하지 않는 문법이 있으면 목록으로 문서화한다.

**4. 크기 제한은 바이트로 센다.**
본문 길이를 UTF-8 바이트로 재서 1 MB(1,048,576바이트)를 넘으면 413 `payload_too_large`다. 글자 수로 세면 한글이 많을 때 제한이 달라진다. 요청 본문을 읽기 전에 거부할 수 있도록, Node 서버 어댑터의 본문 한도(`BODY_SIZE_LIMIT`, 기본 512 KB)를 메모 경로에서는 1 MB보다 크게 올려야 한다. 한도를 올리지 않으면 어댑터가 코드에 도달하기 전에 형식이 다른 413을 먼저 돌려준다.

**5. 저장 순서와 `has_memo` 갱신.**
저장: 본문 검사(문자열인가, 크기) → 논문 소유 확인 → Zotero 연결 확인 → 기존 노트 찾기 → 빈 본문이면 삭제, 아니면 수정 또는 생성 → `papers.has_memo` 갱신 → `{ markdown, updatedAt }` 응답. Zotero 쓰기가 성공한 뒤에만 `has_memo`를 바꾼다. 쓰기가 실패하면 `has_memo`는 그대로다.

**6. 버전 충돌은 한 번 다시 시도한다.**
수정 때 Zotero가 "노트가 그 사이에 바뀌었다"(412)고 답하면, 노트를 다시 읽어 최신 버전으로 한 번만 다시 수정한다. 사용자가 Zotero 앱에서 같은 노트를 동시에 편집한 경우의 마지막 저장이 이긴다는 뜻이다. 두 번째에도 실패하면 오류로 처리한다.

**7. `updatedAt`은 Zotero 노트의 수정 시각이다.**
Zotero 노트의 `dateModified`를 그대로 쓴다. 삭제된 상태(노트 없음)는 `null`이다.

**8. 오류 응답.**
- 논문이 없거나 남의 것: 404 `paper_not_found`(존재 여부를 숨기려고 둘을 구분하지 않는다).
- Zotero 미연결: 409 `zotero_not_connected`.
- `markdown`이 문자열이 아니거나 JSON이 아님: 400 `invalid_request`.
- 1 MB 초과: 413 `payload_too_large`.
- 미인증: 401 `unauthenticated`(가드가 처리, 이 change가 새로 만들지 않는다).

## Risks / Trade-offs

- [마크다운↔HTML 왕복에서 표현이 바뀐다] → 결정 3의 대표 본문 시험으로 범위를 정하고, 안 되는 문법은 문서화한다. 근본 해결(원문 마크다운을 노트 안 숨은 주석으로 함께 저장)은 Zotero에서 노트가 어색하게 보일 수 있어 지금은 하지 않는다.
- [`marked`는 변환한 HTML을 정화하지 않는다] → 이 HTML은 Zotero로만 가고 브라우저에는 마크다운만 돌려준다. 입력에 섞인 HTML 조각이 Zotero 노트 뷰어에서 어떻게 보이는지는 확인하지 못했다. 화면이 마크다운을 그릴 때의 정화는 화면 change에서 한다.
- [Zotero 호출 실패, 느린 응답] → 스펙에 Zotero 장애용 오류 코드가 없어 지금은 500 `internal_error`로 나간다. 아래 열린 질문 1.
- [한도를 올린 본문 크기] → 1 MB까지 받으므로 메모 경로에만 올리고 나머지 `/api` 경로는 기본 한도를 유지한다.
- [자동 저장이 잦아 Zotero API 호출이 많다] → Zotero는 호출 속도 제한과 `Backoff` 헤더를 둔다. 서버는 `Backoff`를 받으면 그 시간 뒤 다시 시도하는 처리를 하지 않고 오류로 돌려준다(첫 구현의 범위 제한). 화면 쪽에서 저장 간격을 두는 것이 1차 방어다.

## Open Questions

1. **Zotero가 응답하지 않거나 5xx일 때의 응답.** 지금 스펙에는 코드가 없다. 추천: 이번에는 500 `internal_error`로 두고, Zotero를 쓰는 다른 change(논문 동기화 등)와 함께 `zotero_unavailable`(502) 같은 코드를 스펙에 추가할지 한 번에 정한다.
2. **왕복에서 달라지는 문법을 고칠지.** 추천: 대표 본문 시험에서 실제로 달라지는 것이 나오면 그때 목록으로 문서화하고, 데모 흐름(제목, 목록, 코드, 링크)에서 문제가 없으면 그대로 둔다.
3. **Zotero 호출 모듈의 위치.** 선행 `archi-studio-papers`가 정하는 구조에 맞춰 노트 호출 함수를 같은 모듈에 둔다. 모듈 구조가 정해지기 전에는 이 change의 파일 경로가 바뀔 수 있다.

# Design

## Context

- 현재 `src/routes/+layout.svelte`가 모든 화면을 `AppShell`(3열 셸)로 감싸고, 시작 화면은 안내 문구 한 줄뿐이다. 메뉴 항목 5개는 `AppShell.svelte` 안에 문자열로 박혀 있고 링크가 아니다.
- 서버에는 `/api/auth/*`(가입, 로그인, 로그아웃, 내 정보)가 이미 있고, 세션은 `httpOnly` 쿠키 `archi_session`이다. 브라우저 JavaScript는 쿠키를 읽을 수 없으므로 로그인 상태는 항상 서버 응답(`GET /api/auth/me`)으로 알 수 있다.
- 서재와 Zotero API(`/api/papers*`, `/api/collections`, `/api/zotero/*`)는 선행 change(`archi-studio-papers`, `archi-studio-zotero-connection`)가 만든다. 이 change의 구현 시점에 아직 없을 수 있다.
- 서버 CSRF 검사(`src/lib/server/csrf.ts`)는 폼 형식 본문(`application/x-www-form-urlencoded` 등)의 다른 출처 요청만 막는다. 화면은 JSON 본문으로 요청하므로 영향이 없다.
- 이 서버에는 글꼴이 없어 스크린샷에 글자가 보이지 않는다. 글자 확인은 DOM 검사로 한다(`docs/dev/setup.md`).
- 참고 구현은 폴리오 Svelte 5 화면과 벨루 React 화면이다. 폴리오는 같은 Svelte라 구조를 옮기기 쉽고, 벨루는 흐름(이동 주소 검사, 세션 만료 안내)만 참고한다.

## Goals / Non-Goals

**Goals:**
- 이후 화면 change 4개(논문 허브, 번역·분석, 브리핑)가 그대로 가져다 쓸 공통 부품과 호출 도구를 세운다.
- 로그인부터 서재까지 한 번에 쓸 수 있는 첫 흐름을 완성한다.
- 선행 API가 아직 없어도 화면을 검증할 수 있게 한다.

**Non-Goals:**
- 논문 허브, PDF 뷰어, 메모, 번역, 분석, 브리핑 화면(다른 change).
- 오른쪽 설정 패널의 내용(번역·분석 화면 change가 정한다).
- 컴포넌트 라이브러리나 CSS 프레임워크 도입, 다국어, 테마 수동 전환.

## Decisions

**1. 화면 묶음을 둘로 나눈다: `(auth)`와 `(app)`.**
`src/routes/(auth)/`(로그인, 가입)은 셸이 없고, `src/routes/(app)/`(서재, 설정, 이후 모든 화면)은 `AppShell`로 감싼다. 루트 `+layout.svelte`는 토큰 CSS와 `<head>`만 맡는다. 셸이 로그인 화면까지 감싸면 메뉴와 설정 패널이 로그인 전에 보인다. 대안(셸 안에서 로그인 화면일 때만 숨김)은 조건 분기가 모든 화면에 퍼져 버려 채택하지 않았다.

**2. 로그인 상태는 서버에서 확인하고 곧바로 이동시킨다.**
`(app)/+layout.server.ts`가 `event.fetch('/api/auth/me')`로 사용자를 확인한다. 쿠키는 같은 출처 요청이라 자동으로 전달된다. 401이면 `/login?redirect=<현재 경로와 쿼리>`로 303 이동하고, 성공하면 `user`를 레이아웃 데이터로 넘긴다. `(auth)/+layout.server.ts`는 반대로 이미 로그인한 사용자를 `/library`로 보낸다. 화면이 그려진 뒤 이동시키는 방식(클라이언트 확인)은 깜박임이 생겨서 쓰지 않는다. 이 확인은 전체 페이지를 새로 열 때만 실행되므로, 화면을 쓰는 도중의 만료는 결정 3의 401 처리가 맡는다.

**3. API 호출은 얇은 `fetch` 래퍼 하나로 모은다.**
`src/lib/api/client.ts`의 `apiFetch`는 JSON을 보내고 받으며, 2xx가 아니면 `ApiError(status, code, message)`를 던진다. 응답이 `{error:{code,message}}` 형식이 아니면 상태 코드로 대체 코드를 만든다. 401이면 인증 API 자신이 아닌 한 `/login?redirect=<현재 주소>&expired=1`로 이동하는데, 동시에 여러 요청이 401을 받아도 이동은 한 번만 한다. 응답 타입은 `src/lib/api/types.ts`에 손으로 적고 `docs/api/openapi.yaml`과 대조한다. 코드 생성 도구는 새 의존성이라 쓰지 않는다.

**4. 서재 데이터는 주소를 기준으로 불러온다.**
`(app)/library/+page.ts`의 `load`가 `url.searchParams`의 `query`, `collection`을 읽어 `fetch`로 목록, 컬렉션, Zotero 상태를 함께 부른다. 검색창은 280ms 디바운스 뒤 `goto('?query=…', { replaceState, keepFocus, noScroll })`로 주소만 바꾸고, 데이터는 `load`가 다시 가져온다. SvelteKit은 가장 나중 이동의 결과만 반영하므로 늦게 온 이전 응답이 새 결과를 덮지 않는다(검증은 task에 있다). '더 보기'는 `cursor`를 붙인 요청 결과를 화면 상태에 이어 붙이며, 검색어나 컬렉션이 바뀌면 처음부터 다시 시작한다. 대안(`$effect` 안에서 직접 `fetch`하고 요청 번호로 경합 처리)은 폴리오가 쓰던 방식인데 뒤로 가기·새로 고침에서 상태가 사라져서 채택하지 않았다.

**5. 공통 부품은 `src/lib/components/ui/`에 Svelte 5로 만든다.**
부품: `Button`, `IconButton`, `TextField`, `SearchField`, `Card`, `Tabs`, `NavItem`, `StatePanel`, `Notice`, `ConfirmDialog`, `StreamOutput`, `Icon`, `Spinner`. 모두 `$props()`와 snippet으로 내용을 받고, 스타일은 컴포넌트 안 `<style>`에서 토큰만 쓴다. `index.ts`가 한 곳에서 내보낸다. 아이콘은 폴리오 `Icon.svelte`의 SVG 경로 중 쓰는 것만 옮긴 작은 묶음이다(새 의존성 없음). 벨루의 `StatePanel`(`loading`/`empty`/`error`, 알림 역할 구분)과 폴리오의 `PaperCard` 삭제 확인 흐름을 참고한다.

**6. 확인 대화상자는 브라우저 기본 `<dialog>`로 만든다.**
`showModal()`을 쓰면 포커스 가두기, 배경 차단, Escape 닫기를 브라우저가 처리한다. 직접 만든 포커스 가두기(셸 패널에서 이미 한 번 해 본 방식)는 코드가 길고 틈이 생기기 쉽다. 닫을 때 연 버튼으로 포커스를 되돌리는 것만 직접 한다.

**7. 스트리밍 읽기 도구를 공통 부품과 함께 만든다.**
번역과 분석 화면이 모두 `text/plain` 조각 응답을 읽는다. `src/lib/ui/stream.ts`의 `readTextStream(response, onChunk)`가 `TextDecoder`를 `stream: true`로 써서 한글이 조각 경계에서 깨지지 않게 한다. `StreamOutput`은 `text`, `streaming`, `error`를 받아 보여줄 뿐이고 요청 자체는 각 화면이 한다. 이렇게 하면 화면 change가 부품 위에 얇게 얹힌다.

**8. 부품 확인용 화면은 개발 서버에서만 연다.**
`/dev/components`는 `dev`(SvelteKit 환경값)일 때만 열리고 빌드한 서버에서는 404다. 모든 부품의 상태(진행 중, 오류, 비활성, 스트리밍)를 한 화면에 모아 두면 Playwright로 한 번에 확인할 수 있다.

**9. 메뉴는 설정 데이터로 만들고 링크로 렌더링한다.**
`(app)/+layout.svelte`가 `[{ label: '서재', href: '/library' }, { label: '번역', disabled: true }, …]`를 `AppShell`에 넘긴다. 다른 change가 화면을 만들 때 `disabled`를 빼고 `href`를 채우면 된다. 현재 위치는 `page.url.pathname`으로 판정한다. 셸 하단에 사용자 이메일, 설정 링크, 로그아웃 버튼을 둔다.

**10. 로그인·가입 요청은 `fetch`로 직접 보낸다.**
SvelteKit 폼 액션을 쓰면 서버가 중간에서 응답을 다시 전달해야 세션 쿠키가 브라우저에 전해진다. 브라우저가 `/api/auth/login` 응답의 `Set-Cookie`를 바로 받는 편이 단순하고, 이미 만든 서버 계약(JSON 본문, 오류 코드)을 그대로 쓴다.

**11. 오류 문구는 한 파일에서 코드별로 정한다.**
`src/lib/api/messages.ts`가 `error.code`를 한국어 안내로 바꾼다(`invalid_credentials`, `pending_approval`, `too_many_attempts`, `email_taken`, `zotero_not_connected`, `invalid_request`, `paper_not_found` 등). 모르는 코드는 서버가 준 `message`, 그것도 없으면 공통 문구를 쓴다. 단위 테스트로 모든 코드가 문구를 갖는지 확인한다.

**12. 시작 주소 `/`는 서재로 보낸다.**
`(app)/+page.server.ts`가 `/library`로 이동시킨다. 로그인하지 않았다면 결정 2에서 로그인 화면으로 간다. 폴리오의 홈 대시보드는 옮기지 않는다.

## Risks / Trade-offs

- [선행 API가 없는 상태에서 서재를 검증하므로 가짜 응답이 실제와 어긋날 수 있다] → 가짜 응답은 `docs/api/openapi.yaml`의 예시 형식에서 만들고, 선행 change가 적용된 뒤 실제 서버로 한 번 더 확인하는 task를 둔다.
- [`<dialog>`가 오래된 브라우저에서 다르게 동작할 수 있다] → 데모 환경은 최신 브라우저로 한정하고 Chromium에서 Playwright로 확인한다.
- [서버 확인 뒤 세션이 만료되는 사이에는 보호 화면이 잠깐 보일 수 있다] → 화면에서 부르는 첫 API가 401을 받으면 결정 3이 로그인으로 보낸다.
- [서재 목록을 서버 순서로만 보여주므로 폴리오보다 정렬 기능이 줄어든다] → 서버에 정렬 값이 없는 한 불러온 일부만 정렬하면 틀린 결과를 줄 수 있다. 필요하면 별도 change에서 API부터 확장한다.
- [서버에 글꼴이 없어 글자 렌더링을 눈으로 못 본다] → 글자 존재와 포커스 이동은 DOM 검사로, 모양은 스크린샷으로 확인한다. 한글 렌더링 확인은 글꼴이 있는 환경에서 한 번 더 해야 한다.
- [`event.fetch`로 자기 서버의 `/api/auth/me`를 부르면 서버 안에서 요청이 한 번 더 처리된다] → 전체 페이지를 새로 열 때만 일어나므로 베타 규모에서 부담이 작다.

## Migration Plan

- 데이터 이전은 없다. 루트 레이아웃을 둘로 나누는 이동이 가장 큰 변경이며, 되돌리려면 이 change의 커밋을 되돌리면 된다.
- 순서: 호출 도구와 공통 부품 → 묶음 분리와 메뉴 → 로그인·가입 → 서재 → 설정 → 통합 검증. 서재와 설정은 선행 change 적용 전에는 가짜 응답으로 확인하고, 적용 후 실제 서버로 다시 확인한다.

## Open Questions

- **연도순·이름순 정렬**: 서버 정렬 값(`sort`)이 필요한가? 추천: 이번에는 넣지 않고, 데모에서 필요해지면 `papers` API에 `sort`를 추가하는 별도 change로 만든다.
- **설정 화면의 범위**: 지금은 Zotero 연결만 있다. 계정 정보와 테마 수동 전환을 넣을까? 추천: 지금은 넣지 않는다. 테마는 시스템 설정을 따른다는 `app-shell` 스펙과도 맞다.
- **로그인 화면의 모양**: 폴리오의 표지형이나 벨루의 2단 소개 화면처럼 꾸밀까? 추천: 브랜드 이름, 폼, 가입 링크만 있는 한 장 카드로 시작하고, 데모 직전에 다듬는다.
- **표지 보기**: 폴리오의 표지형 목록을 옮길까? 추천: 데모 흐름에 필요 없어 옮기지 않는다.
- **연결 거부 후 돌아올 때의 표시 값(정해짐)**: `archi-studio-zotero-connection`이 콜백을 `/settings?zotero=denied`(승인 거부)와 `/settings?zotero=error`(그 밖의 실패)로 보내기로 정했다(그 change의 design 결정 10). 이 화면은 같은 값을 읽는다. 화면은 이 쿼리 하나만 읽으므로 나중에 바꿔도 영향이 작다.

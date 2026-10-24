# Design

## Context

- 2026-10-23 적용 시점에 선행 change 세 개(`archi-studio-translation`, `archi-studio-paper-analysis`, `archi-studio-ui-auth-library`)가 모두 구현·보관되었다. 처음 쓴 설계는 이들이 없다는 전제였고, 아래 결정은 지금 코드에 맞게 고친 것이다.
- 셸이 있는 화면은 `src/routes/(app)/` 묶음에 있고, `(app)/+layout.server.ts`가 서버에서 `/api/auth/me`로 로그인을 확인한다. 로그인 화면은 `/login?redirect=<경로와 쿼리>`이다.
- 공통 부품(`$lib/components/ui`), JSON 호출 도구 `apiFetch`(`$lib/api/client`), 오류 문구 `errorMessage`(`$lib/api/messages`), 조각 응답 읽기 `readTextStream`(`$lib/ui/stream`)이 이미 있다. `AppShell`은 `panel` 스니펫 속성을 받는다.
- 사이드바 메뉴는 `$lib/nav.ts`의 `NAV_ITEMS`가 정하고, 번역·분석은 지금 `disabled`다.
- `Analysis` 응답 필드는 확정됐다(`openapi.yaml`): `summary`, `keywords`, `domain`, `problemShort`·`problem`, `methodShort`·`method`, `conclusionShort`·`conclusion`, `basic`, `authors`, `journalScore`(여섯 값), `sources`.
- `GET /api/translate/history`는 `limit`(기본 50, 최대 200)과 `paperId` 필터를 받는다.
- 이 서버의 Chromium 실행 준비(라이브러리, 글꼴)는 `docs/dev/setup.md`에 있다.

## Goals / Non-Goals

**Goals:**
- 번역·분석 화면이 "입력 → 실행 → 결과" 흐름으로 동작하고, 모든 실패 상태(세션 만료, 입력 거부, 서버 오류, 연결 끊김, 자료 없음)에서 입력을 잃지 않는다.
- 이미 있는 공통 부품과 호출 도구를 그대로 쓴다.
- 화면을 브라우저 검사로 자동 확인한다.

**Non-Goals:**
- 서재, 논문 허브, 메모, 브리핑 화면, 로그인·가입 화면(다른 change).
- 번역·분석 API 자체와 AI 호출.
- PDF에서 선택한 글을 바로 번역하는 기능, 단어장, 번역 내보내기, 화면 문구의 다국어 지원.

## Decisions

**1. 두 화면은 `(app)` 묶음 안에 두고 브라우저에서만 그린다.**
`src/routes/(app)/translate/`와 `src/routes/(app)/analyze/`에 두어 셸과 서버 로그인 확인을 그대로 받는다. `+page.ts`에 `export const ssr = false`를 둔다. 스트림은 브라우저가 읽고, 자동 번역 설정을 브라우저 저장소에서 읽기 때문이다(서재 화면과 같은 방식).

**2. 호출과 스트림 읽기는 기존 도구를 쓴다.**
JSON 요청(논문, 이력, 분석)은 `apiFetch`, 번역 스트림은 `fetch` + `readTextStream`이다. 새로 `src/lib/client/`를 만들지 않는다. 번역 요청만 `src/lib/translate.ts`의 `startTranslation(text, paperId, signal, onChunk)`로 감싸 응답 상태가 2xx가 아니면 `toApiError`로 `ApiError`를 만들고, 읽는 도중 실패는 `StreamInterrupted`(받은 글자 포함)로, 취소는 `AbortError`로 구분한다.

**3. 401은 화면에서 안내만 하고 자동으로 이동하지 않는다(auth-screens 예외).**
`apiFetch`는 401이면 로그인 화면으로 보낸다. 번역·분석 화면은 입력한 글과 결과를 잃지 않으려고 이동하지 않고 안내와 `/login?redirect=<현재 주소>` 링크를 보여준다. 이를 위해 `apiFetch`에 `redirectOn401: false` 선택을 더하고, `auth-screens` 스펙의 "로그인 상태 확인과 만료 처리"에 두 화면을 예외로 적는다. 대안(입력을 저장소에 넣고 이동한 뒤 되살리기)은 결과와 이력 상태까지 되살려야 해서 복잡하다.

**4. 설정 패널 슬롯은 Svelte 컨텍스트로 만든다.**
`src/lib/components/panel-slot.svelte.ts`가 `content`(스니펫)와 등록자 표시를 가진 상태 객체를 만들고, `(app)/+layout.svelte`가 이를 컨텍스트로 내려 `AppShell`의 `panel` 속성에 넘긴다. 화면은 `<PanelContent>`로 자기 스니펫을 등록하고, 사라질 때 자기가 등록한 것일 때만 지운다(A→B 이동에서 B의 등록이 A의 정리에 지워지는 경쟁 상태 방지). 슬롯이 비면 `AppShell`은 기존 안내문을 보여준다.

**5. 자동 번역은 기본 꺼짐으로 한다.**
번역마다 이력이 저장되고 AI를 부르므로 기본 켜짐이면 입력 도중의 미완성 문장이 이력과 비용을 채운다. 켜면 입력이 300ms 멈춘 뒤 실행하고 이전 요청은 취소한다. 선택은 브라우저 저장소에 저장한다(저장소를 못 쓰면 기본값).

**6. 이력은 `limit=200`으로 받아 화면에서 20개씩 펼친다.**
서버가 쪽 넘김을 하지 않으므로 한 번에 최대 200개를 받고 처음 20개를 보인 뒤 "더 보기"로 20개씩 펼친다.

**7. 분석 화면의 논문 선택기는 서재 목록 줄 모양을 따라 작게 만든다.**
`src/lib/components/PaperPicker.svelte`가 `SearchField`(300ms), `GET /api/papers?query=&limit=20`, 위아래 화살표와 Enter로 고르는 목록을 가진다. 검색어가 비면 최근 논문 20개다.

**8. 분석 결과는 확정된 필드대로 묶어 보여준다.**
기본 정보, 세 줄 요약, 펼쳐 보는 자세한 설명(`<details>`), 분야·키워드, 저자, 저널 점수, 분석에 쓴 자료 순서다. null이나 빈 목록은 숨긴다. 분위 배지는 `--color-accent-soft` 등 토큰만 쓴다. `journalScore` 여섯 값이 모두 null이면 "순위표에서 찾지 못한 학회·저널"로 안내한다.

**9. 화면 검사는 실제 로그인과 브라우저 안의 가짜 응답으로 한다.**
화면은 서버에서 로그인을 확인하므로 로컬 DB로 만든 실제 계정으로 로그인한다. JSON 응답(논문, 이력, 분석)은 Playwright `page.route`로 바꾼다. `route.fulfill`은 조각 응답을 나눠 보낼 수 없어, 번역 스트림은 `page.addInitScript`로 브라우저의 `fetch`를 `/api/translate`에 한해 감싸 시간차 조각, 한글 바이트 분할, 중간 끊김, 오류 상태를 흉내 낸다(요청 본문과 취소도 기록). 처음 설계의 별도 가짜 서버와 개발 프록시는 서버 쪽 로그인 확인을 흉내 낼 수 없어 쓰지 않는다. 검사는 `scripts/ui-screens.mjs`에 `translate`, `analyze` 묶음으로 더한다.

**10. 화면 문구는 화면별 모듈에 모은다.**
`src/lib/messages/translate.ts`, `analyze.ts`에 한국어 문구를 상수로 모은다. 오류 코드 문구는 `errorMessage`를 쓴다. 검사 스크립트는 문구를 리터럴로 비교한다.

**11. 주소와 메뉴.**
`/translate`, `/translate?paperId=<uuid>`, `/analyze`, `/analyze?paperId=<uuid>`. UUID 형식이 아닌 `paperId`는 API를 부르지 않고 "논문을 찾을 수 없음"과 같게 처리한다. `NAV_ITEMS`의 번역·분석 항목에서 `disabled`를 빼고 `href`를 채운다.

## Risks / Trade-offs

- [`AppShell`을 여러 change가 고친다] → 이번에는 `AppShell`을 고치지 않고 이미 있는 `panel` 속성을 쓴다. 셸 검사(`scripts/shell-screens.mjs`)가 계속 통과해야 한다.
- [브라우저 안의 가짜 `fetch`는 실제 네트워크와 다를 수 있다] → 스트림 해석은 `readTextStream` 단위 테스트가 실제 `ReadableStream`으로 확인했고, 마지막 task에서 실제 서버와 학교 모델로 한 번 번역·분석한다.
- [스트림 중간 끊김 때 서버는 저장하지 않는다] → 화면은 성공했을 때만 이력을 다시 불러온다.
- [이력이 200개를 넘으면 오래된 것은 보이지 않는다] → 데모 규모에서는 충분하다. 필요하면 API에 쪽 넘김을 더한다.
- [학교 모델은 첫 글자까지 40초 안팎이 걸린다] → 화면은 "번역 중"과 커서를 계속 보여주고 중지할 수 있다.

## Migration Plan

새 파일, `NAV_ITEMS` 두 항목, `apiFetch` 선택 값 하나, `(app)/+layout.svelte`의 슬롯 연결만 더하는 추가형 변경이다. 되돌리려면 이 change의 커밋을 되돌린다.

## Open Questions

1. **자동 번역 기본값**: 꺼짐으로 정했다(결정 5). 추천은 꺼짐 유지.
2. **AI 사용 안내**: "외부 AI로 전송됩니다" 같은 안내는 이번에 두지 않는다. 지금 모델은 학교 서버의 로컬 모델이다.
3. **분석 다시 하기**: API가 저장된 결과를 돌려주므로 강제 재분석은 없다. 필요해지면 `paper-analysis`에 더한다.

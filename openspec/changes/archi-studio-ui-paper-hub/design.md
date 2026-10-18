# Design

## Context

- 새 앱은 SvelteKit 2.70 + Svelte 5 + TypeScript strict, Node 20이다. 셸(`AppShell.svelte`)은 왼쪽 메뉴 240px, 가운데 작업 영역, 오른쪽 패널 320px의 3단이고, 색은 `tokens.css`의 변수만 쓴다. 현재 `src/routes/`에는 `+layout.svelte`, `+page.svelte`, `api/`만 있다.
- 서버 계약은 이미 메인 스펙에 있다. 논문 상세는 `papers`(응답에 `attachment.type`, `translationCount`, `analysisCount` 포함), 원문은 `GET /api/papers/{id}/file`(PDF 또는 HTML 한 경로), 메모는 `paper-notes`(`GET`·`PUT /api/papers/{id}/memo`, 1MB 제한, 409 `zotero_not_connected`). 오류는 모두 `{error:{code,message}}`다.
- 참고 구현은 폴리오(`/home/joon/workspace/zotero-folio/web/src`)다. 폴리오는 Svelte 5이고 같은 `pdfjs-dist` 6.x, `marked`를 쓰므로 코드 이식이 가능하다. 다만 JavaScript이고, 논문을 `item_key`로 부르며, 메모를 상세 응답에 함께 받는다. 새 앱은 논문 id(UUID)를 쓰고 메모를 따로 받는다.
- 이 change는 서버 구현보다 먼저 적용될 수도 있다. 그래서 단계별 검증은 API 응답을 가짜로 대신하는 방식을 기본으로 한다.

### 폴리오 파일별 처리

| 폴리오 파일 | 줄 수 | 처리 |
|---|---|---|
| `PdfViewer.svelte` | 2,190 | 핵심만 이식. 하이라이트, 필기, 지우개, 색 팝업은 제외 |
| `PdfPane.svelte` | 351 | 확대 툴바, 휠 확대, 커서 고정 스크롤 보정, 메모 접기 버튼만 이식. 펜 도구와 첨부 교체 제외 |
| `HtmlViewer.svelte` | 255 | 이식(`sandbox="allow-same-origin"` 유지) |
| `MarkdownNote.svelte` | 596 | 이식 후 수정(오류 코드별 안내, 미리보기 안전 처리) |
| `NoteBottomSheet.svelte` | 250 | 이식 후 수정(셸의 포커스 이동·복귀·`inert` 규칙에 맞춤) |
| `PaperDetailSplit.svelte` | 150 | 새로 작성(라우트 `src/routes/papers/[id]/`) |
| `touch-gestures.js` | 250 | 이식(TypeScript) |
| `safari-polyfills.js`, `pdf-worker-entry.js` | 37, 5 | 이식(TypeScript) |
| `pdf-highlight.js`, `pdf-ink.js` | 154, 116 | 제외 |
| `Icon`, `TabBar`, `PaperCard`, `LogoutButton` | - | 이 change 밖(공통 부품은 `archi-studio-ui-auth-library`) |

`PdfViewer.svelte`에서 남기는 부분은 PDF 불러오기와 렌더링, 폭 맞춤, 글자 위치 교정(`calibrateTextLayer`), 링크 클릭과 뒤로 가기, 복사, 키 입력 정도다. 이식 뒤 줄 수는 대략 700~900줄로 짐작하지만 확인하지 못했다. 이식 뒤 실제 줄 수를 측정해 기록한다.

## Goals / Non-Goals

**Goals:**
- 단계 1(뷰어), 2(허브 틀), 3(메모)가 각각 앞뒤 단계 없이 검증된다.
- 폴리오에서 이미 잡은 문제(Safari에서 글자 선택 위치가 밀림, 두 손가락 확대와 스크롤이 겹쳐 튐, 긴 메모에서 편집 줄이 사라짐)를 이식하면서 되살리지 않는다.
- 이식한 코드에 동작 변경을 섞지 않는다. 바꾸는 곳은 위 표에 적은 수정과 주소·API 형태뿐이다.

**Non-Goals:**
- 하이라이트·필기, 첨부 교체, 서재·검색·컬렉션 화면, 번역·분석 화면 자체.
- 서버(`/api`) 변경과 스펙 변경(`papers`, `paper-notes`는 그대로).
- 폴리오의 디자인(베이지·파랑)을 새 앱에 옮기는 일. 색과 크기는 `tokens.css`로 새로 입힌다.

## Decisions

**1. 뷰어는 핵심만 이식한다.**
2,190줄을 통째로 옮긴 뒤 기능을 끄면 쓰지 않는 코드가 남아 TypeScript 오류와 유지 비용이 된다. 필요한 부분만 골라 옮기고 제외한 부분은 `design.md`의 표에 남긴다. 대안으로 pdf.js 기본 뷰어를 iframe으로 쓰는 방법이 있지만 색 통합, 폭 맞춤, 확대 지점 고정을 우리 규칙대로 맞추기 어려워 택하지 않았다.

**2. 브라우저에서만 pdf.js를 불러온다.**
pdf.js는 `window`, `document`를 쓰므로 서버 렌더링 때 불러오면 오류가 난다. 뷰어 컴포넌트가 화면에 붙은 뒤(`onMount`) `import('pdfjs-dist')`로 불러오게 해서 셸과 허브 틀은 서버 렌더링을 유지한다. 대안은 라우트에 `ssr = false`를 거는 것인데, 이 설정이 셸까지 클라이언트 전용으로 바꾸는지는 확인하지 못했다. 첫 단계에서 두 방식을 빌드로 확인하고 동적 불러오기를 기본으로 한다.

**3. 워커는 Vite의 ES 모듈 워커로 번들한다.**
워커(PDF 해석을 맡는 별도 스레드)는 폴리오처럼 `vite.config.ts`에 `worker.format = 'es'`를 넣고 `pdf-worker-entry.ts`가 호환 보강 코드를 먼저 불러온 뒤 `pdf.worker.min.mjs`를 불러오게 한다. 메인 스레드와 워커는 전역이 서로 달라서 호환 보강(`Promise.withResolvers`, `ReadableStream`의 비동기 순회)을 양쪽에 각각 걸어야 한다.

**4. 상태는 한 곳에 둔다.**
확대 배율과 스크롤 요소는 원문 패널(`PdfPane` 상당)이 갖고 뷰어(`PdfViewer`, `HtmlViewer`)는 값을 받아 쓴다. 폴리오의 이 구조 덕에 확대 중 스크롤 보정 계산이 한 곳에서 맞는다. 바꾸지 않는다.

**5. 원문은 논문 id와 한 경로로 받는다.**
폴리오는 `/pdf`, `/html` 경로를 나눠 썼지만 새 API는 `GET /api/papers/{id}/file` 하나이고 종류는 상세 응답의 `attachment.type`으로 정한다. 쿠키 인증은 같은 출처 요청이라 자동으로 붙는다(`credentials: 'same-origin'`). HTML 스냅샷은 `<iframe sandbox="allow-same-origin">`(스크립트는 실행되지 않음)를 유지한다.

**6. 메모 미리보기는 HTML을 글자로 바꿔 보여준다.**
폴리오는 `marked` 결과를 `{@html}`로 그대로 넣는다. 메모는 Zotero의 노트이기도 해서 다른 곳에서 편집된 내용일 수 있으므로, `marked`의 렌더러에서 원본 HTML 토큰을 이스케이프(글자로 표시)해 스크립트와 이벤트 속성이 실행되지 않게 한다. 의존성을 늘리지 않는다. 대안은 DOMPurify(HTML 소독 라이브러리)인데 허용 목록 관리가 필요하다. 메모에 쓴 HTML이 Zotero에서는 서식으로 보이고 미리보기에서는 글자로 보이는 차이가 생기며, 이는 알려진 차이로 문서에 남긴다.

**7. 허브 안 분할은 작업 영역 폭을 기준으로 한다.**
폴리오는 브라우저 폭(900px, 세로 태블릿 1024px)으로 판정했다. 새 앱은 왼쪽 메뉴(240px)와 오른쪽 패널(320px)이 폭을 차지해서 브라우저 폭 1280px에서도 작업 영역은 약 720px이다. 그래서 `ResizeObserver`로 작업 영역의 실제 폭을 재고 700px(원문 최소 360 + 메모 최소 320 + 구분선)을 기준으로 분할과 시트를 전환한다. 허브는 작업 영역의 안쪽 여백 없이 가득 채워서 쓴다. 기준에 아슬아슬하므로 1280px에서 분할이 되는지를 단계 2의 검증에 넣는다.

**8. 타입은 전부 붙이되 pdf.js 내부는 좁게 예외를 둔다.**
모든 컴포넌트와 유틸은 `lang="ts"`로 옮기고 props, API 응답, 공개 함수는 엄격하게 타입을 붙인다. pdf.js 내부 객체 중 타입 정의가 없는 곳만 좁은 타입이나 `unknown` 뒤 확인으로 처리하고 `any`는 쓰지 않는 것을 목표로 한다. 이식 뒤 `grep -c ": any"`를 세어 기록한다. 대안은 JavaScript 그대로 두는 것인데 `npm run check`가 그 파일을 검사하지 못해 이식 중 생긴 실수를 잡을 수 없다.

**9. 메모 편집기의 부가 기능은 유지한다.**
`.md` 파일 불러오기와 내려받기, 초안 임시 보관(`sessionStorage`, 키는 `archi:memo-draft:{id}`), 입력에 따라 높이가 늘어나는 편집 영역과 그 스크롤 보존 처리는 폴리오 동작을 그대로 옮긴다. 줄 수가 작고 이미 쓰는 기능이다. 저장 오류 안내만 새 오류 코드(`zotero_not_connected`, `payload_too_large`)에 맞게 바꾼다.

**10. 단계별 검증은 API를 가짜로 대신한다.**
Playwright의 요청 가로채기로 `GET /api/papers/{id}`, `/file`, `/memo`, `PUT /memo`를 흉내 낸다. 샘플 PDF는 저장소에 바이너리를 넣지 않고 시험 시작 때 `page.pdf()`로 만든다. 실제 서버와의 통합 확인은 선행 change가 구현된 뒤 마지막 task에서 한 번 한다.

## Risks / Trade-offs

- [pdfjs-dist 6.x가 Node 20 또는 현재 Vite 설정에서 빌드되지 않을 수 있다] → 첫 task에서 의존성만 추가하고 `npm run check`와 `npm run build`를 먼저 통과시킨다. 실패하면 이 change를 멈추고 알린다.
- [Safari, 터치 기기에서만 나타나는 문제를 이 서버에서 확인하지 못한다] → 이식 코드의 폴리오 호환 보강을 그대로 가져오고, 실제 기기 확인은 열린 질문에 둔다. 서버에는 Chromium만 있다.
- [작업 영역 700px 기준이 1280px에서 아슬아슬하다] → 단계 2에서 1280px 분할을 자동 검사하고, 어긋나면 기준값 하나만 조정한다.
- [뷰어를 줄여 옮기다가 폴리오가 고쳐 둔 동작을 지울 수 있다] → 지운 함수 목록을 이식 기록에 남기고, 확대·텍스트 선택·링크 이동은 Playwright로 확인한다.
- [미리보기에서 HTML이 글자로 보이는 차이] → 문서에 남기고 사용자에게 알린다.
- [글꼴이 없는 서버라 스크린샷에 글자가 보이지 않는다] → 글자 존재는 화면 구조(DOM) 검사로 대신한다. 한글 렌더링은 열린 질문에 둔다.

## Migration Plan

새 화면을 추가하는 일이라 데이터 이전이 없다. 되돌리려면 이 change로 추가된 파일과 `package.json`의 두 의존성, `vite.config.ts`의 워커 설정을 되돌린다. 기존 서비스(폴리오·벨루)에는 영향이 없다.

## Open Questions

1. **번역·분석 화면이 받을 쿼리 이름**: 이 change는 `/translate?paperId={id}`, `/analyze?paperId={id}`로 링크한다. `archi-studio-ui-translate-analyze`가 같은 이름을 받아야 한다. 추천은 `paperId`로 통일하는 것이다.
2. **오른쪽 설정 패널에 허브용 내용을 둘지**: 지금 패널은 빈 안내문이다. 추천은 허브에서는 비워 두고, 설정 내용은 `archi-studio-ui-translate-analyze`에서 정하는 것이다.
3. **Safari와 터치 기기 실측**: 서버에는 Chromium뿐이다. 추천은 구현 뒤 사용자가 자기 기기에서 한 번 확인하는 것이다.
4. **한글 글꼴이 있는 환경에서의 화면 확인**: 서버에는 글꼴이 없다. 추천은 Docker 이미지에 글꼴을 넣어 검증하는 일을 `archi-studio-deploy-cutover`에서 다루는 것이다.

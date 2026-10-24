# 논문 허브 이식 기록

change `archi-studio-ui-paper-hub`에서 폴리오(`zotero-folio/web/src`) 코드를 옮긴 기록이다.

## 원문 뷰어 (tasks 1.1~1.3)

| 폴리오 파일 | 이식 위치 | 줄 수(전 → 후) | `: any` 개수 |
| --- | --- | --- | --- |
| `components/PdfViewer.svelte` | `src/lib/components/viewer/PdfViewer.svelte` | 2190 → 459 | 0 |
| `components/PdfPane.svelte` | `src/lib/components/viewer/PdfPane.svelte` | 351 → 227 | 0 |
| `components/HtmlViewer.svelte` | `src/lib/components/viewer/HtmlViewer.svelte` | 255 → 182 | 0 |
| `utils/touch-gestures.js` | `src/lib/viewer/touch-gestures.ts` | 250 → 227 | 0 |
| `utils/safari-polyfills.js` | `src/lib/viewer/safari-polyfills.ts` | 37 → 48 | 0 |
| `utils/pdf-worker-entry.js` | `src/lib/viewer/pdf-worker-entry.ts` | 5 → 5 | 0 |

세는 법: `wc -l`, `grep -c ": any"`.

### 지운 것

- PdfViewer: 하이라이트 전체(목록·생성·삭제·색 팝업·마지막 색 기억), 필기·지우개 전체, 팝업 아래 링크 무력화, 형광펜 복사 버튼, 오류 기술 정보 접기.
- PdfPane: 펜·형광펜·지우개 툴바, 첨부 교체, 뒤로 버튼·제목, 메모 접기 버튼(허브 쪽 책임).
- 폴리오 `api`·스토어 의존.

### 바꾼 것

- pdf.js는 `onMount` 뒤 동적 import한다. `pdf_viewer.mjs`는 불러올 때 `globalThis.pdfjsLib`를 읽으므로 본체를 먼저 불러와 넣는다.
- 폭 맞춤은 스크롤 상자의 좌우 padding만큼 줄인다. pdf.js의 `page-width`가 padding을 포함한 폭에 맞춰 가로 스크롤 16px이 생겼다.
- 복사는 pdf.js 텍스트 레이어의 기본 복사에 맡긴다.
- 색은 `tokens.css` 토큰만 쓴다. HTML 스냅샷 프레임 배경은 `--color-surface`라 다크 모드에서 어둡다.

### 확인 결과

- `npm run check` 오류 0건, `npm test` 332개 통과, `npm run check:tokens` 누락 0건.
- `npm run build` 통과, `window`·`document` 오류 0건.
- 임시 확인 화면(`/dev/viewer`, 커밋 전 삭제)이 있을 때 `grep -rl "pdf.worker" build/client | wc -l` = 3. 뷰어를 쓰는 화면이 없으면 0이다.
- 임시 화면에서 Chromium 확인: PDF 그려짐, 폭 맞춤 가로 스크롤 0, 확대 버튼 100%→115%, HTML 프레임 안 스크립트 실행 안 됨.
- 글꼴 없는 서버라 텍스트 레이어 span 크기가 0이어서 글자 선택·복사는 확인하지 못했다(이식 당시). 아래 "원문 뷰어 연결" 절에서 `FONTCONFIG_FILE`을 걸고 다시 확인해 통과했다.
- 확대 재렌더 중 pdf.js 내부 경고(`injectLinkAnnotations`)가 콘솔에 한 번 찍힌다. 화면 동작에는 영향이 없었다.

## 폴리오 파일별 처리표 (task 4.2)

design.md의 "폴리오 파일별 처리" 표에 있는 파일을 한 줄씩 대조했다. 줄 수는 `wc -l`, `any`는 `grep -c ": any"`로 셌다.

| 폴리오 파일 | 처리 | 이식 위치 | 줄 수(전 → 후) | `: any` | 지운 함수·기능 |
| --- | --- | --- | --- | --- | --- |
| `components/PdfViewer.svelte` | 수정 | `src/lib/components/viewer/PdfViewer.svelte` | 2190 → 459 | 0 | 하이라이트·필기·지우개·색 팝업 전체, 형광펜 복사 버튼, 오류 기술 정보 접기 |
| `components/PdfPane.svelte` | 수정 | `src/lib/components/viewer/PdfPane.svelte` | 351 → 229 | 0 | 펜·형광펜·지우개 툴바, 첨부 교체, 뒤로 버튼·제목, 메모 접기 버튼 |
| `components/HtmlViewer.svelte` | 옮김 | `src/lib/components/viewer/HtmlViewer.svelte` | 255 → 182 | 0 | 폴리오 `api`·스토어 의존 |
| `components/MarkdownNote.svelte` | 수정 | `src/lib/components/memo/MarkdownNote.svelte` | 596 → 526 | 0 | `draftStorageKey`·`loadDraft`(→ `draftKey`·`readDraft`로 바꿈) |
| `components/NoteBottomSheet.svelte` | 수정 | `src/lib/components/memo/NoteBottomSheet.svelte` | 250 → 311 | 0 | 없음(포커스 이동·복귀, `inert`, 분할 칸 모드를 더함) |
| `PaperDetailSplit.svelte` | 새로 작성 | `src/routes/(app)/papers/[id]/+page.svelte` | 폴리오에 없음 → 300 | 0 | 해당 없음(design 표의 이름은 폴리오의 상세 화면 역할을 가리킨다) |
| `utils/touch-gestures.js` | 옮김 | `src/lib/viewer/touch-gestures.ts` | 250 → 227 | 0 | 없음 |
| `utils/safari-polyfills.js` | 옮김 | `src/lib/viewer/safari-polyfills.ts` | 37 → 48 | 0 | 없음 |
| `utils/pdf-worker-entry.js` | 옮김 | `src/lib/viewer/pdf-worker-entry.ts` | 5 → 5 | 0 | 없음 |
| `utils/pdf-highlight.js` | 제외 | - | 154 → 0 | - | 파일 전체 |
| `utils/pdf-ink.js` | 제외 | - | 116 → 0 | - | 파일 전체 |
| `Icon`, `TabBar`, `PaperCard`, `LogoutButton` | 이 change 밖 | 공통 부품(`archi-studio-ui-auth-library`) | - | - | - |

## 원문 뷰어 연결과 허브 검사 (2026-10-24)

- 허브 원문 자리(`DocumentSlot.svelte`)의 임시 패널을 `<PdfPane src={fileUrl} {type} />`로 바꿨다. 첨부 없음 안내는 앱 말투에 맞춰 "첨부된 원문이 없습니다."로 바꿨다.
- `hub-frame`·`hub-a11y`의 옛 임시 패널 문구 검사를 실제 뷰어(새 창 열기 링크 주소, 첨부 없음 문구, 배율 숫자 대비)에 맞췄다.
- 새 `hub-viewer` 묶음: 시험 시작 때 `page.pdf()`로 만든 3쪽 PDF와 HTML을 `page.route`로 `/api/papers/{id}/file`에 준다. 7개 검사 모두 통과.
- 확대 기준점 버그를 고쳤다. 스크롤 상자의 위쪽 padding은 배율과 함께 커지지 않는데 보정식이 이를 넣고 계산해서, 115%에서 기준 표시가 3px 위로 밀렸다. padding을 빼고 계산하게 고친 뒤 변화 0px이다.
- 기준 글자 대신 1쪽에 그린 빨간 사각형을 캔버스 픽셀에서 찾아 위치를 쟀다. 글꼴과 무관하게 잴 수 있어서다.
- 복사: `FONTCONFIG_FILE`을 걸면 텍스트 레이어 span에 크기가 생겨 드래그 선택 문자열이 원문("Middle line for copy check")과 일치했다. 클립보드 붙여넣기는 확인하지 않았고, 선택 문자열(`getSelection`)로 대신했다.
- 알려진 동작: pdf.js가 처음에 1쪽 위 여백만큼(56px) 스크롤해 둔다. 이때 1쪽 맨 윗줄을 드래그하면 Chromium이 스크롤을 0으로 당겨 선택이 빗나갔다. 그래서 복사 검사는 1쪽 가운데 줄로 한다. 사람이 쓸 때 영향이 있는지는 확인하지 못했다.

### 스크린샷 눈 확인 (tasks 2.4, 3.3)

`hub-frame`, `hub-memo`, `hub-a11y`, `hub-viewer`가 남긴 스크린샷(1280px·390px, 라이트·다크)을 열어 봤다. 이번에는 `FONTCONFIG_FILE` 덕에 글자도 보였다.

- 영역 구분: 1280px은 왼쪽 메뉴, 원문(툴바+본문), 구분선, 메모, 오른쪽 설정 패널이 선과 배경색으로 나뉜다. 390px은 위 머리, 원문, 아래 메모 시트 손잡이로 나뉜다.
- 색: 라이트·다크 모두 토큰 색으로 바뀌고, 오류 안내(PDF 파일 404, Zotero 미연결)는 빨간 테두리·배경으로 구분된다. 다크에서 흰 배경이 남은 곳은 없었다. PDF 쪽 자체는 원본이 흰색이라 다크에서도 흰색이다.
- 겹침: 툴바 버튼, 번역·분석 개수, 메모 도구 줄이 서로 겹치지 않았다. 390px 다크에서는 시트 손잡이가 화면 아래에 걸쳐 있고 원문 안내와 겹치지 않았다.
- 메모 미리보기(1280px 라이트·다크): 제목·목록·링크·코드 블록이 서식대로, `<script>`와 `<img onerror>`는 글자로 보였다.
- 390px 메모 미리보기 스크린샷은 따로 찍지 않았다. 390px에서는 시트 손잡이와 편집 영역 윗부분만 보인다.
- `hub-a11y`의 1280px 스크린샷은 파일 응답을 가짜로 주지 않아 원문 자리에 "PDF를 불러오지 못했습니다(404)"가 보인다. 오류 상태의 모양 확인으로 썼다.

## 실제 서버 확인 (task 4.4, 2026-10-24)

`npm run db:start`, 개발 서버(5273)에서 `ui-check-real-…@example.com` 계정을 만들고 SQL로 논문 한 편(첨부 종류 pdf)을 넣어 확인했다. 끝난 뒤 계정을 지웠다(남은 검사 계정 0개).

- `GET /papers/{id}` 서버 응답 200, 허브 제목이 넣은 논문 제목과 같다.
- 번역·분석 링크가 `/translate?paperId={id}`, `/analyze?paperId={id}`이고 눌러서 실제로 이동했다.
- 파일 `GET /api/papers/{id}/file`은 409, 메모 `GET /api/papers/{id}/memo`는 409 `zotero_not_connected`였다. 실제 Zotero 계정이 연결되지 않은 서버라서다.
- 그래서 실제 PDF 표시와 "메모 저장 후 새로고침해도 유지"는 확인하지 못했다. 실제 Zotero 계정으로 다시 확인해야 한다(`archi-studio-paper-notes` 4.2와 같은 조건).

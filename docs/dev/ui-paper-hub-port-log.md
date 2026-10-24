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
- 글꼴 없는 서버라 텍스트 레이어 span 크기가 0이어서 글자 선택·복사는 확인하지 못했다.
- 확대 재렌더 중 pdf.js 내부 경고(`injectLinkAnnotations`)가 콘솔에 한 번 찍힌다. 화면 동작에는 영향이 없었다.

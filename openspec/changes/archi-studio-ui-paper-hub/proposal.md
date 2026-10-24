# Proposal

선행: `archi-studio-ui-auth-library`(공통 화면 부품과 로그인 확인), `archi-studio-papers`(논문 상세·원문 파일 API), `archi-studio-paper-notes`(메모 API)

## Why

Archi Studio가 "흩어진 도구를 하나의 앱으로 통합했다"는 말이 사실이 되려면, 논문 하나를 열면 거기서 원문을 읽고, 메모를 쓰고, 번역·분석으로 넘어가는 한 화면이 있어야 한다. 지금 앱에는 3단 레이아웃 셸과 인증만 있고 화면 내용은 비어 있다. 폴리오(Zotero 논문 관리 앱)에는 이미 동작하는 논문 상세 화면(PDF 뷰어와 메모 편집기)이 있으므로, 이를 새 앱(SvelteKit + TypeScript)으로 다시 쓴다. 이 화면은 데모 흐름(서재 → 논문 → 분석 → 번역 → 메모 → 브리핑)의 중심이다.

## What Changes

세 단계로 나누며, 각 단계는 앞 단계 없이도 혼자 검증할 수 있다.

1. **원문 뷰어**: 논문의 PDF를 pdf.js(PDF를 브라우저에서 그리는 라이브러리)로 보여주고, 확대·축소, 폭 맞춤, 텍스트 선택과 복사, 터치 확대(두 손가락)를 지원한다. HTML 웹페이지 스냅샷은 격리된 iframe(문서 안의 문서)으로 보여준다.
2. **허브 틀**: 주소 `/papers/{id}`에서 논문 상세를 불러와 제목, 원문, 메모 자리, 번역·분석으로 가는 버튼을 배치한다. 넓은 화면은 원문과 메모를 좌우로 나누고(폭 조절 가능), 좁은 화면은 메모를 아래에서 끌어올리는 시트로 둔다.
3. **메모 편집**: 마크다운 메모를 입력하면 자동 저장하고(저장 중·저장됨·오류 표시), 저장 전 초안을 브라우저에 임시 보관하며, 미리보기를 보여준다.

옮기지 않는 것(이번 범위 밖):

- 하이라이트(형광펜)와 필기, 지우개: `design.md` 결정에 따라 뺀다. 폴리오 `PdfViewer.svelte` 2,190줄 중 이 부분과 관련 보조 파일 `pdf-highlight.js`, `pdf-ink.js`는 옮기지 않는다.
- 첨부 파일 교체(PDF 덮어쓰기): 스펙에 없다.
- 홈 대시보드, 검색 화면, 컬렉션 화면, 가이드 화면: 서재 change(`archi-studio-ui-auth-library`)와 다른 범위다.
- 번역·분석 화면 자체: 이 change는 그 화면으로 가는 버튼과 개수 표시까지만 만든다(`archi-studio-ui-translate-analyze`).

## Capabilities

### New Capabilities
- `paper-hub-screen`: 논문 하나의 허브 화면이 보여 주고 지켜야 하는 동작(원문 보기, 메모 편집과 자동 저장, 넓은·좁은 화면 배치, 로딩·오류·빈 상태)을 정의한다.

### Modified Capabilities
<!-- 없음. 화면이 호출하는 서버 동작의 계약은 메인 스펙 `papers`(논문 상세, 원문 파일 제공)와 `paper-notes`(메모 조회·저장·삭제·크기 제한)가 이미 정의하며 이 change는 그 요구사항을 바꾸지 않는다. 화면 배치의 기반은 메인 스펙 `app-shell`이다. -->

## Impact

- 새 의존성: `pdfjs-dist`(PDF 그리기), `marked`(마크다운 미리보기). 미리보기 안전 처리용 라이브러리를 추가할지는 `design.md`의 열린 질문이다.
- 새 파일: `src/routes/(app)/papers/[id]/` 아래 화면, `src/lib/components/` 아래 뷰어·메모 부품, `src/lib/utils/` 아래 터치 제스처와 호환 보강 코드.
- 바뀌는 설정: Vite의 웹 워커 형식(워커는 pdf.js가 PDF 해석을 맡기는 별도 스레드), 서버 렌더링을 끄는 범위.
- 서버(`/api`)는 건드리지 않는다. 선행 change가 구현되기 전에도 이 change의 단계별 검증은 API 응답을 가짜로 대신해(Playwright 요청 가로채기) 진행한다. 실제 API와의 통합 확인은 선행 change가 구현된 뒤 한 번 더 한다.
- 폴리오 코드는 JavaScript이고 새 앱은 TypeScript strict(엄격한 타입 검사)라서 타입을 어디까지 붙일지는 `design.md`에서 정한다.

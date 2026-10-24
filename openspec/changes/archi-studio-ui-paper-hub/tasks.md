# Tasks

화면 검증 명령은 `docs/dev/setup.md`의 화면 검사 절차(Chromium 설치와 `LD_LIBRARY_PATH`)를 따른다. 단계 1~3의 검증은 API 응답을 Playwright로 가짜로 대신하므로 선행 change의 서버 구현이 없어도 진행할 수 있다.

## 1. 원문 뷰어

- [x] 1.1 `pdfjs-dist`는 서버 추출이 이미 쓰는 `5.6.205`를 그대로 쓰고(6은 Node 22.13 이상이 필요해 현재 Node 20에서 쓸 수 없다) `marked@^18`은 이미 추가되어 있으며, `safari-polyfills.ts`, `pdf-worker-entry.ts`를 옮기며 `vite.config.ts`에 `worker.format = 'es'`를 넣은 뒤, `npm run check`가 오류 0건이고 `npm run build`가 서버 렌더링 중 `window`·`document` 오류 없이 끝나며 `grep -rl "pdf.worker" build/client | wc -l`이 1 이상인지 확인한다(Node 20). 실패하면 원인을 기록하고 이 change를 멈춘다
- [x] 1.2 `PdfViewer.svelte`의 핵심(불러오기, 렌더링, 폭 맞춤, 글자 위치 교정, 링크 이동과 뒤로, 복사)을 TypeScript로 옮기고 `pdfjs-dist`는 화면에 붙은 뒤 동적으로 불러오게 한다. `grep -nEi "highlight|ink|eraser" src/lib/components/PdfViewer.svelte | wc -l`이 0이고 `npm run check`가 오류 0건이며, 이식 뒤 줄 수와 `: any` 개수를 `wc -l`, `grep -c`로 세어 기록한다
- [x] 1.3 `PdfPane.svelte`(확대 툴바, Ctrl/Cmd+휠 확대, 확대 지점 고정 스크롤 보정), `HtmlViewer.svelte`(`sandbox="allow-same-origin"`), `touch-gestures.ts`를 옮긴다. 배율 상태는 `PdfPane`만 갖고 뷰어는 받아 쓰는지 코드로 확인하고, `grep -nE "penMode|eraser|replaceAttachment" src/lib/components/*.svelte | wc -l`이 0이며 `npm run check`가 오류 0건이다
- [ ] 1.4 `src/routes/(app)/papers/[id]/+page.svelte`에 원문 패널만 그리는 최소 화면을 만든다(상세 조회로 `attachment.type`을 읽어 PDF 또는 HTML 뷰어를 고른다). `npm run build`가 통과하고 `GET /papers/anything`의 서버 렌더링 응답이 200이다
- [ ] 1.5 `scripts/ui-screens.mjs`에 허브 검사 묶음(`hub-viewer`)을 더하고(기존 `loggedInContext`, `mockApi` 재사용) 검사한다. 검사: 3쪽 PDF(시험 시작 때 `page.pdf()`로 생성)가 첫 쪽부터 그려짐, 폭 맞춤에서 가로 스크롤 0, 확대 버튼으로 배율 증가, 확대 전후 기준 글자의 화면 세로 위치 변화 2px 이하, 글자 드래그 뒤 복사한 문자열이 원문과 일치, HTML 첨부가 `sandbox` 속성이 있는 프레임으로 열리고 그 안의 `<script>`가 실행되지 않음, 첨부 없음 안내. 모두 통과하고 종료 코드가 0이다

## 2. 허브 틀

- [x] 2.1 허브가 `GET /api/papers/{id}` 로딩 표시, 404 `paper_not_found` 안내와 서재 링크, 네트워크·500 오류의 "다시 시도" 버튼을 갖게 한다. 가짜 응답으로 세 경우가 각각 기대한 문구와 동작을 보이는지 `hub-frame` 묶음으로 확인한다
- [x] 2.2 작업 영역 폭을 `ResizeObserver`로 재서 700px 이상이면 원문·메모 좌우 분할(구분선 드래그, 메모 최소 320px, 원문 최소 360px), 미만이면 시트로 전환하게 하고 `NoteBottomSheet.svelte`를 셸의 포커스 이동·복귀·`inert` 규칙에 맞춰 옮긴다. 브라우저 폭 1280px(작업 영역 약 720px)에서 분할, 390px에서 시트이며 가로 스크롤 0, 폭을 줄여도 원문 배율과 입력 중인 글자가 유지되는지 `hub-frame` 묶음으로 확인한다
- [x] 2.3 번역·분석 버튼과 `translationCount`, `analysisCount` 표시를 만들고 각각 `/translate?paperId={id}`, `/analyze?paperId={id}`로 가는 링크인지, 번역 3·분석 1인 가짜 응답에서 숫자가 3과 1로 보이는지 `hub-frame` 묶음으로 확인한다
- [ ] 2.4 `hub-frame` 묶음 전체가 통과하고 1280px, 390px 라이트·다크 스크린샷을 스크래치패드에 저장해 눈으로 확인한 결과(영역 구분, 색, 겹침)를 `docs/dev/ui-paper-hub-port-log.md`에 적는다. 글꼴이 없는 서버라 글자는 보이지 않으니 글자 존재는 구조 검사로 대신했음을 함께 적는다

## 3. 메모

- [ ] 3.1 `MarkdownNote.svelte`를 옮긴다(자동 높이와 스크롤 보존, 상태 표시, `.md` 불러오기·내려받기, 초안 `sessionStorage` 키 `archi:memo-draft:{id}`). `npm run check`가 오류 0건이고 `hub-memo` 묶음에서 긴 메모(200줄) 중간에서 줄바꿈을 입력해도 편집 중인 줄이 화면 안에 남는지 확인한다
- [ ] 3.2 메모를 `GET /api/papers/{id}/memo`로 채우고 입력 0.9초 뒤 `PUT`을 한 번만 보내게 한 다음 오류 안내를 붙인다(409 `zotero_not_connected`, 413 `payload_too_large`, 네트워크 실패와 "다시 시도"). `hub-memo` 묶음에서 0.5초 간격 연속 입력은 `PUT` 0회, 입력 후 1초 정지는 정확히 1회, 세 오류 각각의 안내 문구와 입력 내용 유지, 성공 뒤 초안 삭제, 다른 논문에 갔다가 돌아오면 초안 복원이 모두 통과한다
- [ ] 3.3 미리보기의 원본 HTML을 글자로 이스케이프한다. `hub-memo` 묶음 전체가 통과해야 한다: `<script>alert(1)</script>`와 `<img src=x onerror=...>`가 든 메모가 실행되지 않고(대화상자 0, 전역 표시 변수 미설정) 글자로 보이며 제목·목록·링크·코드 블록은 서식대로 보인다. 메모 영역 스크린샷(라이트·다크, 1280px, 390px)을 눈으로 확인한 결과를 `docs/dev/ui-paper-hub-port-log.md`에 적는다

> 진행 기록(2026-10-24): 3.1~3.3의 화면 동작은 `hub-memo` 묶음에서 가짜 응답으로 모두 통과했다(불러오기, 0.9초 뒤 PUT 1번, 409·413·네트워크·401 안내와 입력 유지, 초안 삭제·복원, 200줄 메모 줄바꿈, 미리보기 이스케이프). 그래도 체크하지 않았다. 메모 API(`archi-studio-paper-notes`)가 아직 서버에 없어 실제 응답으로 확인하지 못했고, 3.3의 스크린샷 눈 확인 기록(`ui-paper-hub-port-log.md`)도 아직 쓰지 않았다. 2.2의 "원문 배율 유지"는 뷰어가 아직 붙지 않아, 원문 자리 요소가 분할·시트 전환에도 다시 만들어지지 않는지로 대신 확인했다.

## 4. 마무리

- [ ] 4.1 접근성을 확인한다: 시트 열림 시 포커스가 시트 안으로 가고 Escape·배경 클릭·닫기 버튼으로 닫히면 연 손잡이로 돌아오며 열린 동안 배경이 `inert`, 모든 아이콘 버튼에 접근 가능한 이름, 구분선이 키보드(좌우 화살표)로 조절됨을 `hub-a11y` 묶음로 확인한다. 새로 쓴 글자색의 대비를 계산해 모두 4.5:1 이상이고 `grep -rn "text-faint" src/lib/components src/routes | wc -l`이 0이다
- [ ] 4.2 `docs/dev/ui-paper-hub-port-log.md`에 폴리오 파일별 처리표(옮김·수정·제외, 줄 수 변화, 지운 함수 목록, `any` 개수)를 정리하고 `docs/dev/setup.md`의 화면 검사 표에 허브 묶음을 추가한다. 표의 모든 폴리오 파일이 한 줄씩 있는지 대조한다
- [ ] 4.3 `npm run check`, `npm test`, `npm run build`, `npm run check:tokens`, `node scripts/ui-screens.mjs`의 허브 묶음 전부, `openspec validate archi-studio-ui-paper-hub --strict`, `openspec validate --specs --strict`가 모두 통과한다. `git status`에 `.env` 계열 파일이 추적 대상으로 없다
- [ ] 4.4 (선행 `archi-studio-papers`, `archi-studio-paper-notes`, `archi-studio-zotero-connection`이 구현된 뒤에만) `npm run db:start`로 로컬 DB를 올리고 실제 서버에서 논문 한 편을 열어 PDF 표시, 메모 저장 후 새로고침해도 유지, 번역·분석 링크 이동을 확인한 결과를 `docs/dev/ui-paper-hub-port-log.md`에 적고 `npm run db:stop`으로 내린다. 선행이 아직 없으면 이 task는 건너뛰고 이유를 적는다

## Workflow follow-up

- 구현이 끝나면 `/opsx:archive`로 보관해 메인 스펙 `paper-hub-screen`에 합친다.
- 열린 질문 4개(`design.md`)는 구현에 영향이 없다. 쿼리 이름 `paperId`는 `archi-studio-ui-translate-analyze`와 맞춰야 한다.

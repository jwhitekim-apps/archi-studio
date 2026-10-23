# Proposal

선행: `archi-studio-papers`(서재 API), `archi-studio-zotero-connection`(Zotero 연결 API)

## Why

지금 앱에는 3열 셸(왼쪽 메뉴, 가운데 작업 영역, 오른쪽 설정 패널)과 디자인 토큰만 있고 화면 내용이 비어 있다. 로그인 API는 이미 있지만 쓸 화면이 없어서 사용자가 앱에 들어올 방법이 없다. 이후 모든 화면(논문 허브, 번역, 분석, 브리핑)이 같은 버튼·입력창·상태 표시를 쓰도록, 공통 부품과 첫 화면 두 개(로그인·가입, 서재)를 먼저 만들어 기준을 세운다.

## What Changes

- **공통 UI 부품**을 만든다: 버튼, 입력창, 카드, 탭, 사이드바 메뉴 항목, 상태 패널(로딩·빈 상태·오류), 알림 줄, 확인 대화상자, 스트리밍 출력 영역, 아이콘. 모두 토큰만 쓰고, 다른 화면 change가 가져다 쓴다.
- **로그인·가입 화면**을 만든다: 이메일과 비밀번호, 가입 뒤 "승인 대기" 안내, 오류별 안내, 로그인 뒤 원래 가려던 주소로 복귀, 세션 만료 시 로그인 화면으로 이동, 로그아웃.
- **서재 화면**을 만든다: 논문 목록, 검색, 컬렉션 필터, 더 보기(다음 페이지), Zotero 연결 안내와 동기화, 웹페이지 추가, 논문 삭제(확인 포함). 논문을 누르면 논문 허브 주소(`/papers/{id}`)로 이동만 하고, 허브 화면 자체는 다른 change 몫이다.
- 작은 **설정 화면(`/settings`)**을 만든다: Zotero 연결 상태, 연결 해제, 연결이 거부되었을 때의 안내. Zotero 연결 스펙이 "거부되면 설정 화면으로 보낸다"고 정했기 때문이다.
- 앱 구조를 둘로 나눈다: 셸이 없는 로그인·가입 화면 묶음과, 셸이 있는 로그인 후 화면 묶음.
- 서버 응답을 부르는 얇은 호출 도구(`fetch` 래퍼)를 만든다. 오류 형식(`{error:{code,message}}`)을 한 곳에서 해석하고 401이면 로그인 화면으로 보낸다.
- 새 의존성은 추가하지 않는다. 아이콘은 직접 그린 작은 SVG 묶음으로 쓴다.

### 기존 앱에서 옮기지 않는 것

- 폴리오의 표지 보기(생성된 표지 카드), 홈 대시보드, 사용 가이드 화면, Cmd+K 검색 단축키.
- 폴리오 목록의 연도순·이름순 정렬. 서버가 최근 동기화 순만 돌려주고 페이지로 나뉘어 있어서, 불러온 일부만 정렬하면 오해를 줄 수 있다(Open Questions 참고).
- 벨루의 사용자명 로그인, 언어 전환(한국어만), 랜딩 페이지. Archi Studio는 이메일 로그인이고 한국어 단일이다.

## Capabilities

### New Capabilities
- `ui-foundation`: 모든 화면이 공유하는 UI 부품의 동작 계약(토큰만 사용, 키보드 조작, 상태 표시, 확인 대화상자, 스트리밍 출력 영역).
- `auth-screens`: 로그인·가입 화면과 로그인 상태 유지, 만료·로그아웃 처리, 이동 주소 안전 검사.
- `library-screen`: 서재 화면(목록, 검색, 컬렉션, 동기화, 웹페이지 추가, 삭제)과 Zotero 연결 설정 화면.

### Modified Capabilities

(없음. 메인 스펙 `app-shell`의 요구사항은 바뀌지 않고, 셸 위에 화면 내용을 얹는다. 계약이 되는 API 스펙은 `auth`, `papers`, `zotero-connection`이다.)

## Impact

- 새 코드: `src/lib/components/ui/`(공통 부품), `src/lib/api/`(호출 도구와 타입), `src/routes/(auth)/`(로그인·가입), `src/routes/(app)/`(서재, 설정), 화면 검증 스크립트.
- 바뀌는 코드: `src/routes/+layout.svelte`(셸을 `(app)` 묶음 안으로 이동), `src/lib/components/AppShell.svelte`(메뉴 항목을 실제 링크로), `src/routes/+page.svelte`(서재로 보내는 시작 주소).
- API: 새로 만들거나 바꾸는 API는 없다. 기존 `/api/auth/*`, `/api/papers*`, `/api/collections`, `/api/zotero/*`를 부르기만 한다.
- 검증: 서재 화면은 선행 change가 끝나기 전에도 Playwright로 서버 응답을 흉내 내어(`page.route`) 확인한다. 로그인·가입 화면은 로컬 Supabase의 실제 인증 API로 확인한다.
- 참고 구현(읽기 전용): 폴리오 `web/src/pages/`(LoginPage, PapersList, Collections, SearchPapers)와 `web/src/components/`(PaperCard, TabBar, Icon), 벨루 `web/src/pages/LoginPage.tsx`와 `shared/components/`(StatePanel, SessionExpiredMessage, PageHeader).

# Design

## Context

- 새 앱의 화면은 지금 셸(`AppShell.svelte`)과 빈 홈 페이지뿐이다. 오른쪽 패널은 고정 안내문을 그리고, 화면이 패널에 내용을 넣을 방법이 없다. `hasPanel`(패널을 보일지)만 `page.data`로 받는다.
- 벨루의 번역 화면은 `fetch`로 `text/plain` 스트림을 읽고(`getReader` + `TextDecoder`), 입력 300ms 뒤 자동 번역하며, 새 요청이 이전 요청을 취소한다. 벨루의 분석 화면은 후보 검색, URL·PDF 업로드, 저자 카드까지 갖춘 큰 화면이지만 새 API는 "내 논문 하나의 요약과 저널 점수"만 약속한다(`legacy-map.md` 5, 6번).
- `Analysis` 응답은 `{ paperId, summary, journalScore(자유 형식 객체) }`이고 세부 필드는 `archi-studio-paper-analysis`가 확정한다(`openapi.yaml`이 "구현 전에 보완한다"고 적고 있다).
- 이 서버에서 Chromium을 돌리려면 시스템 라이브러리를 `LD_LIBRARY_PATH`로 지정해야 한다(`docs/dev/setup.md`).
- 선행 change(`archi-studio-translation`, `archi-studio-paper-analysis`, `archi-studio-ui-auth-library`)가 아직 구현되지 않았을 수 있다. 그래서 화면은 가짜 API로 먼저 검증하고, 마지막에 실제 API로 확인한다.

## Goals / Non-Goals

**Goals:**
- 번역·분석 화면이 "입력 → 실행 → 결과" 흐름으로 동작하고, 모든 실패 상태(세션 만료, 입력 거부, 서버 오류, 연결 끊김, 자료 없음)에서 입력을 잃지 않는다.
- 화면 코드가 백엔드 구현 없이도 자동으로 검증된다(스트림 단위 테스트, 가짜 서버 + 브라우저 검사).
- 분석 결과 필드가 나중에 정해져도 화면이 깨지지 않는다.

**Non-Goals:**
- 서재, 논문 허브, 메모, 브리핑 화면, 로그인·가입 화면, 공통 버튼·입력 부품(`archi-studio-ui-auth-library`와 `archi-studio-ui-paper-hub`, `archi-studio-ui-briefing` 몫).
- 번역·분석 API 자체와 AI 호출(`archi-studio-translation`, `archi-studio-paper-analysis`, `archi-studio-ai-provider` 몫).
- PDF에서 선택한 글을 바로 번역하는 기능, 단어장, 번역 내보내기.
- 화면 문구의 다국어 지원.

## Decisions

**1. 두 화면은 브라우저에서 직접 `/api`를 부르고, 서버 렌더링을 끈다.**
`src/routes/translate/+page.ts`와 `src/routes/analyze/+page.ts`에 `export const ssr = false`를 둔다. 세션 쿠키는 같은 출처 요청에 자동으로 실리고, 스트림은 브라우저가 읽는 게 가장 단순하다. 자동 번역 설정을 브라우저 저장소에서 읽기 때문에 서버 렌더링을 켜면 화면이 서버와 브라우저에서 달라진다. 대안은 SvelteKit `load`와 폼 액션인데, 스트리밍 결과를 점진적으로 보여주기 어렵다. 대가는 첫 화면이 자바스크립트가 뜬 뒤에 나타나는 것이지만 로그인한 사용자용 도구 화면이라 괜찮다.

**2. 스트림 읽기는 `fetch` + `getReader` + `TextDecoder({ stream: true })`로 직접 한다.**
`src/lib/client/translate-stream.ts`가 `AbortController`를 받아 청크마다 콜백을 부른다. `stream: true`가 한글처럼 여러 바이트인 글자가 청크 경계에서 쪼개져도 이어 붙여 준다. 실패는 `ApiError`(상태 코드와 `error.code`)와 `StreamInterrupted`(받은 부분 글자 포함)로 구분해 화면이 상태별 안내를 고르게 한다. 대안인 SSE(`EventSource`)는 서버가 쓰지 않는 방식이고(`text/plain` 청크, `openapi.yaml`), 웹소켓은 과하다.

**3. 401은 화면에서 안내만 하고 자동으로 이동하지 않는다.**
벨루는 401을 받으면 로그인 화면으로 바로 보냈다. 새 화면은 입력한 글과 결과를 잃지 않으려고 안내와 로그인 링크만 보여준다. 로그인 화면 주소와 되돌아오기 쿼리 이름은 `archi-studio-ui-auth-library`가 정하므로 적용할 때 확인한다.

**4. 설정 패널 슬롯은 Svelte 컨텍스트로 만든다.**
`src/lib/components/panel-slot.svelte.ts`에서 `content`(스니펫) 하나를 가진 상태 객체를 만들고 루트 레이아웃이 `AppShell`에 `slot` 속성으로 넘긴다. 화면은 `<PanelContent>` 컴포넌트로 자기 스니펫을 등록하고, 화면이 사라질 때 자기가 등록한 것일 때만 지운다(A→B 이동에서 B의 등록이 A의 정리에 지워지는 경쟁 상태 방지). 슬롯이 비면 `AppShell`은 기존 안내문을 보여준다. 대안은 화면 그룹마다 `+layout.svelte`를 두고 패널을 직접 넘기는 방식인데, 번역과 분석이 서로 다른 설정을 가지는 만큼 레이아웃이 늘어난다. `AppShell`은 다른 UI change도 고칠 수 있으므로 적용할 때 현재 파일을 다시 읽고 `slot` 속성 하나만 더한다.

**5. 자동 번역은 기본 꺼짐으로 한다.**
벨루는 입력이 멈추면 자동으로 번역했다. 새 API는 완료된 번역마다 이력 행을 저장하고(같은 문장도 다른 논문이면 새 행) AI를 호출하므로, 기본 켜짐이면 입력 도중의 미완성 문장이 이력과 비용을 채운다. 켜면 벨루처럼 300ms 뒤 실행하고 이전 요청은 취소한다. 선택은 브라우저 저장소에 저장한다(저장소를 못 쓰면 기본값).

**6. 이력은 서버에서 받은 목록을 화면에서 20개씩 자른다.**
`GET /api/translate/history`에는 `limit`이나 `cursor`가 없다. 화면은 받은 목록을 최신순으로 20개만 보이고 "더 보기"로 20개씩 펼친다. 이력이 많아지면 응답이 커지는 문제는 열린 질문에 적는다.

**7. 논문 선택기는 이 change 안에 최소한으로 만든다.**
`PaperPicker.svelte`가 검색 입력(300ms), `GET /api/papers?query=&limit=20`, 키보드로 고를 수 있는 목록을 가진다. `archi-studio-ui-auth-library`의 서재 부품과 겹치면 적용할 때 줄 모양만 재사용하고 서재 화면 전체에는 의존하지 않는다. 선택기를 별도 change로 빼면 분석 화면이 다른 change를 하나 더 기다리게 된다.

**8. 분석 결과는 "요약 + 이름·값 목록"으로 일반화해 보여준다.**
`summary`는 줄바꿈을 보존한 본문으로, `journalScore`는 `dl`(이름·값 목록)로 보인다. 키 `quartile`이 `Q1`~`Q4`이면 등급 배지로 강조하고(색은 토큰으로만), 알려진 키(`sjr`, `type`, `country`, `matched_title` 등 벨루 `quality` 필드)에는 한국어 이름표를 붙이고 모르는 키는 이름 그대로 보여준다. 값이 객체나 배열이면 JSON 문자열로 보인다. 필드가 정해지면 이름표 표만 고치면 된다.

**9. 화면 검증은 가짜 API 서버로 한다.**
`scripts/fake-api.mjs`(Node 내장 `http`)가 `openapi.yaml` 모양의 응답을 준다. 번역은 청크 사이에 지연을 두어 스트림 도중 상태를 관찰할 수 있게 한다. 상황은 제어용 `POST /__mode`로 엔드포인트별로 바꾼다(정상, 느린 스트림, 한글 청크 분할, 401, 400, 413, 404, 500, 중간 끊김, 분석 없음·422·빈 점수). 개발 서버는 환경 변수 `ARCHI_API_TARGET`이 있을 때만 `/api`를 가짜 서버로 프록시한다(`vite.config.ts`). Playwright의 `route.fulfill`은 응답을 청크로 나눠 보낼 수 없어서 쓰지 않는다. 프록시가 `hooks.server.ts`의 API 가드보다 먼저 요청을 가로채는지는 첫 task에서 `curl`로 확인하고, 아니면 가짜 서버가 빌드 산출물을 함께 제공하는 방식으로 바꾼다.

**10. 화면 문구는 화면별 모듈에 모은다.**
`src/lib/messages/translate.ts`, `analyze.ts`에 한국어 문구를 상수로 모은다. 다국어 라이브러리는 쓰지 않는다. 브라우저 검사 스크립트는 문구를 상수가 아니라 리터럴로 비교해 문구가 바뀌면 검사가 알려 주게 한다.

**11. 주소 약속.**
`/translate`, `/translate?paperId=<uuid>`, `/analyze`, `/analyze?paperId=<uuid>`. 형식이 UUID가 아닌 `paperId`는 API를 부르지 않고 "논문을 찾을 수 없음"과 같게 처리한다. 논문 허브에서 이 주소로 가는 링크는 `archi-studio-ui-paper-hub`가 만들고, 메뉴 링크는 `archi-studio-ui-auth-library`가 만든다. 적용할 때 두 링크가 있는지 확인하고 없으면 이 change에서 최소 링크만 더한다.

## Risks / Trade-offs

- [선행 백엔드가 아직 없어 화면이 실제 응답과 어긋날 수 있다] → 가짜 서버는 `openapi.yaml` 응답 모양만 따르고, 마지막 task에서 로컬 DB와 실제 API로 한 번 더 확인한다.
- [분석 응답 필드가 바뀌면 표시가 깨질 수 있다] → 결정 8의 일반화된 표시로 흡수하고, 필드 확정 뒤 이름표 표만 고친다.
- [`AppShell`을 여러 change가 고친다] → 적용 순서가 직렬이므로 매번 현재 파일을 읽고 속성 하나만 추가한다. 셸 검사 스크립트(`scripts/shell-screens.mjs`)가 계속 통과해야 한다.
- [스트림 중간 끊김 때 서버가 부분 번역을 저장하는지 알 수 없다] → 스펙은 "완료 후 이력에 저장"이므로 화면은 성공했을 때만 이력을 다시 불러온다.
- [서버 렌더링을 끄면 첫 화면이 늦다] → 로그인 뒤의 도구 화면이고 데이터 요청이 어차피 브라우저에서 시작되므로 받아들인다.
- [가짜 서버 + Playwright 검사는 이 서버 환경(시스템 라이브러리)에 기대고 있다] → `docs/dev/setup.md`의 절차를 따르고, 안 되면 스트림 단위 테스트와 API 클라이언트 단위 테스트까지만 필수로 한다.

## Migration Plan

새 파일과 `AppShell` 속성 하나, 개발 프록시 설정만 더하는 추가형 변경이다. 되돌리려면 새 route·컴포넌트 파일을 지우고 `AppShell.svelte`와 `vite.config.ts`의 변경을 되돌리면 된다.

## Open Questions

1. **자동 번역 기본값**: 꺼짐으로 정했다(결정 5). 벨루처럼 켜짐으로 바꿀지는 사용해 본 뒤 정해도 된다. 추천은 꺼짐 유지.
2. **분석 응답 필드**: `archi-studio-paper-analysis`가 `journalScore`의 키(분위, SJR 등)와 `summary`의 형식(줄바꿈, 마크다운 여부)을 정하면 이름표 표를 맞춘다. 추천은 키가 정해지는 대로 표만 갱신하는 것.
3. **번역 이력 크기**: `GET /api/translate/history`에 `limit`(기본 50)을 `archi-studio-translation`에서 추가하도록 권한다. 추천은 추가하는 것. 이 화면은 어느 쪽이든 20개씩 자른다.
4. **로그인 화면 주소와 되돌아오기 쿼리 이름**: `archi-studio-ui-auth-library`가 정한다. 적용할 때 맞춘다.
5. **AI 사용 원칙(TODO 5절 3번)**: 번역·분석 화면에 "외부 AI로 전송됩니다" 같은 안내를 둘지는 원칙이 정해진 뒤 결정한다. 추천은 이번 change에서는 두지 않는 것.
6. **분석 다시 하기**: 지금 API는 저장된 결과가 있으면 새로 분석하지 않는다. 사용자가 일부러 다시 분석하고 싶어 할 수 있으나 스펙에 없다. 필요해지면 `paper-analysis`에 강제 재분석을 더한다. 추천은 지금은 없이 가는 것.

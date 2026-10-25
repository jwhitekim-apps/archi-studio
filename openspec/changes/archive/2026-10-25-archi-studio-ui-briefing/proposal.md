# Proposal

선행: `archi-studio-briefing`(브리핑 읽기 API), `archi-studio-papers`(논문 제목 조회 API), `archi-studio-ui-auth-library`(공통 화면 부품과 로그인 흐름)

## Why

비서(morning-desk, 하루 한 번 도는 크론 프로그램)가 만든 브리핑은 `briefing-store` change가 끝나면 DB에 쌓이고, `archi-studio-briefing` change가 끝나면 API(`GET /api/briefings`)로 읽을 수 있다. 하지만 앱에는 그 기록을 볼 화면이 없다. 지금 앱에는 왼쪽 메뉴의 "브리핑" 글자만 있고 눌러도 갈 곳이 없다.

데모의 마지막 장면("서재 → 논문 → 분석 → 번역 → 메모 → 브리핑")이 이 화면이고, "비서까지 한 앱으로 통합했다"는 말이 사실이 되려면 브리핑을 앱 안에서 읽을 수 있어야 한다. 카톡 알림에도 이 화면으로 가는 링크가 들어간다.

## What Changes

- 브리핑 **목록 화면**(`/log`): 최신순으로 날짜와 요약을 보여 주고, 더 오래된 것은 "더 보기"로 이어서 불러온다.
- 브리핑 **상세 화면**(`/log/{id}`): 본문 전체와, 그 브리핑이 언급한 논문의 링크를 보여 준다. 논문 링크를 누르면 논문 허브(`/papers/{논문 id}`)로 이동한다.
- 상태별 화면: 브리핑이 하나도 없을 때의 **빈 상태**, 불러오지 못했을 때의 **오류 상태**(다시 시도 버튼 포함), 로그인이 풀렸을 때의 로그인 이동, 없는 브리핑 주소의 "찾을 수 없음".
- 읽기 전용: 만들기, 수정, 삭제 버튼을 두지 않는다. 브리핑 생성은 앱 밖(비서)이 맡는다.
- 본문은 **글자 그대로** 보여 준다. 브리핑에는 메일·GitHub 제목처럼 바깥에서 온 글이 섞일 수 있어서, 본문 안의 HTML이나 스크립트는 해석하지 않는다.
- 왼쪽 메뉴의 "브리핑" 항목을 `/log`로 연결한다. 오른쪽 설정 패널은 이 화면에 필요 없으므로 접는다(`app-shell` 스펙의 "설정 패널이 필요 없는 화면").
- 카톡 알림의 링크가 쓸 수 있도록 상세 주소 형식(`/log/{id}`)을 안정된 계약으로 정한다. 링크를 만드는 쪽은 `briefing-store`다.
- **범위 밖**: 브리핑을 만들고 저장하는 일(`briefing-store`), 브리핑 API 자체(`archi-studio-briefing`), 논문 허브 화면(`archi-studio-ui-paper-hub`), 검색·필터·읽음 표시, 본문의 마크다운 꾸밈(열린 질문 참고).

## Capabilities

### New Capabilities
- `briefing-screen`: 브리핑 목록과 상세를 화면에서 읽는 동작. 주소, 목록 정렬과 이어 불러오기, 빈 상태와 오류 상태, 본문 표시 안전 규칙, 논문 링크 이동을 정한다.

### Modified Capabilities
<!-- 없음. 브리핑 API 계약(`briefing`)과 3단 셸(`app-shell`)의 요구사항은 그대로다. 화면이 그 계약을 사용만 한다. -->

## Impact

- 코드(새로 만듦): `src/routes/log/`(목록)와 `src/routes/log/[id]/`(상세) 화면과 데이터 불러오기, 브리핑 전용 작은 부품(목록 항목, 본문 영역).
- 코드(고침): `src/lib/components/AppShell.svelte`의 메뉴 항목이 `/log`를 가리키게 한다. 메뉴 항목 전체의 주소 연결은 `archi-studio-ui-auth-library`가 먼저 정리하므로, 이미 연결돼 있으면 확인만 한다.
- 재사용: `archi-studio-ui-auth-library`가 만드는 공통 부품(카드, 빈 상태, 오류 안내, 버튼).
- API: 새로 만들지 않는다. `GET /api/briefings`, `GET /api/briefings/{id}`를 읽기만 한다.
- 시험: 로컬 DB에 시험용 브리핑을 SQL로 넣고 Playwright(브라우저 자동 조작 도구, 이미 devDependency)로 화면을 확인한다. 새 의존성은 없다.
- 문서: `docs/dev/setup.md`에 이 화면의 시험 데이터 넣는 방법을 추가한다.
- 순서 주의: 논문 링크의 도착지(`/papers/{id}`)는 `archi-studio-ui-paper-hub`가 만든다. 그 전에 이 change를 먼저 구현하면 링크는 걸리지만 도착지는 아직 없다(`design.md` 결정 6).

# Archi Studio 인수인계 (2026-10-17)

새 세션에서 이어가기 위한 문서다. 이 파일을 먼저 읽고, 아래 "시작 프롬프트"를 붙여 넣는다.
비밀값(키, 토큰, 비밀번호)은 이 문서에 없다. 새 저장소에 복사할 때는 공개 여부를 먼저 정한다.

## 1. 시작 프롬프트 (붙여넣기용)

```
나는 대학원 생활에서 필요해서 따로따로 만든 연구 도구 3개(Veloo, Folio, morning-desk 비서)를
'Archi Studio'라는 하나의 큰 앱으로 통합하려고 한다. 11월 24일 소프트컴퓨팅 세미나에서
"흩어져 있던 도구를 하나의 앱으로 통합했다"로 데모할 예정이다.
먼저 ARCHI-STUDIO-HANDOFF.md를 읽어라. 결정된 것은 다시 묻지 말고, "열린 질문"만 나에게 물어라.
첫 작업은 새 저장소의 AGENTS.md(짧게), 디자인 시스템 초안, 명세(OpenSpec) 순서다.
답변은 한국어로 짧게, 결론부터 쓴다. 사용량 비용은 내가 부담하니 한 번에 한 작업씩 하고,
끝날 때마다 커밋과 기록으로 상태를 파일에 남겨라.
```

## 2. 목표와 확정된 결정

- **이름**: Archi Studio. 도구 이름 예시: Archi Note(메모), Archi Log(브리핑·이력). 앱은 하나, 이름은 통일.
- **방식**: 새 저장소를 만들어 하나의 앱으로 통합한다. 엔드포인트도 새로 설계한다.
- **스택**: SvelteKit + TypeScript 기준. (폴리오가 이미 Svelte이고 비서가 TypeScript. 옮길 것은 벨루의 Python과 React.)
- **디자인**: Google AI Studio식 3단 구성(왼쪽 메뉴, 가운데 작업 영역, 오른쪽 설정 패널). 직접 화면을 보지 못했고(로그인 필요), 구글 로고와 자산은 쓰지 않는다. 디자인 시스템(토큰, 공통 부품)도 하나로 통합한다.
- **참고 모델**: pdf24 Tools처럼 "하나의 정체성 아래 여러 도구". (pdf24 주소는 `/{언어}/{도구이름}` 평평한 구조, 홈은 카드 목록이다. 확인함.)
- **데모 이야기**: 흩어진 도구(프로젝트 3개, 로그인 3개, 언어 3개) → 한 앱. 흐름은 서재 → 논문 페이지 → 분석 → 번역 → 메모 → 브리핑. "통합"이 사실이 되려면 로그인, 메뉴, 논문 데이터가 정말 하나여야 한다.
- **일정**(발표일 11/24는 "인가"라고 했으므로 확정 여부를 다시 확인): ~10/31 명세(2주), ~11/17 이식, ~11/24 기능 동결과 리허설.
- **비용 원칙**: 사용량 비용은 사용자가 부담한다. 시간을 들여 사용량이 갱신될 때마다 조금씩 이어간다. 상태는 파일에 남기고, 한 작업씩 끝낼 때마다 커밋한다. 긴 대화보다 새 세션, fork와 긴 보고는 피한다.

## 3. 현재 프로젝트 현황 (읽기 조사 결과)

경로는 모두 `/Users/joon/CODINGPROJECT/computing-seminar /` 아래.

| 프로젝트 | 스택 | 기능 | 데이터 | 비고 |
|---|---|---|---|---|
| Veloo (`veloo/veloo.2joon.com`) | Python 3.11 FastAPI, React 18 + TS + Vite(PWA) | Paper Analyzer(요약·저널 점수), Translator(영→한 스트리밍), Contextor(용어 설명), Model Review(구조도 채점) | Supabase: `users`, `sessions`, `paper_history`, `translation_history`, `arch_history`, `contextor_history` | 자체 로그인(사용자명·비밀번호, 세션 쿠키, 수동 승인 베타), 외부 상용 AI(Claude, Gemini 교체 가능), Docker + Cloudflare Tunnel + GitHub Actions(SSH), 약 6,200줄. Plan 기능은 2026-10-11에 제거(To Do로 이전) |
| Folio (`zotero-folio`) | Node(Express) + Svelte(Vite), pdf.js | 논문 목록·검색, 컬렉션, 메모(Zotero child note, 자동 저장), PDF 뷰어, Zotero 동기화 | Supabase: `folio_users`(Zotero 토큰), `folio_papers`, `folio_sync_state` | Zotero OAuth1, 서버가 service_role 키 사용, Docker(포트 3002), 약 2,500줄 + Svelte. 별도 `zotero-folio-agent`(Python 약 3,400줄, 설계 단계, 학술 API로 조사하는 에이전트) |
| morning-desk (비서) | TypeScript npm workspace(`app`, `shared`, `sources/*`) | 하루 한 번 메일·GitHub·폴리오를 읽고, 학교 로컬 LLM이 후보를 제안, 코드가 규칙으로 To Do에 추가, 카톡으로 브리핑 | DB 없음(`.env.local`에 토큰 줄) | 약 12,500줄, 크론, 안전 정책(읽기 자유, 쓰기는 태스크 추가와 나에게 보내기만, 허용 목록 테스트), OpenSpec 사용, CI(Node 20), 공개 저장소(MIT) |

현재 이어진 곳은 한 군데: 비서가 폴리오의 `folio_papers`를 읽는다. 폴리오와 비서는 같은 Supabase 프로젝트와 service_role 키를 쓴다. 코드, 계정, LLM(벨루=외부 API, 비서=학교 로컬 LLM)은 따로다.

## 4. 설계 초안 (확정 아님)

- **주소(안)**: `/` 카드 목록(읽기·이해·챙기기 세 묶음), `/library`(폴리오 서재), `/papers/:itemKey`(논문 하나의 허브: 분석·번역·메모로 이동), `/analyze`, `/translate`, `/note`, `/log`(브리핑과 이력). API는 `/api/...`로 새로 설계.
- **연결 고리**: 논문(`item_key`)을 중심 데이터로. 기준 테이블 후보는 `folio_papers`, 벨루 이력은 `item_key`로 연결.
- **로그인**: 하나. 후보는 자체 세션 또는 Supabase Auth. Zotero는 로그인이 아니라 "연결"로 둔다(공유 로그인은 비용이 커서 발표 전에는 단순하게).
- **AI 정책**: 도구마다 "민감한 내용은 로컬 LLM만" 같은 원칙을 정한다. 벨루의 외부 API와 비서의 로컬 LLM 정책이 다르다.
- **비서**: 하루 한 번 도는 크론 프로그램으로 유지, 패키지로 같은 저장소에 둔다. 브리핑 기록을 저장해 Log 페이지가 읽고, 카톡에는 요약과 링크.
- **미룰 후보**: Contextor, Model Review, 폴리오 에이전트(Python).
- **디자인 시스템 필요 항목**: 색·글자·간격·모서리·다크/라이트 값, 3단 레이아웃, 버튼·입력·카드·탭·사이드바·설정 패널·스트리밍 출력·PDF 뷰어 틀. 먼저 벨루(React)와 폴리오(Svelte)가 지금 쓰는 값을 읽어 비교한다.

## 5. 확정된 결정 (2026-10-18)

1. **발표**: 11/24 데모와 프로젝트 결과발표로 확정. 인터넷 가능. 학교 LLM은 이 서버(집 서버)에서 호출하므로 문제없음(서버에 자체 서명 인증서가 고정돼 있음).
2. **저장소**: `workspace/archi-studio`, 비공개로 시작. 기존 두 서비스는 새 앱 완성 전까지 그대로 둔다.
3. **로그인**: Supabase Auth 하나. Zotero는 로그인이 아니라 "연결".
4. **이식 범위**: 서재, 분석, 번역, 메모, 브리핑. Contextor, Model Review, 폴리오 에이전트는 미룸.
5. **기준 DB**: 벨루 Supabase 프로젝트. 폴리오의 `folio_` 테이블 3개를 거기에 추가하고, 논문 목록은 Zotero 재동기화로 채운다. 비서와 폴리오 서버의 `SUPABASE_URL`/service 키를 교체해야 한다. 무료 요금제라 프로젝트를 더 만들 수 없으므로, 개발은 Docker 로컬 Supabase(이 서버에 Docker 있음, Supabase CLI는 npm으로 설치)에서 하고, 완성되면 같은 마이그레이션을 벨루 DB에 적용한다. 적용 전에 벨루 DB를 백업하고, 기존 벨루 테이블은 수정하지 않고 새 테이블만 추가한다.
6. **벨루 Python**: TypeScript로 다시 쓴다. 순서는 번역(스트리밍)과 메모 먼저, PDF 추출·저널 점수는 마지막. 11/10까지 분석이 안 끝나면 데모에서는 기존 벨루 결과를 연결하는 예비안.
7. **논문 연결 키**: 새 `papers` 테이블에 `item_key`(Zotero)와 `s2_paper_id`(Semantic Scholar)를 둘 다 두고, 화면 주소와 API 경로는 내부 UUID로 통일한다(`/papers/{uuid}`, `/api/papers/{uuid}`). 번역 이력의 `paper_id`는 기존 벨루 테이블을 건드리지 않으려고 새 테이블 `archi_translations`에 둔다.
8. **API 설계 원칙**: 백엔드는 기능별 독립 API로 열고 조합은 프론트에서 한다. `POST /api/translate`는 선택 값 `paperId`를 받아 이력에 저장하고, 같은 문장도 다른 논문이면 이력 행을 새로 만든다. 논문을 삭제하면(Zotero 휴지통으로 이동) 연결된 번역·분석 이력도 함께 삭제한다. 삭제 확인창은 프론트 몫이다.
9. **브리핑**: 앱은 읽기 전용이고, 비서가 DB에 기록한다. 비서의 새 쓰기 권한(허용 목록과 명세 수정)이 필요하며 morning-desk의 별도 change로 만든다(API 명세 검토 후, 아직 만들지 않음).

조사로 확인한 사실: 벨루와 폴리오는 Supabase 프로젝트가 서로 다르다. 벨루 논문 키는 Semantic Scholar `paper_id`, 폴리오는 Zotero `item_key`다. 벨루 디자인 토큰은 `web/src/shared/styles/index.css`(라이트 전용), 폴리오는 `web/src/app.css`(다크 있음)에 있다.

## 5-1. 아직 열린 것

- 11/24 이후 기존 두 서비스를 내릴 시점.
- 벨루 외부 AI 키를 유지할지(현재는 유지로 가정).
- `paper-preflight`, `repo-proof` 폴더는 이 서버에서 찾지 못했고 조사하지 않았다.

## 6. morning-desk에 남은 일 (새 앱과 별개로 이어서)

작업 상태는 `morning-desk/openspec/changes/*/tasks.md`에 있다.
- 서버 배포: `~/workspace/morning-desk`에서 `npm run build`, `.env.local`의 `LOCAL_LLM_BASE_URL` 끝에 `/v1` 추가 → 드라이런 → 크론 경로 `agent/dist`→`app/dist`(시각은 12시로) → 다음 날 확인 → `sources-as-modules` 보관(`improve-briefing`도 같은 방식).
- 푸시 대기 로컬 커밋 7개(사용자가 "한꺼번에 푸시"라고 함).
- 키 정리: Gemini 키와 벨루 비서 계정만 폐기 가능(Supabase·Gmail·카카오·GitHub·학교 LLM 키는 사용 중이라 유지). 그다음 `.env.local` 백업 2개 삭제. Vercel 대시보드 확인은 나중에.
- `assistant-app`: 모델 실패 폴백(6.2), 모델 측정(2.1), 7일 평가, 태스크 추가 켜기.

## 7. 작업 방식 (사용자 선호)

- 한국어, 짧고 결론부터. 목록은 3개 이하, 한 문장은 한 줄.
- 동작 변경은 OpenSpec: 제안서 → 사용자 검토 → 구현 지시 후에만 구현. 커밋은 요청 시, 푸시는 요청이 있을 때 한꺼번에.
- 비밀값은 채팅과 로그에 출력하지 않는다. 서버나 계정을 바꾸는 일은 먼저 확인받는다.
- 벨루·폴리오는 별도 프로젝트: 읽기는 괜찮고, 고치기 전에는 정확한 파일을 확인받는다.
- 서브에이전트는 기본 Sonnet, 단순 조회만 Haiku. 비용을 정당화할 때만 쓴다.

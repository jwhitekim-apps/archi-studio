# 공통 UI 부품

모든 화면이 함께 쓰는 부품이다. `src/lib/components/ui/`에 있고 `$lib/components/ui`에서 한 번에 가져온다.
스타일은 디자인 토큰(`src/lib/styles/tokens.css`)만 쓰고 색 값을 직접 쓰지 않는다. 동작 계약은 `ui-foundation` 스펙에 있다.
모든 부품의 상태는 개발 서버의 `/dev/components`에서 볼 수 있다.

```svelte
<script lang="ts">
	import { Button, TextField, StatePanel } from '$lib/components/ui';
</script>
```

## 부품

| 이름 | 받는 값 | 쓰는 예 |
|---|---|---|
| `Button` | `variant`(`primary`·`secondary`·`danger`, 기본 `secondary`), `busy`(진행 중이면 눌러도 다시 실행하지 않음, 폼 제출도 막음), `href`(주면 같은 모양의 링크), `type`, `disabled`, `onclick`, 그 밖의 `<button>` 속성 | `<Button variant="primary" {busy} onclick={save}>저장</Button>` |
| `IconButton` | `icon`(아이콘 이름), `label`(스크린리더 이름, 필수), `busy`, `tone`(`default`·`danger`), `onclick` | `<IconButton icon="trash" tone="danger" label="삭제" onclick={remove} />` |
| `TextField` | `label`, `value`(bind), `hint`, `error`(있으면 `aria-invalid`와 `aria-describedby`로 연결), `input`(bind, 포커스 옮길 때), 그 밖의 `<input>` 속성 | `<TextField label="이메일" type="email" bind:value={email} error={emailError} />` |
| `SearchField` | `value`(bind), `label`(보이지 않는 이름), `placeholder`, `oninput(value)`, `onclear()`, `onkeydown(event)`(목록 고르기 같은 추가 키), `input`(bind). 지우기 버튼과 Escape로 비움 | `<SearchField bind:value={q} label="논문 검색" oninput={debounced} onclear={reset} />` |
| `Card` | `as`(`div`·`article`·`section`·`li`), `padded`(기본 `true`), 내용 | `<Card><p>내용</p></Card>` |
| `Tabs` | `items`(`{id,label}` 배열), `selected`(bind), `label`(탭 묶음 이름), `panelId`, `onchange(id)`. 화살표·Home·End로 이동 | `<Tabs label="보기" items={tabs} bind:selected={tab} />` |
| `NavItem` | `label`, `href`, `icon`, `active`(`aria-current="page"`), `disabled`(링크 대신 "준비 중" 표시), `onclick` | `<NavItem label="서재" href="/library" icon="library" active />` |
| `Spinner` | `size`(px), `label`(주면 `role="status"`로 읽힘, 없으면 장식) | `<Spinner label="불러오는 중" />` |
| `Icon` | `name`, `size`(px, 기본 18). 이름: `library`, `note`, `folder`, `search`, `refresh`, `file`, `external`, `logout`, `plus`, `close`, `check`, `trash`, `alert`, `settings`, `menu`, `link` | `<Icon name="search" size={16} />` |
| `Notice` | `kind`(`info`·`success`·`error`, 오류는 `role="alert"` 나머지는 `role="status"`), 내용, `action`(snippet) | `<Notice kind="success">3건 추가</Notice>` |
| `StatePanel` | `kind`(`loading`·`empty`·`error`), `title`, `description`, `action`(snippet, 버튼 하나) | 아래 예 |
| `ConfirmDialog` | `open`(bind), `title`, 내용, `confirmLabel`, `cancelLabel`, `danger`, `busy`(진행 중이면 닫기·Escape 막음), `error`(대화상자 안 오류), `onconfirm`, `oncancel`. 닫히면 연 버튼으로 포커스가 돌아감 | 아래 예 |
| `StreamOutput` | `text`, `streaming`(진행 중 표시와 커서), `error`(받은 글자는 두고 아래에 알림), `label`, `placeholder`, `live`(기본 `true`, `false`면 조각마다 읽지 않음), `progressLabel`(기본 "받는 중") | 아래 예 |

```svelte
<StatePanel kind="error" title="목록을 불러오지 못했습니다" description={message}>
	{#snippet action()}<Button onclick={retry}>다시 시도</Button>{/snippet}
</StatePanel>

<ConfirmDialog bind:open title="논문을 삭제할까요?" confirmLabel="삭제" danger {busy} {error} onconfirm={remove}>
	<p>Zotero 휴지통으로 이동하고 연결된 번역·분석 이력도 함께 삭제됩니다.</p>
</ConfirmDialog>
```

## 부품과 함께 쓰는 도구

- `$lib/api/client`의 `apiFetch(path, { method, body, fetch, signal })`: JSON 요청. 2xx가 아니면 `ApiError(status, code, message)`를 던지고, 인증 API가 아닌 401이면 `/login?redirect=…&expired=1`로 한 번만 보낸다.
- `$lib/api/messages`의 `errorMessage(error)`: 오류 코드를 한국어 안내로 바꾼다. 새 오류 코드를 서버에 추가하면 `MESSAGES`에도 넣는다(단위 테스트가 `openapi.yaml`과 `errors.ts`를 대조한다).
- `$lib/ui/stream`의 `readTextStream(response, onChunk)`: `text/plain` 조각 응답을 읽어 `StreamOutput`에 넘긴다. 한글이 조각 경계에서 깨지지 않는다.

```svelte
<script lang="ts">
	import { StreamOutput } from '$lib/components/ui';
	import { readTextStream } from '$lib/ui/stream';

	let text = $state('');
	let streaming = $state(false);
	let error = $state('');

	async function run(input: string) {
		text = '';
		error = '';
		streaming = true;
		try {
			const response = await fetch('/api/translate', { method: 'POST', body: JSON.stringify({ text: input }) });
			await readTextStream(response, (chunk) => (text += chunk));
		} catch {
			error = '연결이 끊겨 결과를 끝까지 받지 못했습니다.';
		} finally {
			streaming = false;
		}
	}
</script>

<StreamOutput {text} {streaming} {error} label="번역 결과" />
```

## 화면 조각

공통 부품 위에 만든 조각으로 `src/lib/components/`에 있다(`ui/` 밖이라 `index.ts`로 내보내지 않는다).

| 이름 | 받는 값 | 쓰는 예 |
|---|---|---|
| `PanelContent` | 내용(children). 이 컴포넌트가 화면에 있는 동안 오른쪽 설정 패널에 내용을 보여준다. 화면을 떠나면 기본 안내문으로 돌아간다 | `<PanelContent><p>설정</p></PanelContent>` |
| `PaperPicker` | `onselect(paper)`. 내 논문 검색(300ms), 최근 20개, 화살표·Enter로 고르기, 빈 서재·결과 없음 안내 | `<PaperPicker onselect={select} />` |
| `AnalysisResult` | `analysis`(`Analysis` 응답), `fallbackTitle`. null과 빈 목록은 숨긴다 | `<AnalysisResult {analysis} fallbackTitle={title} />` |

`PanelContent`는 `(app)/+layout.svelte`가 만든 패널 자리(`panel-slot.svelte.ts`)에 등록한다. 셸 밖(로그인 화면 등)에서는 아무것도 하지 않는다.

## 메뉴 항목

사이드바 메뉴는 `src/lib/nav.ts`의 `NAV_ITEMS`가 정한다. 화면을 만든 change는 그 항목의 `disabled`를 빼고 `href`를 채운다.

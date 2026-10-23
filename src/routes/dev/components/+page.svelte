<script lang="ts">
	// 모든 공통 부품의 상태를 한 화면에 모은다. scripts/ui-screens.mjs가 이 화면을 검사한다.
	import {
		Button,
		Card,
		ConfirmDialog,
		Icon,
		IconButton,
		NavItem,
		Notice,
		SearchField,
		Spinner,
		StatePanel,
		StreamOutput,
		Tabs,
		TextField
	} from '$lib/components/ui';
	import { readTextStream } from '$lib/ui/stream';

	// 진행 중 버튼: 누르면 가짜 요청이 1.5초 걸린다. 시작된 요청 수를 센다.
	let requests = $state(0);
	let busy = $state(false);
	async function startRequest() {
		requests += 1;
		busy = true;
		await new Promise((resolve) => setTimeout(resolve, 1500));
		busy = false;
	}

	// 확인 대화상자
	let dialogOpen = $state(false);
	let confirmed = $state(0);
	let cancelled = $state(0);

	// 스트리밍: 조각을 차례로 보내는 가짜 응답
	let streamText = $state('');
	let streaming = $state(false);
	let streamError = $state('');
	async function runStream(failMidway: boolean) {
		streamText = '';
		streamError = '';
		streaming = true;
		const encoder = new TextEncoder();
		const parts = ['안녕', '하세요', ' 스트리밍 시험입니다.'];
		let i = 0;
		const body = new ReadableStream<Uint8Array>({
			async pull(controller) {
				await new Promise((resolve) => setTimeout(resolve, 150));
				if (failMidway && i === 2) return controller.error(new Error('끊김'));
				if (i >= parts.length) return controller.close();
				controller.enqueue(encoder.encode(parts[i++]));
			}
		});
		try {
			await readTextStream(new Response(body), (chunk) => (streamText += chunk));
		} catch {
			streamError = '연결이 끊겨 결과를 끝까지 받지 못했습니다.';
		} finally {
			streaming = false;
		}
	}

	let email = $state('');
	let search = $state('');
	let tab = $state('one');
</script>

<svelte:head>
	<title>부품 확인 · Archi Studio</title>
</svelte:head>

<div class="page">
	<h1>공통 부품</h1>
	<p class="lead">개발 서버에서만 열리는 확인 화면입니다.</p>

	<section aria-labelledby="buttons">
		<h2 id="buttons">버튼</h2>
		<div class="row">
			<Button variant="primary">기본</Button>
			<Button>보조</Button>
			<Button variant="danger">위험</Button>
			<Button disabled>비활성</Button>
			<Button variant="primary" busy>진행 중</Button>
			<Button href="/dev/components">링크 버튼</Button>
		</div>
		<div class="row">
			<Button variant="primary" {busy} onclick={startRequest} data-testid="busy-button">요청 보내기</Button>
			<span>시작된 요청 <output data-testid="busy-count">{requests}</output>번</span>
		</div>
		<div class="row">
			<IconButton icon="refresh" label="새로 고침" />
			<IconButton icon="trash" label="삭제" tone="danger" />
			<IconButton icon="refresh" label="진행 중 아이콘 버튼" busy />
			<Spinner label="불러오는 중" />
			<Icon name="library" />
		</div>
	</section>

	<section aria-labelledby="fields">
		<h2 id="fields">입력창</h2>
		<div class="grid">
			<TextField label="이메일" type="email" bind:value={email} hint="가입할 때 쓴 이메일" />
			<TextField label="비밀번호" type="password" error="8자 이상이어야 합니다." data-testid="error-field" />
			<TextField label="비활성 입력" disabled value="바꿀 수 없음" />
			<SearchField bind:value={search} label="부품 검색" placeholder="제목이나 저자로 검색" />
		</div>
	</section>

	<section aria-labelledby="tabs">
		<h2 id="tabs">탭과 메뉴 항목</h2>
		<Tabs
			label="예시 탭"
			bind:selected={tab}
			items={[
				{ id: 'one', label: '첫째' },
				{ id: 'two', label: '둘째' },
				{ id: 'three', label: '셋째' }
			]}
		/>
		<p>선택: {tab}</p>
		<ul class="nav-sample">
			<li><NavItem label="현재 화면" href="/dev/components" icon="library" active /></li>
			<li><NavItem label="다른 화면" href="/dev/components#other" icon="note" /></li>
			<li><NavItem label="준비 중 화면" icon="file" disabled /></li>
		</ul>
	</section>

	<section aria-labelledby="states">
		<h2 id="states">알림과 상태 패널</h2>
		<div class="stack">
			<Notice>정보 알림입니다.</Notice>
			<Notice kind="success">3건 추가, 1건 갱신, 0건 삭제</Notice>
			<Notice kind="error">서버에 연결하지 못했습니다.</Notice>
		</div>
		<div class="grid">
			<StatePanel kind="loading" title="불러오는 중" />
			<StatePanel kind="empty" title="서재가 비어 있습니다" description="Zotero를 연결하면 논문이 여기에 나타납니다.">
				{#snippet action()}<Button variant="primary">연결</Button>{/snippet}
			</StatePanel>
			<StatePanel kind="error" title="목록을 불러오지 못했습니다" description="잠시 뒤 다시 시도해 주세요.">
				{#snippet action()}<Button>다시 시도</Button>{/snippet}
			</StatePanel>
		</div>
	</section>

	<section aria-labelledby="dialog">
		<h2 id="dialog">확인 대화상자</h2>
		<div class="row">
			<Button variant="danger" onclick={() => (dialogOpen = true)} data-testid="dialog-opener">삭제 대화상자 열기</Button>
			<span>확인 <output data-testid="dialog-confirmed">{confirmed}</output>번, 취소 <output data-testid="dialog-cancelled">{cancelled}</output>번</span>
		</div>
		<ConfirmDialog
			bind:open={dialogOpen}
			title="논문을 삭제할까요?"
			confirmLabel="삭제"
			danger
			onconfirm={() => {
				confirmed += 1;
				dialogOpen = false;
			}}
			oncancel={() => (cancelled += 1)}
		>
			<p>Zotero 휴지통으로 이동하고 연결된 번역·분석 이력도 함께 삭제됩니다.</p>
		</ConfirmDialog>
	</section>

	<section aria-labelledby="stream">
		<h2 id="stream">스트리밍 출력</h2>
		<div class="row">
			<Button onclick={() => runStream(false)} disabled={streaming} data-testid="stream-ok">스트림 시작</Button>
			<Button onclick={() => runStream(true)} disabled={streaming} data-testid="stream-fail">도중 오류 시험</Button>
		</div>
		<StreamOutput text={streamText} {streaming} error={streamError} label="스트리밍 결과" placeholder="아직 결과가 없습니다." />
	</section>

	<section aria-labelledby="card">
		<h2 id="card">카드</h2>
		<Card>
			<p class="body-text" data-testid="body-text">본문 글자 대비를 확인하는 카드입니다.</p>
		</Card>
	</section>
</div>

<style>
	.page {
		display: grid;
		gap: var(--space-2xl);
		max-width: var(--read-w);
	}

	h1 {
		margin: 0;
		font-size: var(--fs-22);
		font-weight: var(--fw-700);
	}

	.lead {
		margin: calc(-1 * var(--space-xl)) 0 0;
		color: var(--color-text-muted);
	}

	section {
		display: grid;
		gap: var(--space-md);
	}

	h2 {
		margin: 0;
		font-size: var(--fs-16);
		font-weight: var(--fw-650);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-sm);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: var(--space-md);
	}

	.stack {
		display: grid;
		gap: var(--space-sm);
	}

	.nav-sample {
		display: grid;
		gap: var(--space-xs);
		max-width: var(--sidebar-w);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.body-text {
		margin: 0;
	}
</style>

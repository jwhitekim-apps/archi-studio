<script lang="ts">
	// 논문 허브: 원문과 메모를 한 화면에 두고 번역·분석으로 넘어간다(paper-hub-screen 스펙).
	import { ApiError, apiFetch } from '$lib/api/client';
	import { errorMessage } from '$lib/api/messages';
	import type { PaperDetail } from '$lib/api/types';
	import DocumentSlot from '$lib/components/hub/DocumentSlot.svelte';
	import MarkdownNote from '$lib/components/memo/MarkdownNote.svelte';
	import NoteBottomSheet from '$lib/components/memo/NoteBottomSheet.svelte';
	import { Button, StatePanel } from '$lib/components/ui';
	import { isUuid } from '$lib/uuid';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type View = { kind: 'loading' } | { kind: 'ready'; paper: PaperDetail } | { kind: 'notFound' } | { kind: 'error'; message: string };
	let view = $state<View>({ kind: 'loading' });
	let request = 0;

	async function loadPaper(id: string) {
		const current = ++request;
		view = { kind: 'loading' };
		if (!isUuid(id)) {
			view = { kind: 'notFound' };
			return;
		}
		try {
			const paper = await apiFetch<PaperDetail>(`/api/papers/${id}`);
			if (current === request) view = { kind: 'ready', paper };
		} catch (error) {
			if (current !== request) return;
			view = error instanceof ApiError && error.code === 'paper_not_found' ? { kind: 'notFound' } : { kind: 'error', message: errorMessage(error) };
		}
	}

	$effect(() => {
		void loadPaper(data.id);
	});

	// ---- 배치: 작업 영역 폭이 700px 이상이면 좌우 분할, 미만이면 메모 시트(design 결정 7) ----
	const SPLIT_MIN = 700;
	const MEMO_MIN = 320;
	const DOC_MIN = 360;
	// 구분선 폭. CSS의 var(--space-sm)과 같다
	const DIVIDER = 8;
	const KEY_STEP = 16;

	let work: HTMLElement | undefined = $state();
	let workWidth = $state(0);
	let workHeight = $state(0);
	// 메모 칸의 바라는 폭. 실제 폭은 아래에서 최소 폭으로 자른다
	let memoWish = $state<number | null>(null);

	$effect(() => {
		if (!work) return;
		const observer = new ResizeObserver(([entry]) => {
			workWidth = entry.contentRect.width;
			workHeight = entry.contentRect.height;
		});
		observer.observe(work);
		return () => observer.disconnect();
	});

	const narrow = $derived(workWidth < SPLIT_MIN);
	const memoMax = $derived(Math.max(MEMO_MIN, workWidth - DOC_MIN - DIVIDER));
	const memoWidth = $derived(Math.round(Math.min(memoMax, Math.max(MEMO_MIN, memoWish ?? workWidth * 0.4))));
	const docWidth = $derived(Math.round(workWidth - memoWidth - DIVIDER));

	let resizing = $state(false);

	function setMemoWidth(next: number) {
		memoWish = Math.min(memoMax, Math.max(MEMO_MIN, next));
	}

	function onDividerDown(event: PointerEvent & { currentTarget: HTMLElement }) {
		if (event.button !== 0) return;
		event.preventDefault();
		resizing = true;
		event.currentTarget.setPointerCapture?.(event.pointerId);
	}

	function onDividerMove(event: PointerEvent) {
		if (!resizing || !work) return;
		const rect = work.getBoundingClientRect();
		setMemoWidth(rect.right - event.clientX - DIVIDER / 2);
	}

	function onDividerUp() {
		resizing = false;
	}

	// 왼쪽 화살표는 구분선을 왼쪽으로(메모가 넓어짐), 오른쪽은 반대
	function onDividerKey(event: KeyboardEvent) {
		const moves: Record<string, number> = {
			ArrowLeft: memoWidth + KEY_STEP,
			ArrowRight: memoWidth - KEY_STEP,
			Home: memoMax,
			End: MEMO_MIN
		};
		if (!(event.key in moves)) return;
		event.preventDefault();
		setMemoWidth(moves[event.key]);
	}

	const meta = (paper: PaperDetail) => [paper.authors.slice(0, 3).join(', ') + (paper.authors.length > 3 ? ' 외' : ''), paper.year ?? ''].filter(Boolean).join(' · ');
</script>

<svelte:head>
	<title>{view.kind === 'ready' ? `${view.paper.title || '제목 없음'} · ` : ''}논문 · Archi Studio</title>
</svelte:head>

{#if view.kind === 'loading'}
	<StatePanel kind="loading" title="논문을 불러오는 중…" />
{:else if view.kind === 'notFound'}
	<StatePanel kind="error" title="논문을 찾을 수 없습니다" description="이미 삭제되었거나 주소가 잘못되었을 수 있습니다.">
		{#snippet action()}<Button href="/library">서재로 돌아가기</Button>{/snippet}
	</StatePanel>
{:else if view.kind === 'error'}
	<StatePanel kind="error" title="논문을 불러오지 못했습니다" description={view.message}>
		{#snippet action()}<Button onclick={() => void loadPaper(data.id)}>다시 시도</Button>{/snippet}
	</StatePanel>
{:else}
	{@const paper = view.paper}
	{#key paper.id}
		<div class="hub" class:resizing>
			<header class="hub-head">
				<div class="title-block">
					<h1>{paper.title || '제목 없음'}</h1>
					{#if meta(paper)}<p class="meta">{meta(paper)}</p>{/if}
				</div>
				<nav class="tools" aria-label="이 논문의 도구">
					<Button href={`/translate?paperId=${paper.id}`}>
						번역 <span class="count" data-testid="translation-count">{paper.translationCount}</span>
					</Button>
					<Button href={`/analyze?paperId=${paper.id}`}>
						분석 <span class="count" data-testid="analysis-count">{paper.analysisCount}</span>
					</Button>
				</nav>
			</header>

			<div
				class="hub-work"
				class:narrow
				bind:this={work}
				data-testid="hub-work"
				data-layout={narrow ? 'sheet' : 'split'}
				style:grid-template-columns={narrow ? undefined : `${docWidth}px ${DIVIDER}px ${memoWidth}px`}
			>
				<div class="doc-cell">
					<DocumentSlot paperId={paper.id} type={paper.attachment.type} />
				</div>
				{#if !narrow}
					<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -- 창 분할 구분선(role=separator)은 포커스를 받아 화살표로 조절한다 -->
					<div
						class="divider"
						role="separator"
						tabindex="0"
						aria-orientation="vertical"
						aria-label="원문과 메모 폭 조절"
						aria-valuemin={DOC_MIN}
						aria-valuemax={Math.round(workWidth - MEMO_MIN - DIVIDER)}
						aria-valuenow={docWidth}
						onpointerdown={onDividerDown}
						onpointermove={onDividerMove}
						onpointerup={onDividerUp}
						onpointercancel={onDividerUp}
						onkeydown={onDividerKey}
					></div>
				{/if}
				<NoteBottomSheet sheet={narrow} height={workHeight} label="메모">
					<MarkdownNote paperId={paper.id} paperTitle={paper.title} />
				</NoteBottomSheet>
			</div>
		</div>
	{/key}
{/if}

<style>
	/* 셸 작업 영역의 안쪽 여백 없이 가득 채운다(design 결정 7) */
	.hub {
		display: flex;
		flex-direction: column;
		height: 100dvh;
		margin: calc(-1 * var(--gutter));
		background: var(--color-canvas);
	}

	.hub.resizing {
		cursor: col-resize;
		user-select: none;
	}

	.hub-head {
		flex: none;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm) var(--space-lg);
		padding: var(--space-md) var(--space-lg);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.title-block {
		min-width: 0;
		flex: 1 1 240px;
	}

	h1 {
		margin: 0;
		overflow: hidden;
		font-size: var(--fs-18);
		font-weight: var(--fw-700);
		line-height: var(--lh-tight);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meta {
		margin: var(--space-xs) 0 0;
		overflow: hidden;
		color: var(--color-text-muted);
		font-size: var(--fs-13);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tools {
		display: flex;
		gap: var(--space-sm);
	}

	.count {
		min-width: 22px;
		padding: 0 var(--space-xs);
		border-radius: var(--radius-pill);
		background: var(--color-well);
		color: var(--color-text);
		font-size: var(--fs-12);
		font-weight: var(--fw-700);
		text-align: center;
	}

	.hub-work {
		position: relative;
		flex: 1 1 auto;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		min-height: 0;
		overflow: hidden;
	}

	.doc-cell {
		min-width: 0;
		min-height: 0;
	}

	.hub-work.narrow .doc-cell {
		/* 접힌 시트 손잡이가 원문 끝을 가리지 않게 그만큼 비운다 */
		padding-bottom: 64px;
	}

	.divider {
		position: relative;
		width: var(--space-sm);
		background: var(--color-well);
		border-inline: 1px solid var(--color-border);
		cursor: col-resize;
		touch-action: none;
	}

	.divider::after {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		width: 2px;
		height: 32px;
		border-radius: var(--radius-pill);
		background: var(--color-border-strong);
		transform: translate(-50%, -50%);
	}

	.divider:hover,
	.hub.resizing .divider {
		background: var(--color-hover);
	}

	.divider:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
	}

	@media (max-width: 767px) {
		.hub {
			height: calc(100dvh - var(--header-h));
			margin: calc(-1 * var(--space-lg));
		}
	}
</style>

<script lang="ts">
	// 좁은 작업 영역에서 메모를 아래에서 끌어올리는 시트. 폴리오 web/src/components/NoteBottomSheet.svelte를 옮겼다.
	// 바꾼 곳: 셸 규칙에 맞춰 열면 포커스를 시트 안으로, 닫으면(Escape·배경·닫기 버튼) 손잡이로 돌려보내고
	// 열린 동안 바깥을 inert로 막는다. 높이는 창이 아니라 허브 작업 영역 높이(height)를 기준으로 한다.
	// sheet가 false면 좌우 분할의 메모 칸으로 그린다. 같은 요소를 그대로 써서 전환해도 메모 편집기가 다시 만들어지지 않는다.
	import { tick, type Snippet } from 'svelte';
	import { Icon, IconButton } from '$lib/components/ui';

	let {
		sheet,
		height,
		label = '메모',
		children
	}: {
		sheet: boolean;
		// 허브 작업 영역 높이(px)
		height: number;
		label?: string;
		children: Snippet;
	} = $props();

	// 접힘 상태에서 보이는 손잡이 높이, 중간·완전 펼침 비율(완전히 펼쳐도 위쪽 원문이 조금 보인다)
	const COLLAPSED_PX = 64;
	const HALF_RATIO = 0.5;
	const FULL_RATIO = 0.88;
	// 탭과 드래그를 가르는 이동량(px)
	const TAP_THRESHOLD = 6;

	const sheetHeight = $derived(Math.max(COLLAPSED_PX, Math.round(height * FULL_RATIO)));
	const snapVisible = $derived([COLLAPSED_PX, Math.max(COLLAPSED_PX, Math.round(height * HALF_RATIO)), sheetHeight]);
	const snapTranslate = $derived(snapVisible.map((visible) => sheetHeight - visible));

	// 0=접힘, 1=중간, 2=펼침
	let snapIndex = $state(0);
	let translate = $state(0);
	let dragging = $state(false);
	const expanded = $derived(sheet && snapIndex > 0);

	let root: HTMLElement | undefined = $state();
	let handle: HTMLElement | undefined = $state();
	let body: HTMLElement | undefined = $state();

	$effect(() => {
		if (!dragging) translate = snapTranslate[snapIndex];
	});

	// 분할로 바뀌면 시트 상태를 접힘으로 정리한다
	$effect(() => {
		if (!sheet) snapIndex = 0;
	});

	const FOCUSABLE =
		'a[href], button:not([disabled]), input:not([disabled]):not([type="file"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

	async function setSnap(next: number) {
		const wasOpen = snapIndex > 0;
		snapIndex = next;
		translate = snapTranslate[next];
		const isOpen = next > 0;
		if (isOpen && !wasOpen) {
			await tick();
			(body?.querySelector<HTMLElement>(FOCUSABLE) ?? body)?.focus();
		} else if (!isOpen && wasOpen) {
			await tick();
			handle?.focus();
		}
	}

	function close() {
		if (snapIndex > 0) void setSnap(0);
	}

	// 열린 동안 시트 바깥(허브의 원문·머리, 셸의 메뉴·패널·상단 줄)을 inert로 막는다.
	// 시트에서 body까지 올라가며 각 단계의 형제 요소를 막고, 닫히면 원래대로 돌린다.
	$effect(() => {
		if (!expanded || !root) return;
		const blocked: HTMLElement[] = [];
		let node: HTMLElement | null = root;
		while (node && node !== document.body) {
			const parent: HTMLElement | null = node.parentElement;
			if (!parent) break;
			for (const sibling of Array.from(parent.children)) {
				if (sibling === node || !(sibling instanceof HTMLElement) || sibling.inert) continue;
				if (sibling.tagName === 'SCRIPT') continue;
				sibling.inert = true;
				blocked.push(sibling);
			}
			node = parent;
		}
		return () => {
			for (const el of blocked) el.inert = false;
		};
	});

	function onWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && expanded) {
			event.preventDefault();
			close();
		}
	}

	// ---- 손잡이 드래그(포인터 이벤트). pointermove는 프레임마다 한 번만 반영한다 ----
	let startY = 0;
	let startTranslate = 0;
	let pointerId: number | null = null;
	let pendingY = 0;
	let moved = false;
	let rafId = 0;
	const maxTranslate = $derived(snapTranslate[0]);

	function flush() {
		rafId = 0;
		const next = startTranslate + (pendingY - startY);
		translate = Math.min(maxTranslate, Math.max(0, next));
	}

	function onPointerDown(event: PointerEvent & { currentTarget: HTMLElement }) {
		if (event.button !== 0) return;
		pointerId = event.pointerId;
		dragging = true;
		moved = false;
		startY = event.clientY;
		pendingY = event.clientY;
		startTranslate = translate;
		event.currentTarget.setPointerCapture?.(event.pointerId);
	}

	function onPointerMove(event: PointerEvent) {
		if (!dragging || event.pointerId !== pointerId) return;
		if (Math.abs(event.clientY - startY) > TAP_THRESHOLD) moved = true;
		pendingY = event.clientY;
		if (!rafId) rafId = requestAnimationFrame(flush);
	}

	function endDrag(event: PointerEvent) {
		if (!dragging || event.pointerId !== pointerId) return;
		dragging = false;
		if (rafId) {
			cancelAnimationFrame(rafId);
			rafId = 0;
		}
		pointerId = null;
		if (!moved) {
			// 탭: 접혀 있으면 중간으로 펼치고, 아니면 접는다
			void setSnap(snapIndex === 0 ? 1 : 0);
			return;
		}
		// 드래그를 끝낸 위치에서 가장 가까운 지점으로 맞춘다
		let best = 0;
		for (let i = 1; i < snapTranslate.length; i++) {
			if (Math.abs(snapTranslate[i] - translate) < Math.abs(snapTranslate[best] - translate)) best = i;
		}
		void setSnap(best);
	}

	function onHandleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			void setSnap(snapIndex === 0 ? 1 : 0);
		}
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="note-sheet-root" class:sheet bind:this={root}>
	{#if expanded}
		<!-- 포인터용 닫기 면. 키보드는 Escape와 닫기 버튼을 쓴다. -->
		<button type="button" class="scrim" aria-label="배경 닫기" tabindex="-1" onclick={close}></button>
	{/if}
	<section
		class="note-sheet"
		class:sheet
		class:dragging
		aria-label={label}
		data-testid="memo-pane"
		data-mode={sheet ? 'sheet' : 'split'}
		style:height={sheet ? `${sheetHeight}px` : undefined}
		style:transform={sheet ? `translateY(${translate}px)` : undefined}
	>
		{#if sheet}
			<div class="handle-row">
				<div
					class="handle"
					role="button"
					tabindex="0"
					aria-expanded={expanded}
					aria-label={expanded ? '메모 접기' : '메모 펼치기'}
					bind:this={handle}
					onpointerdown={onPointerDown}
					onpointermove={onPointerMove}
					onpointerup={endDrag}
					onpointercancel={endDrag}
					onkeydown={onHandleKeydown}
				>
					<span class="grip" aria-hidden="true"></span>
					<span class="heading"><Icon name="note" size={16} /> {label}</span>
				</div>
				{#if expanded}
					<IconButton icon="close" label="메모 닫기" onclick={close} />
				{/if}
			</div>
		{/if}
		<div class="body" bind:this={body} tabindex="-1" inert={sheet && !expanded}>
			{@render children()}
		</div>
	</section>
</div>

<style>
	.note-sheet-root {
		display: contents;
	}

	.note-sheet {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
		background: var(--color-surface);
	}

	/* 시트: 허브 작업 영역 아래에 붙고 transform으로 오르내린다 */
	.note-sheet.sheet {
		position: absolute;
		right: 0;
		bottom: 0;
		left: 0;
		z-index: 6;
		border: 1px solid var(--color-border);
		border-bottom: 0;
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		box-shadow: var(--shadow-popover);
		transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.note-sheet.dragging {
		transition: none;
	}

	.handle-row {
		flex: none;
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding-right: var(--space-sm);
		border-bottom: 1px solid var(--color-border);
	}

	.handle {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-xs);
		min-height: 56px;
		padding: var(--space-sm) var(--space-lg);
		cursor: grab;
		user-select: none;
		touch-action: none;
	}

	.handle:active {
		cursor: grabbing;
	}

	.handle:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
	}

	.grip {
		width: 40px;
		height: 4px;
		border-radius: var(--radius-pill);
		background: var(--color-border-strong);
	}

	.heading {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		color: var(--color-text);
		font-size: var(--fs-14);
		font-weight: var(--fw-650);
	}

	.body {
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
	}

	.body:focus {
		outline: none;
	}

	.scrim {
		position: absolute;
		inset: 0;
		z-index: 5;
		padding: 0;
		border: 0;
		background: var(--color-text);
		opacity: 0.3;
		cursor: pointer;
	}
</style>

<script lang="ts">
	// 원문 패널. 확대 툴바, Ctrl/Cmd+휠 확대, 확대 지점 고정 스크롤 보정, 터치 팬·핀치를 갖는다.
	// 폴리오 web/src/components/PdfPane.svelte에서 옮김. 펜 도구와 첨부 교체는 제외했다.
	//
	// 배율 상태(zoom)는 이 컴포넌트만 갖는다. PdfViewer와 HtmlViewer는 값을 받아 쓰기만 해서
	// 확대 중 스크롤 보정 계산이 한 곳에서 맞는다.
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import IconButton from '$lib/components/ui/IconButton.svelte';
	import { createTouchGestures } from '$lib/viewer/touch-gestures';
	import HtmlViewer from './HtmlViewer.svelte';
	import PdfViewer from './PdfViewer.svelte';

	type Props = {
		// 원문 주소(예: /api/papers/{id}/file)
		src: string;
		// 첨부 종류. null이면 "첨부 없음" 안내를 보인다
		type: 'pdf' | 'html' | null;
	};

	let { src, type }: Props = $props();

	const MIN_ZOOM = 0.5;
	const MAX_ZOOM = 5;
	const BUTTON_STEP = 0.15;

	let zoom = $state(1);
	// PDF는 아래 .viewer-scroll, HTML은 HtmlViewer가 돌려주는 스크롤 상자
	let scrollEl = $state<HTMLDivElement>();

	// 커서(없으면 화면 가운데)가 가리키던 지점이 화면에서 같은 자리에 남도록 scrollTop을 즉시 보정한다.
	// 가로 가운데 정렬은 pdf.js가 맞춘다. 배율은 0.1% 단위로 맞춰 핀치가 계단식으로 보이지 않게 한다
	function zoomTo(nextZoom: number, clientY?: number) {
		const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(nextZoom * 1000) / 1000));
		if (clamped === zoom || !scrollEl) {
			zoom = clamped;
			return;
		}

		const rect = scrollEl.getBoundingClientRect();
		const offsetY = (clientY ?? rect.top + rect.height / 2) - rect.top;
		const ratio = clamped / zoom;

		// 스크롤 상자의 위쪽 padding은 배율과 함께 커지지 않으므로 빼고 계산한다(빼지 않으면 115%에서 약 3px 밀린다)
		const padTop = parseFloat(getComputedStyle(scrollEl).paddingTop) || 0;
		scrollEl.scrollTop = (scrollEl.scrollTop + offsetY - padTop) * ratio + padTop - offsetY;
		zoom = clamped;
	}

	function changeZoom(delta: number) {
		zoomTo(zoom + delta);
	}

	// 휠 한 틱의 확대량은 deltaY에 비례한다. 트랙패드 핀치는 deltaY가 작아서 최소 반응 폭만 보장한다
	function zoomStep(deltaY: number): number {
		return Math.max(0.04, Math.abs(deltaY) / 350);
	}

	// PDF 전용. HTML은 HtmlViewer가 자기 스크롤 상자에 같은 처리를 단다
	function onPdfWheel(e: WheelEvent) {
		if (!(e.ctrlKey || e.metaKey)) return;
		e.preventDefault();
		const step = zoomStep(e.deltaY);
		zoomTo(zoom + (e.deltaY < 0 ? step : -step), e.clientY);
	}

	const touch = createTouchGestures({
		getZoom: () => zoom,
		zoomTo,
		getScrollEl: () => scrollEl
	});

	// 다른 원문으로 바뀌면 배율을 처음으로 되돌린다
	let lastSrc = '';
	$effect(() => {
		if (src !== lastSrc) {
			lastSrc = src;
			zoom = 1;
		}
	});
</script>

<section class="pdf-pane" aria-label="원문">
	{#if type}
		<div class="viewer-toolbar" role="toolbar" aria-label="원문 확대 및 축소">
			<Button onclick={() => changeZoom(-BUTTON_STEP)} disabled={zoom <= MIN_ZOOM} aria-label="원문 축소">−</Button>
			<Button onclick={() => zoomTo(1)} aria-label="원래 크기로">
				<span class="zoom-value">{Math.round(zoom * 100)}%</span>
			</Button>
			<IconButton icon="plus" label="원문 확대" onclick={() => changeZoom(BUTTON_STEP)} disabled={zoom >= MAX_ZOOM} />
			<span class="spacer"></span>
			<a class="open-original" href={src} target="_blank" rel="noopener" title="새 창에서 원문 열기">
				<Icon name="external" size={16} />
				<span class="sr-only">새 창에서 원문 열기</span>
			</a>
		</div>
	{/if}

	{#if type === 'pdf'}
		<div class="viewer-scroll-wrap">
			<!-- svelte-ignore a11y_no_static_element_interactions -- 스크롤·핀치 확대를 받는 스크롤 상자이지 상호작용 위젯이 아니다 -->
			<div
				class="viewer-scroll"
				bind:this={scrollEl}
				onwheel={onPdfWheel}
				onpointerdown={touch.down}
				onpointermove={touch.move}
				onpointerup={touch.up}
				onpointercancel={touch.cancel}
			>
				<PdfViewer {src} {zoom} scrollContainer={scrollEl} />
			</div>
		</div>
	{:else if type === 'html'}
		<div class="viewer-scroll-wrap">
			<div class="html-fill">
				<HtmlViewer {src} {zoom} {zoomStep} onZoomTo={zoomTo} bind:scrollEl />
			</div>
		</div>
	{:else}
		<div class="viewer-empty">
			<Icon name="file" size={24} />
			<p>첨부된 원문이 없습니다.</p>
		</div>
	{/if}
</section>

<style>
	.pdf-pane {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		height: 100%;
		min-width: 0;
		min-height: 0;
		background: var(--color-canvas);
	}

	.viewer-toolbar {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-sm) var(--space-md);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.zoom-value {
		display: inline-block;
		min-width: 4ch;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.spacer {
		flex: 1;
	}

	.open-original {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--control-h);
		height: var(--control-h);
		border-radius: var(--radius-md);
		color: var(--color-text-muted);
	}

	.open-original:hover {
		background: var(--color-hover);
		color: var(--color-text);
	}

	.open-original:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	/* pdf.js의 PDFViewer는 컨테이너가 절대 위치여야 한다(아니면 생성자에서 오류).
	   그리드 행 크기는 이 wrap이 맡고 .viewer-scroll은 그 안을 채우기만 한다 */
	.viewer-scroll-wrap {
		position: relative;
		min-width: 0;
		min-height: 0;
	}

	.viewer-scroll {
		position: absolute;
		inset: 0;
		overflow: auto;
		overflow-anchor: none;
		/* 가로 끝에서 트랙패드 좌우 스와이프가 브라우저 뒤로가기로 새지 않게 가둔다 */
		overscroll-behavior-x: contain;
		/* 팬·핀치를 모두 JS(touch-gestures)로 처리하므로 네이티브 터치 동작을 끈다 */
		touch-action: none;
		/* 스크롤바가 나타날 때 폭이 줄어 가운데 정렬이 밀리지 않게 자리를 미리 비운다 */
		scrollbar-gutter: stable;
		padding: var(--space-xl) var(--space-lg) var(--space-2xl);
		scrollbar-color: var(--color-border-strong) transparent;
		scrollbar-width: thin;
	}

	.html-fill {
		position: absolute;
		inset: 0;
	}

	.viewer-empty {
		grid-row: 1 / -1;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: var(--space-sm);
		color: var(--color-text-muted);
		font-size: var(--fs-14);
	}

	.viewer-empty p {
		margin: 0;
	}
</style>

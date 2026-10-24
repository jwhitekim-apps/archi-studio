<script lang="ts">
	// 웹페이지 스냅샷(HTML 첨부)을 보여주는 뷰어. 폴리오 web/src/components/HtmlViewer.svelte에서 옮김.
	// PDF와 달리 절대 위치 컨테이너 제약이 없어서 자기 스크롤 상자(.html-viewer-scroll)를 직접 갖고,
	// 그 요소를 bind:scrollEl로 부모(PdfPane)에 돌려준다. 배율(zoom)과 확대 함수는 부모 것을 받아 쓴다.
	//
	// 폭 맞춤: 원본은 자연 폭(최소 1100px)으로 그려 두고 transform: scale(fitWidthScale * zoom)으로 패널에 맞춘다.
	// fitWidthScale은 확대 중에 상수라서 부모의 확대 지점 고정 스크롤 보정이 그대로 맞는다.
	// sandbox="allow-same-origin"이라 스냅샷 안의 스크립트는 실행되지 않고, 크기만 바깥에서 잴 수 있다.
	import { createTouchGestures } from '$lib/viewer/touch-gestures';

	type Props = {
		// 원문 주소(예: /api/papers/{id}/file)
		src: string;
		zoom: number;
		// 휠 한 틱의 확대량 계산(부모와 같은 식을 쓴다)
		zoomStep: (deltaY: number) => number;
		onZoomTo: (nextZoom: number, clientY?: number) => void;
		scrollEl?: HTMLDivElement;
	};

	let { src, zoom, zoomStep, onZoomTo, scrollEl = $bindable() }: Props = $props();

	let iframeEl = $state<HTMLIFrameElement>();
	let fitWidthScale = $state(1);
	let contentWidth = $state(1100);
	// 이 값만큼 iframe이 커져서 넘치는 부분은 iframe 안이 아니라 바깥 스크롤 상자에서 스크롤된다
	let contentHeight = $state(600);
	let loaded = $state(false);

	// 일부 스냅샷은 body에 overflow-x: hidden을 건다. 가로는 풀고, 세로는 이중 스크롤을 막으려고 숨긴다
	function unblockOverflow(doc: Document) {
		const style = doc.createElement('style');
		style.textContent = 'html, body { overflow-x: auto !important; overflow-y: hidden !important; }';
		doc.head?.appendChild(style);
	}

	// 숨겨져 폭이 0이면 건너뛴다. 콘텐츠가 1100px보다 넓으면 그 폭을 인정하고 축소만 한다
	function measureFitWidthScale(): number | null {
		const doc = iframeEl?.contentDocument;
		if (!doc || !scrollEl || scrollEl.clientWidth === 0) return null;
		const cs = getComputedStyle(scrollEl);
		const availableWidth = scrollEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
		contentWidth = Math.max(1100, doc.documentElement.scrollWidth);
		contentHeight = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0);
		return availableWidth / contentWidth;
	}

	// iframe에는 pointer-events: none을 걸어 콘텐츠 위 터치·휠이 모두 이 스크롤 상자로 오게 한다.
	// iOS Safari는 iframe 안 터치를 부모 리스너에 확실히 전달하지 않기 때문이다. 대신 스냅샷 안 선택·링크는 막힌다
	const outerTouch = createTouchGestures({
		getZoom: () => zoom,
		zoomTo: (next, clientY) => onZoomTo(next, clientY),
		getScrollEl: () => scrollEl
	});

	function onFrameLoad() {
		const doc = iframeEl?.contentDocument;
		if (doc) unblockOverflow(doc);
		// 폭 맞춤은 scrollEl까지 준비된 뒤 아래 effect가 잰다
		loaded = true;
	}

	function onWheel(e: WheelEvent) {
		if (!(e.ctrlKey || e.metaKey)) return;
		e.preventDefault();
		const step = zoomStep(e.deltaY);
		onZoomTo(zoom + (e.deltaY < 0 ? step : -step), e.clientY);
	}

	// src가 바뀌면 새 문서의 load를 다시 기다린다
	$effect(() => {
		void src;
		loaded = false;
	});

	// 이미지·글꼴이 load 뒤에 늦게 들어와 높이가 바뀌는 경우도 계속 지켜본다
	$effect(() => {
		if (!loaded || !scrollEl) return;
		const nextFit = measureFitWidthScale();
		if (nextFit != null) fitWidthScale = nextFit;

		const doc = iframeEl?.contentDocument;
		if (!doc?.documentElement) return;
		const ro = new ResizeObserver(() => {
			const next = measureFitWidthScale();
			if (next != null) fitWidthScale = next;
		});
		ro.observe(doc.documentElement);
		return () => ro.disconnect();
	});

	// 분할 구분선 드래그로 패널 폭이 바뀌어도 폭 맞춤을 다시 잰다
	$effect(() => {
		if (!scrollEl) return;
		let resizeTimer: ReturnType<typeof setTimeout> | undefined;
		const ro = new ResizeObserver(() => {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => {
				const nextFit = measureFitWidthScale();
				if (nextFit != null) fitWidthScale = nextFit;
			}, 180);
		});
		ro.observe(scrollEl);
		return () => {
			clearTimeout(resizeTimer);
			ro.disconnect();
		};
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -- 스크롤·핀치 확대를 받는 스크롤 상자이지 상호작용 위젯이 아니다 -->
<div
	class="html-viewer-scroll"
	bind:this={scrollEl}
	onwheel={onWheel}
	onpointerdown={outerTouch.down}
	onpointermove={outerTouch.move}
	onpointerup={outerTouch.up}
	onpointercancel={outerTouch.cancel}
>
	<div
		class="html-scale-sizer"
		style:width={`${contentWidth * fitWidthScale * zoom}px`}
		style:height={`${contentHeight * fitWidthScale * zoom}px`}
	>
		<div
			class="html-zoom-wrap"
			style:width={`${contentWidth}px`}
			style:height={`${contentHeight}px`}
			style:transform={`scale(${fitWidthScale * zoom})`}
		>
			<iframe
				bind:this={iframeEl}
				class="html-snapshot-frame"
				{src}
				title="웹페이지 원문"
				sandbox="allow-same-origin"
				onload={onFrameLoad}
			></iframe>
		</div>
	</div>
</div>

<style>
	.html-viewer-scroll {
		height: 100%;
		overflow: auto;
		overflow-anchor: none;
		/* 가로 끝에서 트랙패드 좌우 스와이프가 브라우저 뒤로가기로 새지 않게 가둔다 */
		overscroll-behavior-x: contain;
		/* 팬·핀치를 모두 JS로 처리하므로 네이티브 터치 동작을 끈다 */
		touch-action: none;
		scrollbar-gutter: stable;
		scrollbar-color: var(--color-border-strong) transparent;
		scrollbar-width: thin;
	}

	/* transform은 스크롤 범위 계산에 반영되지 않는다. 이 상자가 축소 뒤 크기를 선언해 스크롤 범위를 맞춘다 */
	.html-scale-sizer {
		position: relative;
		min-height: 100%;
	}

	/* 세로 원점은 PdfViewer와 같이 위쪽, 가로 원점은 왼쪽이어야 넓은 원본이 잘리지 않는다 */
	.html-zoom-wrap {
		position: absolute;
		top: 0;
		left: 0;
		transform-origin: 0 0;
		will-change: transform;
	}

	.html-snapshot-frame {
		display: block;
		width: 100%;
		height: 100%;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		pointer-events: none;
	}
</style>

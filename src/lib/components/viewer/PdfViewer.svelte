<script lang="ts">
	// PDF 원문 뷰어. 렌더링, 폭 맞춤, 텍스트·링크 레이어는 pdf.js 공식 웹 뷰어 엔진(PDFViewer)에 맡긴다.
	// 폴리오 web/src/components/PdfViewer.svelte에서 핵심(불러오기, 렌더링, 폭 맞춤, 글자 위치 교정,
	// 링크 이동과 뒤로, 복사, 키 입력)만 옮겼다. 하이라이트·필기·첨부 교체는 제외했다.
	//
	// 배율(zoom)은 부모(PdfPane)가 단일 소스로 갖고 이 컴포넌트는 받아 쓰기만 한다.
	// pdf.js는 window·document를 쓰므로 화면에 붙은 뒤(onMount) 동적으로 불러온다.
	// 복사는 pdf.js 텍스트 레이어가 처리한다(선택 후 Ctrl/Cmd+C, 복사 시 유니코드 정규화 포함).
	import 'pdfjs-dist/web/pdf_viewer.css';
	import { onMount, untrack } from 'svelte';
	import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
	import type { TextContent, TextItem } from 'pdfjs-dist/types/src/display/api';
	import type { PageViewport } from 'pdfjs-dist/types/src/display/display_utils';
	import type { EventBus, PDFLinkService, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs';
	import Notice from '$lib/components/ui/Notice.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	type PdfjsLib = typeof import('pdfjs-dist');
	type PdfViewerLib = typeof import('pdfjs-dist/web/pdf_viewer.mjs');

	// pdf.js 타입 정의가 any로 열어 둔 페이지 뷰 내부 중 이 파일이 읽는 부분만 좁게 적는다
	interface PageViewLike {
		div?: HTMLDivElement;
		pdfPage?: PDFPageProxy;
		viewport: PageViewport;
		textLayer?: { div?: HTMLDivElement } | null;
		_textHighlighter?: { textDivs?: HTMLElement[] } | null;
	}

	type Props = {
		// 원문 주소(예: /api/papers/{id}/file). 같은 출처라 쿠키가 자동으로 붙는다
		src: string;
		// 폭 맞춤 대비 배율(1 = 폭에 딱 맞음). PdfPane이 갖는 값이다
		zoom?: number;
		// 실제로 스크롤되는 요소(PdfPane의 .viewer-scroll). pdf.js가 이 요소의 스크롤을 직접 읽고 쓴다
		scrollContainer?: HTMLElement;
	};

	let { src, zoom = 1, scrollContainer }: Props = $props();

	let viewerEl = $state<HTMLDivElement>();
	let loading = $state(true);
	let error = $state('');

	let pdfjs: PdfjsLib | null = null;
	let libReady = $state(false);
	let viewerLib: PdfViewerLib | null = null;
	let eventBus: EventBus | null = null;
	let linkService: PDFLinkService | null = null;
	let pdfViewer: PDFViewer | null = null;
	let pdfDocument: PDFDocumentProxy | null = null;
	let loadedSrc = '';

	onMount(() => {
		let cancelled = false;
		(async () => {
			try {
				await import('$lib/viewer/safari-polyfills');
				// pdf_viewer.mjs는 불러오는 순간 globalThis.pdfjsLib을 읽으므로 pdf.js 본체를 먼저 불러온다
				const [lib, worker] = await Promise.all([
					import('pdfjs-dist'),
					import('$lib/viewer/pdf-worker-entry?worker&url')
				]);
				const g = globalThis as typeof globalThis & { pdfjsLib?: PdfjsLib };
				g.pdfjsLib ??= lib;
				const vlib = await import('pdfjs-dist/web/pdf_viewer.mjs');
				if (cancelled) return;
				lib.GlobalWorkerOptions.workerSrc = worker.default;
				pdfjs = lib;
				viewerLib = vlib;
				libReady = true;
			} catch (err) {
				error = err instanceof Error ? err.message : String(err);
				loading = false;
			}
		})();
		return () => {
			cancelled = true;
			teardown?.();
			pdfDocument?.destroy();
		};
	});

	function pageViewAt(index: number): PageViewLike | undefined {
		return (pdfViewer?.getPageView(index) ?? undefined) as PageViewLike | undefined;
	}

	// pdf.js의 TextLayer는 DPR을 곱한 크기로 measureText()를 잰 뒤 그 비율을 CSS px 크기의 span에 적용한다.
	// Windows 소수 배율(125%, 150%)에서는 힌팅과 반올림 때문에 두 폭이 선형 비례하지 않아 선택 영역이 가로로 밀린다.
	// PDF가 지정한 목표 폭은 유지하고 자연 폭만 실제 span에서 다시 재서 --scale-x를 교정한다.
	const textContentCache = new WeakMap<PDFPageProxy, Promise<TextContent>>();
	const textCalibrationJobs = new WeakMap<HTMLElement, Promise<void>>();

	function needsDomTextCalibration(): boolean {
		const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
		const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent;
		const ratio = window.devicePixelRatio || 1;
		return /win/i.test(platform) && Math.abs(ratio - Math.round(ratio)) > 0.001;
	}

	function getTextContent(pdfPage: PDFPageProxy): Promise<TextContent> {
		let promise = textContentCache.get(pdfPage);
		if (!promise) {
			promise = pdfPage.getTextContent({ includeMarkedContent: true, disableNormalization: true });
			textContentCache.set(pdfPage, promise);
		}
		return promise;
	}

	function calibrateTextLayer(pageNumber: number) {
		if (!needsDomTextCalibration()) return;

		const pageView = pageViewAt(pageNumber - 1);
		const textLayer = pageView?.textLayer?.div;
		const textDivs = pageView?._textHighlighter?.textDivs;
		const pdfPage = pageView?.pdfPage;
		// 회전·세로쓰기 페이지는 폭과 높이 축이 바뀌므로 교정하지 않는다
		if (!pageView || !textLayer || !textDivs?.length || !pdfPage || pageView.viewport.rotation % 180 !== 0) return;

		const previousJob = textCalibrationJobs.get(textLayer) ?? Promise.resolve();
		const job: Promise<void> = previousJob
			.catch(() => {})
			.then(async () => {
				const content = await getTextContent(pdfPage);
				// 기다리는 사이 확대나 재생성으로 레이어가 바뀌었으면 버린다
				if (pageView.textLayer?.div !== textLayer || pageView._textHighlighter?.textDivs !== textDivs) return;

				const items = content.items.filter((item): item is TextItem => 'str' in item);
				const layerWidth = textLayer.getBoundingClientRect().width;
				const viewportWidth = pageView.viewport.width;
				if (!(layerWidth > 0) || !(viewportWidth > 0)) return;

				const candidates: { span: HTMLElement; originalScale: string; targetWidth: number }[] = [];
				for (let index = 0; index < Math.min(items.length, textDivs.length); index += 1) {
					const item = items[index];
					const span = textDivs[index];
					if (
						!span?.isConnected ||
						!span.style.getPropertyValue('--scale-x') ||
						span.style.getPropertyValue('--rotate') ||
						content.styles[item.fontName]?.vertical
					) {
						continue;
					}
					candidates.push({
						span,
						originalScale: span.style.getPropertyValue('--scale-x'),
						// item.width는 PDF 좌표 폭이다. viewport 배율과 실제 textLayer/viewport 폭 비율을 함께 곱한다
						targetWidth: Math.abs(item.width) * pageView.viewport.scale * (layerWidth / viewportWidth)
					});
				}

				// 쓰기를 모두 먼저, 읽기를 그다음에 해 페이지마다 강제 레이아웃이 한 번만 일어나게 한다
				for (const { span } of candidates) span.style.setProperty('--scale-x', '1');
				const naturalWidths = candidates.map(({ span }) => span.getBoundingClientRect().width);
				candidates.forEach(({ span, originalScale, targetWidth }, index) => {
					const naturalWidth = naturalWidths[index];
					span.style.setProperty(
						'--scale-x',
						naturalWidth > 0 && targetWidth > 0 ? String(targetWidth / naturalWidth) : originalScale
					);
				});
			})
			.catch((err: unknown) => console.warn('[PdfViewer] 텍스트 레이어 폭 교정 실패', err))
			.finally(() => {
				if (textCalibrationJobs.get(textLayer) === job) textCalibrationJobs.delete(textLayer);
			});
		textCalibrationJobs.set(textLayer, job);
	}

	// 컨테이너 폭 기준 "페이지가 폭에 딱 맞는" 절대 배율. zoom과 곱해 pdf.js에 넘긴다
	let fitWidthScale = $state<number | null>(null);
	// CSS 미리보기 확대의 기준값. 실제 재렌더는 150ms 미루고 그 사이에는 transform: scale로 즉시 보인다
	let renderedZoom = $state(1);
	let zoomTimer: ReturnType<typeof setTimeout> | undefined;

	// 참고문헌 링크로 이동하기 직전의 스크롤 위치. Alt(Option)+← 또는 브라우저 뒤로가기로 돌아간다
	let jumpBackTop: number | null = null;

	function jumpBack() {
		if (jumpBackTop == null || !scrollContainer) return;
		scrollContainer.scrollTo({ top: jumpBackTop, behavior: 'auto' });
		jumpBackTop = null;
	}

	// 실제 이동은 PDFLinkService가 하고, 여기서는 그 직전에 돌아갈 위치만 기록한다(capture 단계)
	function onLinkClickCapture(e: MouseEvent) {
		if (!scrollContainer) return;
		const target = e.target as Element | null;
		const link = target?.closest?.('.annotationLayer .linkAnnotation a');
		if (!(link instanceof HTMLElement)) return;
		// 돌아갈 위치는 지금(이동 직전) 기록에 심고, 이동한 화면용으로 빈 기록을 새로 쌓는다.
		// pushState만 하면 값이 새 기록에 들어가 뒤로가기 때 복원되지 않는다
		history.replaceState({ ...history.state, pdfScrollTop: scrollContainer.scrollTop }, '', location.href);
		history.pushState({}, '', location.href);
		jumpBackTop = scrollContainer.scrollTop;
		// 링크에 포커스가 남으면 맥에서 Option+←가 페이지까지 오지 않는다. 다음 프레임에 포커스를 뗀다
		requestAnimationFrame(() => {
			if (document.activeElement === link) link.blur();
		});
	}

	async function loadDocument(url: string): Promise<PDFDocumentProxy> {
		if (pdfDocument && loadedSrc === url) return pdfDocument;
		if (!pdfjs) throw new Error('pdf.js를 아직 불러오지 못했어요');
		const previous = pdfDocument;
		pdfDocument = await pdfjs.getDocument({ url }).promise;
		loadedSrc = url;
		previous?.destroy();
		return pdfDocument;
	}

	// 폭이 0이면(숨겨진 동안) 건너뛴다. 폭·여백 계산은 pdf.js의 'page-width' 계산을 그대로 쓴다
	function measureFitWidthScale(): number | null {
		if (!pdfViewer || !scrollContainer || scrollContainer.clientWidth === 0) return null;
		pdfViewer.currentScaleValue = 'page-width';
		// pdf.js는 clientWidth(좌우 padding 포함)에 맞추므로 padding만큼 줄여 가로 스크롤이 생기지 않게 한다
		const cs = getComputedStyle(scrollContainer);
		const padding = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
		const width = scrollContainer.clientWidth;
		return width > padding ? (pdfViewer.currentScale * (width - padding)) / width : pdfViewer.currentScale;
	}

	function commitScale() {
		if (fitWidthScale == null || !pdfViewer) return;
		pdfViewer.currentScale = fitWidthScale * zoom;
		renderedZoom = zoom;
	}

	// 불러오기가 겹치면 가장 마지막 호출만 loading을 바꾼다
	let loadGeneration = 0;

	async function loadAndShow(url: string) {
		if (!pdfViewer || !linkService) return;
		const myGeneration = ++loadGeneration;
		loading = true;
		error = '';
		try {
			const doc = await loadDocument(url);
			if (myGeneration !== loadGeneration) return;
			linkService.setDocument(doc);
			pdfViewer.setDocument(doc);
			await pdfViewer.pagesPromise;
			if (myGeneration === loadGeneration) loading = false;
		} catch (err) {
			console.error('[PdfViewer]', err);
			if (myGeneration === loadGeneration) {
				error = err instanceof Error ? err.message : String(err);
				loading = false;
			}
		}
	}

	let prevSrc: string | undefined;
	let prevZoom: number | undefined;

	$effect(() => {
		const s = src;
		const z = zoom;
		if (!pdfViewer || !setupReady) return;

		if (s !== prevSrc) {
			prevSrc = s;
			prevZoom = z;
			clearTimeout(zoomTimer);
			loadAndShow(s);
			return;
		}

		if (z === prevZoom) return;
		prevZoom = z;
		// 배율만 바뀌면 재렌더를 잠깐 미룬다. 그 사이에는 CSS 미리보기가 즉시 반응한다
		clearTimeout(zoomTimer);
		zoomTimer = setTimeout(commitScale, 150);
	});

	// scrollContainer는 부모가 bind:this로 넘겨서 늦게 들어올 수 있다. 셋 다 준비되면 한 번만 초기화한다.
	// 정리는 effect가 아니라 언마운트(onMount 정리)에서 한다. effect가 다시 돌 때 정리되면 리스너가 사라진다
	let setupReady = $state(false);
	let teardown: (() => void) | null = null;
	$effect(() => {
		if (!libReady || !viewerLib || !scrollContainer || !viewerEl) return;
		if (untrack(() => setupReady)) return;
		const container = scrollContainer;
		const bus = new viewerLib.EventBus();
		const links = new viewerLib.PDFLinkService({ eventBus: bus, ignoreDestinationZoom: true });
		const viewer = new viewerLib.PDFViewer({
			container: container as HTMLDivElement,
			viewer: viewerEl,
			eventBus: bus,
			linkService: links,
			removePageBorders: true
		});
		links.setViewer(viewer);
		eventBus = bus;
		linkService = links;
		pdfViewer = viewer;

		// 확대 미리보기 transform이 .pdfViewer에 걸려 있으면 pdf.js의 scrollIntoView가 실제 스크롤 상자를
		// 찾지 못해 링크를 눌러도 움직이지 않는다. 이동 뒤 목적지의 실제 위치를 다시 재서 scrollTop을 맞춘다
		const origGoToDestination = links.goToDestination.bind(links);
		links.goToDestination = async (dest: string | unknown[]) => {
			await origGoToDestination(dest as Parameters<typeof origGoToDestination>[0]);
			const pageView = pageViewAt(viewer.currentPageNumber - 1);
			const pageDiv = pageView?.div;
			if (!pageView || !pageDiv) return;

			// 페이지 맨 위가 아니라 목적지 지점이 화면 맨 위에 오게 한다. XYZ가 아니면 페이지 맨 위로 둔다
			let destTop = 0;
			try {
				const explicitDest: unknown[] | null = Array.isArray(dest)
					? dest
					: ((await pdfDocument?.getDestination(dest)) ?? null);
				const kind = explicitDest?.[1] as { name?: string } | undefined;
				const y = explicitDest?.[3];
				if (kind?.name === 'XYZ' && typeof y === 'number') {
					const x = typeof explicitDest?.[2] === 'number' ? explicitDest[2] : 0;
					const [, viewportY] = pageView.viewport.convertToViewportPoint(x, y);
					destTop = Math.max(0, viewportY);
				}
			} catch {
				destTop = 0;
			}

			const target =
				container.scrollTop + (pageDiv.getBoundingClientRect().top - container.getBoundingClientRect().top) + destTop;
			container.scrollTop = Math.max(0, target);
		};

		const eventAbort = new AbortController();
		bus.on(
			'pagesinit',
			() => {
				fitWidthScale = measureFitWidthScale();
				commitScale();
				loading = false;
			},
			{ signal: eventAbort.signal }
		);
		bus.on(
			'textlayerrendered',
			({ pageNumber, error: textLayerError }: { pageNumber: number; error?: unknown }) => {
				if (textLayerError) return;
				calibrateTextLayer(pageNumber);
				// textlayerrendered는 내장 글꼴 로딩을 기다리지 않는다. 글꼴이 다 들어온 뒤 한 번 더 교정한다
				document.fonts.ready.then(() => calibrateTextLayer(pageNumber));
			},
			{ signal: eventAbort.signal }
		);

		// 창 크기뿐 아니라 분할 구분선 드래그로 컨테이너 폭이 바뀌어도 폭 맞춤을 다시 잰다
		let resizeTimer: ReturnType<typeof setTimeout> | undefined;
		const resizeObserver = new ResizeObserver(() => {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => {
				const nextFit = measureFitWidthScale();
				if (nextFit == null) return;
				fitWidthScale = nextFit;
				commitScale();
			}, 180);
		});
		resizeObserver.observe(container);

		teardown = () => {
			clearTimeout(resizeTimer);
			clearTimeout(zoomTimer);
			resizeObserver.disconnect();
			eventAbort.abort();
		};

		untrack(() => {
			prevSrc = src;
			prevZoom = zoom;
			setupReady = true;
			loadAndShow(src);
		});
	});

	// 링크 이동 전 위치를 기록에 남겨 두었으므로 뒤로가기 때 그 위치로 돌아간다
	function onPopState(e: PopStateEvent) {
		const top = (e.state as { pdfScrollTop?: unknown } | null)?.pdfScrollTop;
		if (typeof top !== 'number') return;
		scrollContainer?.scrollTo({ top, behavior: 'auto' });
		jumpBackTop = null;
	}

	// Alt(Option)+←: 이 PDF 안에서 링크 이동 전 위치로 돌아간다. 입력 중이거나 돌아갈 위치가 없으면 가로채지 않는다
	function onKeyDown(e: KeyboardEvent) {
		if (e.key !== 'ArrowLeft' || !e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
		const active = document.activeElement as HTMLElement | null;
		const tag = active?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || active?.isContentEditable) return;
		if (jumpBackTop == null) return;
		e.preventDefault();
		e.stopPropagation();
		jumpBack();
	}

	// 반응형 값을 읽지 않으므로 마운트 때 한 번 등록되고 해제 때만 풀린다
	$effect(() => {
		window.addEventListener('popstate', onPopState);
		window.addEventListener('keydown', onKeyDown, true);
		return () => {
			window.removeEventListener('popstate', onPopState);
			window.removeEventListener('keydown', onKeyDown, true);
		};
	});

	// 스크롤 요소가 바뀌어도 지금의 요소에 다시 붙도록 초기화와 분리한다
	$effect(() => {
		const container = scrollContainer;
		if (!container) return;
		container.addEventListener('click', onLinkClickCapture, true);
		return () => container.removeEventListener('click', onLinkClickCapture, true);
	});
</script>

{#if loading && !error}
	<div class="pdf-status"><Spinner label="PDF를 불러오는 중" /> <span>PDF 페이지를 준비하는 중…</span></div>
{/if}
{#if error}
	<div class="pdf-status">
		<Notice kind="error">PDF를 불러오지 못했습니다: {error}</Notice>
	</div>
{/if}
<!-- 확대 직후(재렌더를 미루는 150ms)에만 미리보기 transform을 건다. 쉬는 동안 transform이 남아 있으면
     텍스트 레이어와 캔버스가 다른 합성 레이어에서 따로 픽셀에 맞춰져 소수 배율에서 선택 영역이 어긋난다. -->
<div
	class="pdfViewer"
	bind:this={viewerEl}
	style:transform={zoom === renderedZoom ? undefined : `scale(${zoom / renderedZoom})`}
	style:will-change={zoom === renderedZoom ? undefined : 'transform'}
></div>

<style>
	.pdfViewer {
		/* 세로 고정은 부모가 scrollTop을 직접 보정한다. origin이 움직이면 화면이 튀므로 상단 중앙에 고정한다 */
		transform-origin: 50% 0;
	}

	.pdf-status {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin: 0 0 var(--space-md);
		color: var(--color-text-muted);
		font-size: var(--fs-13);
	}

	:global(.pdfViewer .page) {
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-card);
		overflow: hidden;
	}

	:global(.pdfViewer .textLayer ::selection) {
		background: color-mix(in srgb, var(--color-accent) 30%, transparent);
	}
</style>

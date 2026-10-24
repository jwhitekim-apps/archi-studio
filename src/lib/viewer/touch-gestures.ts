// 터치 제스처(한 손가락 팬 + 두 손가락 핀치)를 하나의 포인터 이벤트 흐름에서 처리하는 공용 핸들러.
// 폴리오 web/src/utils/touch-gestures.js에서 옮김(동작 변경 없음).
//
// 스크롤 요소에 touch-action: none을 걸어 네이티브 터치 처리를 모두 끄고 팬·핀치를 여기서 직접 한다.
// pan-x pan-y로 팬만 브라우저에 맡기면 두 손가락 움직임도 팬으로 해석되어
// 확대 지점 고정 스크롤 보정(zoomTo)과 같은 프레임에 경합하고, 확대 방향이 뒤집히거나 튄다.
//
// 배율 상태와 보정(zoomTo)은 부모(PdfPane)가 갖는다. 이 핸들러는 제스처만 인식한다.
// 마우스·펜 입력은 첫 줄에서 걸러지므로 데스크톱 Ctrl/Cmd+휠 확대와 무관하다.

export interface TouchGestureOptions {
	// 핀치 시작 순간의 배율
	getZoom: () => number;
	// 부모의 확대 함수(핀치 중심 Y를 고정점으로 넘김)
	zoomTo: (nextZoom: number, clientY?: number) => void;
	// 팬으로 스크롤할 요소(마운트 뒤 늦게 잡힐 수 있어 getter)
	getScrollEl: () => HTMLElement | null | undefined;
	// 한 손가락 드래그가 팬인지 글자 선택인지 가르는 기준
	getSelection?: () => Selection | null;
	// 다른 문서(iframe)에서 온 clientY를 바깥 좌표로 옮기는 보정값
	clientYOffset?: () => number;
}

export interface TouchGestureHandlers {
	down: (e: PointerEvent) => void;
	move: (e: PointerEvent) => void;
	up: (e: PointerEvent) => void;
	cancel: (e: PointerEvent) => void;
}

interface Point {
	x: number;
	y: number;
}

type Mode = null | 'pan' | 'pinch' | 'select';

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function createTouchGestures({
	getZoom,
	zoomTo,
	getScrollEl,
	getSelection = () => (typeof window !== 'undefined' ? window.getSelection() : null),
	clientYOffset = () => 0
}: TouchGestureOptions): TouchGestureHandlers {
	const pointers = new Map<number, Point>();
	// 'select'는 이 드래그를 브라우저 기본 글자 선택에 맡긴다는 뜻이며 제스처가 끝날 때까지 유지된다
	let mode: Mode = null;

	// 관성 스크롤: 팬 중 속도(px/ms)를 추적했다가 손을 뗄 때 그 속도로 감속을 이어간다
	let velX = 0;
	let velY = 0;
	let lastPanTime = 0;
	let inertiaId = 0;

	let startDist = 0;
	let startZoom = 1;

	let lastX = 0;
	let lastY = 0;
	let pendingDx = 0;
	let pendingDy = 0;

	// pointermove는 프레임당 여러 번 오므로 누적했다가 rAF에서 한 번만 반영한다
	let rafId = 0;

	function twoPoints(): [Point | undefined, Point | undefined] {
		const it = pointers.values();
		return [it.next().value, it.next().value];
	}

	function applyPinch() {
		const [a, b] = twoPoints();
		if (!a || !b) return;
		const dist = Math.hypot(a.x - b.x, a.y - b.y);
		if (!(startDist > 0) || !(dist > 0)) return;
		const centerY = (a.y + b.y) / 2 + clientYOffset();
		zoomTo(startZoom * (dist / startDist), centerY);
	}

	function applyPan() {
		const el = getScrollEl();
		if (!el) {
			pendingDx = pendingDy = 0;
			return;
		}
		const t = now();
		const dt = t - lastPanTime;
		if (dt > 0 && dt < 100) {
			velX = velX * 0.7 + (pendingDx / dt) * 0.3;
			velY = velY * 0.7 + (pendingDy / dt) * 0.3;
		}
		lastPanTime = t;
		// 손가락을 아래로 끌면 내용이 따라 내려오므로 scrollTop은 줄인다
		el.scrollTop -= pendingDy;
		el.scrollLeft -= pendingDx;
		pendingDx = pendingDy = 0;
	}

	function cancelInertia() {
		if (inertiaId) {
			cancelAnimationFrame(inertiaId);
			inertiaId = 0;
		}
	}

	// 16ms 기준 프레임당 0.95로 감쇠하고 실제 프레임 간격에 맞춰 보정한다
	function startInertia() {
		const el = getScrollEl();
		if (!el) return;
		cancelInertia();
		let last = now();
		const step = (t: number) => {
			const dt = t - last;
			last = t;
			el.scrollTop -= velY * dt;
			el.scrollLeft -= velX * dt;
			const decay = Math.pow(0.95, dt / 16);
			velX *= decay;
			velY *= decay;
			if (Math.hypot(velX, velY) < 0.02) {
				inertiaId = 0;
				return;
			}
			inertiaId = requestAnimationFrame(step);
		};
		inertiaId = requestAnimationFrame(step);
	}

	function flush() {
		rafId = 0;
		if (mode === 'pinch' && pointers.size === 2) applyPinch();
		else if (mode === 'pan' && pointers.size === 1) applyPan();
	}

	function schedule() {
		if (!rafId) rafId = requestAnimationFrame(flush);
	}

	function cancelPending() {
		if (rafId) {
			cancelAnimationFrame(rafId);
			rafId = 0;
		}
		pendingDx = pendingDy = 0;
	}

	// 남은 한 손가락으로 팬을 다시 시작한다. 좌표를 지금 위치로 맞춰 핀치에서 팬으로 바뀔 때 튀지 않게 한다
	function beginPan(p: Point) {
		mode = 'pan';
		lastX = p.x;
		lastY = p.y;
		pendingDx = pendingDy = 0;
		velX = velY = 0;
		lastPanTime = now();
	}

	function resetPinch() {
		const [a, b] = twoPoints();
		if (!a || !b) return;
		startDist = Math.hypot(a.x - b.x, a.y - b.y);
		startZoom = getZoom();
		mode = 'pinch';
	}

	function down(e: PointerEvent) {
		if (e.pointerType !== 'touch') return;
		cancelInertia();
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

		if (pointers.size === 2) resetPinch();
		else if (pointers.size === 1) beginPan({ x: e.clientX, y: e.clientY });
	}

	function move(e: PointerEvent) {
		if (!pointers.has(e.pointerId)) return;
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

		if (mode === 'pinch' && pointers.size === 2) {
			e.preventDefault();
			schedule();
			return;
		}

		if (pointers.size !== 1) return;
		if (mode === 'select') return;

		// 태블릿의 글자 선택은 길게 누르기로 시작하므로 손가락이 움직일 때쯤 이미 선택이 있다.
		// 그때는 팬하지 않고 브라우저 기본 선택에 넘긴다
		const sel = getSelection();
		if (sel && !sel.isCollapsed) {
			mode = 'select';
			return;
		}

		e.preventDefault();
		pendingDx += e.clientX - lastX;
		pendingDy += e.clientY - lastY;
		lastX = e.clientX;
		lastY = e.clientY;
		schedule();
	}

	function up(e: PointerEvent) {
		if (!pointers.delete(e.pointerId)) return;

		if (pointers.size === 2) {
			resetPinch();
		} else if (pointers.size === 1) {
			const [rest] = twoPoints();
			if (rest) beginPan(rest);
		} else {
			// 마지막 손가락이 떨어졌다. 방금까지 팬 중이고 속도가 충분하면 관성 스크롤을 이어간다
			const fresh = now() - lastPanTime < 80;
			cancelPending();
			if (mode === 'pan' && fresh && Math.hypot(velX, velY) >= 0.02) {
				startInertia();
			} else {
				velX = velY = 0;
			}
			mode = null;
		}
	}

	return { down, move, up, cancel: up };
}

<script lang="ts">
	// 루트 레이아웃은 토큰과 <head>만 맡는다. 셸은 (app) 묶음이 씌운다(design 결정 1).
	import '$lib/styles/tokens.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// 화면 검사(scripts/ui-screens.mjs)가 클릭 전에 하이드레이션 완료를 기다리는 표시
	$effect(() => {
		document.body.dataset.hydrated = '1';
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<style>
	:global(html) {
		color-scheme: light dark;
	}

	:global(body) {
		margin: 0;
		background: var(--color-canvas);
		color: var(--color-text);
		font-family: var(--font-sans);
		font-size: var(--fs-14);
		line-height: var(--lh-normal);
	}

	:global(*, *::before, *::after) {
		box-sizing: border-box;
	}

	:global(.sr-only) {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}

	:global(a) {
		color: var(--color-accent-hover);
	}

	:global(a:focus-visible) {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
		border-radius: 2px;
	}
</style>

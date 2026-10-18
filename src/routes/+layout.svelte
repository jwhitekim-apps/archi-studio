<script lang="ts">
	import '$lib/styles/tokens.css';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import AppShell from '$lib/components/AppShell.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<AppShell hasPanel={page.data.hasPanel !== false}>
	{@render children()}
</AppShell>

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
</style>

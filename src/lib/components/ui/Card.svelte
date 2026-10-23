<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		as = 'div',
		padded = true,
		children
	}: { as?: 'div' | 'article' | 'section' | 'li'; padded?: boolean; children: Snippet } = $props();
</script>

<svelte:element this={as} class="card" class:padded>
	{@render children()}
</svelte:element>

<style>
	.card {
		min-width: 0;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		box-shadow: var(--shadow-card);
	}

	.padded {
		padding: var(--space-lg);
	}
</style>

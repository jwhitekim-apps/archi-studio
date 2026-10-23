<script lang="ts">
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<main class="auth">
	<div class="card">
		<p class="wordmark">Archi Studio</p>
		{@render children()}
	</div>
</main>

<style>
	.auth {
		display: grid;
		place-items: center;
		min-height: 100dvh;
		padding: var(--space-xl) var(--space-lg);
	}

	.card {
		display: grid;
		gap: var(--space-lg);
		width: min(400px, 100%);
		padding: var(--space-xl);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		box-shadow: var(--shadow-card);
	}

	.wordmark {
		margin: 0;
		font-size: var(--fs-18);
		font-weight: var(--fw-800);
		color: var(--color-accent-hover);
	}
</style>

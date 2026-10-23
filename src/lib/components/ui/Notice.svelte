<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	// 알림 줄. 오류는 즉시 읽히는 알림(role=alert), 나머지는 정중한 상태 안내(role=status)다.
	let {
		kind = 'info',
		children,
		action
	}: { kind?: 'info' | 'success' | 'error'; children: Snippet; action?: Snippet } = $props();
</script>

<div class="notice {kind}" role={kind === 'error' ? 'alert' : 'status'}>
	<Icon name={kind === 'error' ? 'alert' : kind === 'success' ? 'check' : 'alert'} size={16} />
	<div class="body">{@render children()}</div>
	{#if action}<div class="action">{@render action()}</div>{/if}
</div>

<style>
	.notice {
		display: flex;
		align-items: flex-start;
		gap: var(--space-sm);
		padding: var(--space-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-well);
		color: var(--color-text);
		font-size: var(--fs-14);
		line-height: var(--lh-normal);
	}

	.notice :global(svg) {
		margin-top: 3px;
	}

	.success {
		border-color: var(--color-accent);
		background: var(--color-accent-soft);
	}

	.error {
		border-color: var(--color-error);
		background: var(--color-error-soft);
		color: var(--color-error);
	}

	.body {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.action {
		flex: none;
	}
</style>

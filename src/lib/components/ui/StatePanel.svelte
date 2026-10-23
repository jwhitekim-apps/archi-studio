<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import Spinner from './Spinner.svelte';

	// 불러오는 중, 내용 없음, 오류를 같은 모양으로 보여준다. 오류는 role=alert, 나머지는 role=status.
	let {
		kind,
		title,
		description,
		action
	}: {
		kind: 'loading' | 'empty' | 'error';
		title: string;
		description?: string;
		// 다음 행동 버튼 하나(다시 시도, 연결 등)
		action?: Snippet;
	} = $props();
</script>

<div class="state {kind}" role={kind === 'error' ? 'alert' : 'status'} aria-busy={kind === 'loading' || undefined}>
	<div class="mark">
		{#if kind === 'loading'}
			<Spinner size={22} />
		{:else if kind === 'error'}
			<Icon name="alert" size={24} />
		{:else}
			<Icon name="folder" size={24} />
		{/if}
	</div>
	<p class="title">{title}</p>
	{#if description}<p class="description">{description}</p>{/if}
	{#if action}<div class="action">{@render action()}</div>{/if}
</div>

<style>
	.state {
		display: grid;
		justify-items: center;
		gap: var(--space-sm);
		padding: var(--space-2xl) var(--space-lg);
		border: 1px dashed var(--color-border-strong);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		text-align: center;
	}

	.mark {
		color: var(--color-text-muted);
	}

	.error {
		border-style: solid;
		border-color: var(--color-error);
	}

	.error .mark,
	.error .title {
		color: var(--color-error);
	}

	.title {
		margin: 0;
		font-size: var(--fs-15);
		font-weight: var(--fw-650);
		color: var(--color-text);
	}

	.description {
		max-width: 46ch;
		margin: 0;
		font-size: var(--fs-14);
		color: var(--color-text-muted);
	}

	.action {
		margin-top: var(--space-sm);
	}
</style>

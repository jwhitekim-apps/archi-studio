<script lang="ts">
	import Notice from './Notice.svelte';
	import Spinner from './Spinner.svelte';

	// 글자가 오는 대로 보여주는 영역. 요청은 각 화면이 하고(readTextStream), 여기는 받은 값만 그린다(design 결정 7).
	// 오류가 나도 받은 글자는 그대로 두고 오류를 아래에 따로 알린다.
	let {
		text,
		streaming = false,
		error,
		label = '결과',
		placeholder = ''
	}: { text: string; streaming?: boolean; error?: string; label?: string; placeholder?: string } = $props();
</script>

<div class="stream">
	<div class="output" role="region" aria-label={label} aria-live="polite" aria-busy={streaming}>
		{#if text}{text}{:else if !streaming}<span class="placeholder">{placeholder}</span>{/if}
	</div>
	{#if streaming}
		<p class="progress" role="status"><Spinner size={12} /> 받는 중</p>
	{/if}
	{#if error}
		<Notice kind="error">{error}</Notice>
	{/if}
</div>

<style>
	.stream {
		display: grid;
		gap: var(--space-sm);
		min-width: 0;
	}

	.output {
		min-height: 120px;
		padding: var(--space-lg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: var(--fs-15);
		line-height: var(--lh-relaxed);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.placeholder {
		color: var(--color-text-muted);
	}

	.progress {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--fs-13);
	}
</style>

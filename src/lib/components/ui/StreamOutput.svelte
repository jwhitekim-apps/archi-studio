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
		placeholder = '',
		live = true,
		progressLabel = '받는 중'
	}: {
		text: string;
		streaming?: boolean;
		error?: string;
		label?: string;
		placeholder?: string;
		// false면 조각마다 스크린리더가 읽지 않는다. 완료 안내는 부르는 화면이 따로 한다
		live?: boolean;
		progressLabel?: string;
	} = $props();
</script>

<div class="stream">
	<div class="output" role="region" aria-label={label} aria-live={live ? 'polite' : 'off'} aria-busy={streaming}>
		{#if text}{text}{:else if !streaming}<span class="placeholder">{placeholder}</span>{/if}{#if streaming}<span
				class="cursor"
				aria-hidden="true"
			></span>{/if}
	</div>
	{#if streaming}
		<p class="progress"><Spinner size={12} /> {progressLabel}</p>
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

	.cursor {
		display: inline-block;
		width: 2px;
		height: 1.1em;
		margin-left: 1px;
		vertical-align: text-bottom;
		background: var(--color-accent);
		animation: blink 1s steps(1) infinite;
	}

	@keyframes blink {
		50% {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.cursor {
			animation: none;
		}
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

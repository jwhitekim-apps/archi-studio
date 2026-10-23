<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = Omit<HTMLInputAttributes, 'value'> & {
		label: string;
		value?: string;
		// 입력 아래 도움말. 오류가 있어도 함께 읽힌다
		hint?: string;
		// 있으면 입력창이 오류 상태가 되고 문구를 설명으로 가리킨다(aria-invalid, aria-describedby)
		error?: string;
		input?: HTMLInputElement;
	};

	let { label, value = $bindable(''), hint, error, input = $bindable(), id, type = 'text', ...rest }: Props = $props();

	const uid = $props.id();
	const inputId = $derived(id ?? `field-${uid}`);
	const describedBy = $derived(
		[hint && `${inputId}-hint`, error && `${inputId}-error`].filter(Boolean).join(' ') || undefined
	);
</script>

<div class="field">
	<label for={inputId}>{label}</label>
	<input
		{...rest}
		id={inputId}
		{type}
		bind:value
		bind:this={input}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={describedBy}
	/>
	{#if hint}<p id="{inputId}-hint" class="hint">{hint}</p>{/if}
	{#if error}<p id="{inputId}-error" class="error">{error}</p>{/if}
</div>

<style>
	.field {
		display: grid;
		gap: var(--space-xs);
		min-width: 0;
	}

	label {
		font-size: var(--fs-13);
		font-weight: var(--fw-600);
		color: var(--color-text);
	}

	input {
		width: 100%;
		min-height: var(--control-h);
		padding: 0 var(--space-md);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		font-size: var(--fs-15);
	}

	input:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 1px;
	}

	input:disabled {
		background: var(--color-well);
		color: var(--color-text-muted);
		cursor: not-allowed;
	}

	input[aria-invalid='true'] {
		border-color: var(--color-error);
	}

	.hint,
	.error {
		margin: 0;
		font-size: var(--fs-13);
		line-height: var(--lh-tight);
	}

	.hint {
		color: var(--color-text-muted);
	}

	.error {
		color: var(--color-error);
		font-weight: var(--fw-500);
	}
</style>

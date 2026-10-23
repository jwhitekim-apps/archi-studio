<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Icon, { type IconName } from './Icon.svelte';
	import Spinner from './Spinner.svelte';

	type Props = Omit<HTMLButtonAttributes, 'children'> & {
		icon: IconName;
		// 화면에 글자가 없으므로 스크린리더용 이름은 반드시 준다
		label: string;
		busy?: boolean;
		tone?: 'default' | 'danger';
	};

	let { icon, label, busy = false, tone = 'default', type = 'button', onclick, ...rest }: Props = $props();

	function handleClick(event: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }) {
		if (busy) {
			event.preventDefault();
			return;
		}
		onclick?.(event);
	}
</script>

<button
	{...rest}
	class="icon-button"
	class:danger={tone === 'danger'}
	{type}
	aria-label={label}
	title={label}
	aria-busy={busy || undefined}
	aria-disabled={busy || undefined}
	onclick={handleClick}
>
	{#if busy}<Spinner size={14} />{:else}<Icon name={icon} />{/if}
</button>

<style>
	.icon-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: var(--control-h);
		height: var(--control-h);
		padding: 0;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--color-text-muted);
		cursor: pointer;
	}

	.icon-button:hover {
		background: var(--color-hover);
		color: var(--color-text);
	}

	.danger:hover {
		color: var(--color-error);
	}

	.icon-button:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.icon-button:disabled,
	.icon-button[aria-busy='true'] {
		cursor: not-allowed;
		opacity: 0.6;
	}
</style>

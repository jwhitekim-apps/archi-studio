<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Spinner from './Spinner.svelte';

	type Props = Omit<HTMLButtonAttributes, 'children'> & {
		variant?: 'primary' | 'secondary' | 'danger';
		// 진행 중: 포커스는 유지하되 누르거나 Enter를 쳐도 다시 실행하지 않는다(폼 제출도 막는다)
		busy?: boolean;
		// 주면 같은 모양의 링크로 그린다
		href?: string;
		children: Snippet;
	};

	let { variant = 'secondary', busy = false, href, type = 'button', disabled, onclick, children, ...rest }: Props = $props();

	function handleClick(event: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }) {
		if (busy) {
			event.preventDefault();
			return;
		}
		onclick?.(event);
	}
</script>

{#if href}
	<a class="button {variant}" {href}>{@render children()}</a>
{:else}
	<button
		{...rest}
		class="button {variant}"
		{type}
		{disabled}
		aria-busy={busy || undefined}
		aria-disabled={busy || undefined}
		onclick={handleClick}
	>
		{#if busy}<Spinner size={14} />{/if}
		{@render children()}
	</button>
{/if}

<style>
	.button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		min-height: var(--control-h);
		padding: 0 var(--space-lg);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		font-size: var(--fs-14);
		font-weight: var(--fw-600);
		text-decoration: none;
		white-space: nowrap;
		cursor: pointer;
	}

	.button:hover {
		background: var(--color-hover);
	}

	/* 강조 색 위 글자 대비를 위해 기본 버튼은 한 단계 진한 강조 색을 쓴다(라이트 6.1:1, 다크 7.9:1). */
	.primary {
		border-color: var(--color-accent-hover);
		background: var(--color-accent-hover);
		color: var(--color-surface);
	}

	.primary:hover {
		background: color-mix(in srgb, var(--color-accent-hover) 85%, var(--color-text));
	}

	.danger {
		border-color: var(--color-error);
		background: var(--color-error);
		color: var(--color-surface);
	}

	.danger:hover {
		background: color-mix(in srgb, var(--color-error) 85%, var(--color-text));
	}

	.button:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.button:disabled,
	.button[aria-busy='true'] {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.button:disabled:hover {
		background: var(--color-surface);
	}

	.primary:disabled:hover {
		background: var(--color-accent-hover);
	}

	.danger:disabled:hover {
		background: var(--color-error);
	}
</style>

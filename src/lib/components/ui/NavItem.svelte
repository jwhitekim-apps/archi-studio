<script lang="ts">
	import Icon, { type IconName } from './Icon.svelte';

	// 화면이 아직 없는 항목은 href 없이 disabled로 넘긴다: 링크가 아니라 이동하지 않는 비활성 표시가 된다.
	let {
		label,
		href,
		icon,
		active = false,
		disabled = false,
		onclick
	}: {
		label: string;
		href?: string;
		icon?: IconName;
		active?: boolean;
		disabled?: boolean;
		onclick?: () => void;
	} = $props();
</script>

{#if href && !disabled}
	<a class="nav-item" class:active {href} aria-current={active ? 'page' : undefined} {onclick}>
		{#if icon}<Icon name={icon} />{/if}
		<span>{label}</span>
	</a>
{:else}
	<span class="nav-item disabled" aria-disabled="true">
		{#if icon}<Icon name={icon} />{/if}
		<span>{label}</span>
		<span class="soon">준비 중</span>
	</span>
{/if}

<style>
	.nav-item {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		min-height: var(--control-h);
		padding: 0 var(--space-md);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		font-size: var(--fs-14);
		font-weight: var(--fw-500);
		text-decoration: none;
	}

	a.nav-item:hover {
		background: var(--color-hover);
		color: var(--color-text);
	}

	.active {
		background: var(--color-accent-soft);
		color: var(--color-text);
		font-weight: var(--fw-650);
	}

	a.active:hover {
		background: var(--color-accent-soft);
	}

	a.nav-item:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
	}

	.disabled {
		cursor: default;
		opacity: 0.75;
	}

	.soon {
		margin-left: auto;
		font-size: var(--fs-11);
	}
</style>

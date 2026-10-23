<script lang="ts">
	import Icon from './Icon.svelte';

	let {
		value = $bindable(''),
		label = '검색',
		placeholder = '',
		oninput,
		onclear,
		input = $bindable()
	}: {
		value?: string;
		// 화면에 보이지 않는 이름(스크린리더용)
		label?: string;
		placeholder?: string;
		oninput?: (value: string) => void;
		onclear?: () => void;
		input?: HTMLInputElement;
	} = $props();

	function clear() {
		value = '';
		onclear?.();
		input?.focus();
	}
</script>

<div class="search" role="search">
	<span class="lead"><Icon name="search" size={16} /></span>
	<input
		type="search"
		aria-label={label}
		{placeholder}
		bind:value
		bind:this={input}
		oninput={() => oninput?.(value)}
		onkeydown={(event) => {
			if (event.key === 'Escape' && value) {
				event.preventDefault();
				clear();
			}
		}}
	/>
	{#if value}
		<button type="button" class="clear" aria-label="검색어 지우기" title="검색어 지우기" onclick={clear}>
			<Icon name="close" size={16} />
		</button>
	{/if}
</div>

<style>
	.search {
		position: relative;
		display: flex;
		align-items: center;
		min-width: 0;
	}

	.lead {
		position: absolute;
		left: var(--space-md);
		color: var(--color-text-muted);
		pointer-events: none;
	}

	input {
		width: 100%;
		min-height: var(--control-h);
		padding: 0 var(--control-h) 0 calc(var(--space-md) * 2 + 16px);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-pill);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		font-size: var(--fs-15);
	}

	/* 브라우저 기본 지우기 단추 대신 아래 버튼을 쓴다 */
	input::-webkit-search-cancel-button {
		appearance: none;
	}

	input:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 1px;
	}

	.clear {
		position: absolute;
		right: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--control-h);
		height: var(--control-h);
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--color-text-muted);
		cursor: pointer;
	}

	.clear:hover {
		color: var(--color-text);
	}

	.clear:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
	}
</style>

<script lang="ts">
	// 탭 줄. 선택한 탭의 내용은 부르는 쪽이 그린다(tabpanel의 id를 panelId로 넘기면 서로 연결된다).
	let {
		items,
		selected = $bindable(),
		label,
		panelId,
		onchange
	}: {
		items: { id: string; label: string }[];
		selected?: string;
		label: string;
		panelId?: string;
		onchange?: (id: string) => void;
	} = $props();

	const uid = $props.id();
	let tabs: HTMLButtonElement[] = $state([]);

	function select(index: number, focus = false) {
		const item = items[index];
		if (!item) return;
		selected = item.id;
		onchange?.(item.id);
		if (focus) tabs[index]?.focus();
	}

	// 화살표, Home, End로 탭 사이를 옮긴다(WAI-ARIA 탭 패턴)
	function onKeydown(event: KeyboardEvent, index: number) {
		const last = items.length - 1;
		const next = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[
			event.key
		];
		if (next === undefined) return;
		event.preventDefault();
		select(next, true);
	}
</script>

<div class="tabs" role="tablist" aria-label={label}>
	{#each items as item, index (item.id)}
		{@const active = item.id === (selected ?? items[0]?.id)}
		<button
			type="button"
			role="tab"
			id="tab-{uid}-{item.id}"
			class="tab"
			class:active
			aria-selected={active}
			aria-controls={panelId}
			tabindex={active ? 0 : -1}
			bind:this={tabs[index]}
			onclick={() => select(index)}
			onkeydown={(event) => onKeydown(event, index)}
		>
			{item.label}
		</button>
	{/each}
</div>

<style>
	.tabs {
		display: flex;
		gap: var(--space-xs);
		border-bottom: 1px solid var(--color-border);
		overflow-x: auto;
	}

	.tab {
		min-height: var(--control-h);
		padding: 0 var(--space-lg);
		border: 0;
		border-bottom: 2px solid transparent;
		background: transparent;
		color: var(--color-text-muted);
		font: inherit;
		font-size: var(--fs-14);
		font-weight: var(--fw-600);
		white-space: nowrap;
		cursor: pointer;
	}

	.tab:hover {
		color: var(--color-text);
	}

	.active {
		border-bottom-color: var(--color-accent);
		color: var(--color-text);
	}

	.tab:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
	}
</style>

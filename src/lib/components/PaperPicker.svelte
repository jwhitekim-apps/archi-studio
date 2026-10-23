<script lang="ts">
	// 내 논문을 검색해 하나 고르는 목록(design 결정 7). 검색어가 비면 최근 논문 20개다.
	import { apiFetch } from '$lib/api/client';
	import type { PaperList, PaperListItem } from '$lib/api/types';
	import { Button, SearchField, StatePanel } from '$lib/components/ui';
	import { A } from '$lib/messages/analyze';

	let { onselect }: { onselect: (paper: PaperListItem) => void } = $props();

	const DEBOUNCE_MS = 300;
	const uid = $props.id();

	let query = $state('');
	let items: PaperListItem[] = $state([]);
	let loading = $state(true);
	let failed = $state(false);
	let searched = $state('');
	let active = $state(-1);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let request = 0;

	async function load(q: string) {
		const current = ++request;
		loading = true;
		failed = false;
		const params = new URLSearchParams();
		if (q) params.set('query', q);
		params.set('limit', '20');
		try {
			const list = await apiFetch<PaperList>(`/api/papers?${params}`, { redirectOn401: false });
			if (current !== request) return;
			items = list.items;
			searched = q;
			active = items.length ? 0 : -1;
		} catch {
			if (current === request) failed = true;
		} finally {
			if (current === request) loading = false;
		}
	}

	$effect(() => {
		void load('');
		return () => clearTimeout(timer);
	});

	function onInput(value: string) {
		clearTimeout(timer);
		timer = setTimeout(() => void load(value.trim()), DEBOUNCE_MS);
	}

	function onClear() {
		clearTimeout(timer);
		void load('');
	}

	function onKeydown(event: KeyboardEvent) {
		if (!items.length) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			active = (active + 1) % items.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			active = (active - 1 + items.length) % items.length;
		} else if (event.key === 'Enter' && active >= 0) {
			event.preventDefault();
			onselect(items[active]);
		}
	}

	$effect(() => {
		if (active >= 0) document.getElementById(`${uid}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
	});
</script>

<div class="picker">
	<p class="help" id="{uid}-help">{A.pickerHelp}</p>
	<SearchField
		bind:value={query}
		label={A.pickerLabel}
		placeholder={A.pickerPlaceholder}
		oninput={onInput}
		onclear={onClear}
		onkeydown={onKeydown}
	/>

	{#if loading && !items.length}
		<StatePanel kind="loading" title={A.pickerLoading} />
	{:else if failed}
		<StatePanel kind="error" title={A.pickerError}>
			{#snippet action()}<Button onclick={() => load(query.trim())}>{A.retry}</Button>{/snippet}
		</StatePanel>
	{:else if !items.length && !searched}
		<StatePanel kind="empty" title={A.pickerEmptyLibrary} description={A.pickerEmptyLibraryHelp}>
			{#snippet action()}<Button href="/library" variant="primary">{A.pickerGoLibrary}</Button>{/snippet}
		</StatePanel>
	{:else if !items.length}
		<StatePanel kind="empty" title={A.pickerNoResult} />
	{:else}
		<ul class="options" role="listbox" aria-label={A.pickerLabel} aria-describedby="{uid}-help">
			{#each items as paper, index (paper.id)}
				<li
					id="{uid}-option-{index}"
					role="option"
					aria-selected={index === active}
					class:active={index === active}
				>
					<button type="button" onclick={() => onselect(paper)} onfocus={() => (active = index)}>
						<span class="title">{paper.title || '제목 없음'}</span>
						<span class="meta">
							{paper.authors.slice(0, 3).join(', ') || '저자 정보 없음'}{paper.year ? ` · ${paper.year}` : ''}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.picker {
		display: grid;
		gap: var(--space-md);
	}

	.help {
		margin: 0;
		color: var(--color-text-muted);
	}

	.options {
		display: grid;
		gap: var(--space-xs);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.options button {
		display: grid;
		gap: 2px;
		width: 100%;
		padding: var(--space-sm) var(--space-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.options button:hover,
	.active button {
		background: var(--color-hover);
	}

	.active button {
		border-color: var(--color-accent);
	}

	.options button:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 1px;
	}

	.title {
		font-weight: var(--fw-650);
		overflow-wrap: anywhere;
	}

	.meta {
		color: var(--color-text-muted);
		font-size: var(--fs-13);
	}
</style>

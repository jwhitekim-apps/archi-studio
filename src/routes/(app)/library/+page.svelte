<script lang="ts">
	import { untrack } from 'svelte';
	import { goto, invalidate } from '$app/navigation';
	import { ApiError, apiFetch } from '$lib/api/client';
	import { errorMessage } from '$lib/api/messages';
	import type { Collection, PaperList, PaperListItem, SyncResult, ZoteroStatus } from '$lib/api/types';
	import { Button, ConfirmDialog, IconButton, Notice, SearchField, StatePanel, TextField } from '$lib/components/ui';
	import { flattenCollections, libraryHref, papersPath, SEARCH_DEBOUNCE_MS, syncSummary } from '$lib/library';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// 목록: 주소가 바뀌면 처음부터, '더 보기'는 뒤에 이어 붙인다. 늦게 끝난 이전 요청은 버린다.
	let items: PaperListItem[] = $state([]);
	let nextCursor: string | null = $state(null);
	let loading = $state(true);
	let listError = $state('');
	let moreBusy = $state(false);
	let moreError = $state('');
	let generation = 0;

	$effect(() => {
		const current = ++generation;
		const promise = data.papers;
		loading = true;
		listError = '';
		moreError = '';
		promise.then(
			(list) => {
				if (current !== generation) return;
				items = list.items;
				nextCursor = list.nextCursor;
				loading = false;
			},
			(error) => {
				if (current !== generation) return;
				items = [];
				nextCursor = null;
				listError = errorMessage(error);
				loading = false;
			}
		);
	});

	let collections: Collection[] = $state([]);
	let zotero = $state<ZoteroStatus | null>(null);
	let zoteroKnown = $state(false);
	$effect(() => {
		data.collections.then((value) => (collections = value));
	});
	$effect(() => {
		zoteroKnown = false;
		data.zotero.then((value) => {
			zotero = value;
			zoteroKnown = true;
		});
	});

	const tree = $derived(flattenCollections(collections));
	const selectedCollection = $derived(collections.find((c) => c.key === data.collection));
	// 상태를 모르면(요청 실패) 연결 안내를 띄우지 않는다
	const disconnected = $derived(zoteroKnown && zotero !== null && !zotero.connected);

	async function loadMore() {
		if (!nextCursor) return;
		const current = generation;
		moreBusy = true;
		moreError = '';
		try {
			const list = await apiFetch<PaperList>(papersPath(data.query, data.collection, nextCursor));
			if (current !== generation) return;
			items = [...items, ...list.items];
			nextCursor = list.nextCursor;
		} catch (error) {
			if (current === generation) moreError = errorMessage(error);
		} finally {
			moreBusy = false;
		}
	}

	// 검색: 입력을 멈추고 280ms 뒤 주소만 바꾼다. 데이터는 load가 다시 가져온다.
	// 처음 값만 쓰고, 이후 주소 변경은 아래 $effect가 맞춘다
	let search = $state(untrack(() => data.query));
	let lastQuery = untrack(() => data.query);
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		// 뒤로 가기 등으로 주소가 바뀌면 입력창도 맞춘다
		if (data.query !== lastQuery) {
			lastQuery = data.query;
			search = data.query;
		}
	});

	function navigate(query: string, collection: string) {
		lastQuery = query;
		return goto(libraryHref(query, collection), { replaceState: true, keepFocus: true, noScroll: true });
	}

	function onSearchInput(value: string) {
		clearTimeout(timer);
		timer = setTimeout(() => navigate(value.trim(), data.collection), SEARCH_DEBOUNCE_MS);
	}

	function clearSearch() {
		clearTimeout(timer);
		search = '';
		void navigate('', data.collection);
	}

	$effect(() => () => clearTimeout(timer));

	function toggleCollection(key: string) {
		void goto(libraryHref(data.query, data.collection === key ? '' : key), { noScroll: true });
	}

	// Zotero 동기화
	let syncBusy = $state(false);
	let syncNotice = $state('');
	let syncError = $state('');

	async function sync() {
		syncBusy = true;
		syncNotice = '';
		syncError = '';
		try {
			const result = await apiFetch<SyncResult>('/api/zotero/sync', { method: 'POST' });
			syncNotice = syncSummary(result);
			await invalidate('app:library');
		} catch (error) {
			if (error instanceof ApiError && error.code === 'zotero_not_connected') zotero = { connected: false };
			else syncError = errorMessage(error);
		} finally {
			syncBusy = false;
		}
	}

	// 웹페이지 추가
	let addOpen = $state(false);
	let addUrl = $state('');
	let addError = $state('');
	let addBusy = $state(false);
	let addInput: HTMLInputElement | undefined = $state();

	async function openAdd() {
		addOpen = true;
		addError = '';
		await Promise.resolve();
		addInput?.focus();
	}

	async function addWebpage(event: SubmitEvent) {
		event.preventDefault();
		const url = addUrl.trim();
		if (!url) {
			addError = '웹페이지 주소를 입력해 주세요.';
			return addInput?.focus();
		}
		addBusy = true;
		addError = '';
		try {
			await apiFetch('/api/papers/webpage', { method: 'POST', body: { url } });
			addOpen = false;
			addUrl = '';
			await invalidate('app:library');
		} catch (error) {
			if (error instanceof ApiError && error.code === 'invalid_request') {
				addError = '웹페이지 주소가 올바르지 않습니다. http:// 또는 https://로 시작하는 주소를 넣어 주세요.';
			} else if (error instanceof ApiError && error.code === 'zotero_not_connected') {
				addOpen = false;
				zotero = { connected: false };
			} else {
				addError = errorMessage(error);
			}
			addInput?.focus();
		} finally {
			addBusy = false;
		}
	}

	// 논문 삭제
	let target: PaperListItem | null = $state(null);
	let deleteOpen = $state(false);
	let deleteBusy = $state(false);
	let deleteError = $state('');

	function askDelete(paper: PaperListItem) {
		target = paper;
		deleteError = '';
		deleteOpen = true;
	}

	async function confirmDelete() {
		if (!target) return;
		const id = target.id;
		deleteBusy = true;
		deleteError = '';
		try {
			await apiFetch(`/api/papers/${id}`, { method: 'DELETE' });
			items = items.filter((p) => p.id !== id);
			deleteOpen = false;
		} catch (error) {
			deleteError = errorMessage(error);
		} finally {
			deleteBusy = false;
		}
	}

	const filtered = $derived(Boolean(data.query || data.collection));
</script>

<svelte:head>
	<title>서재 · Archi Studio</title>
</svelte:head>

<div class="library">
	<header class="head">
		<h1>서재</h1>
		<div class="tools">
			{#if zotero?.connected}
				<Button onclick={sync} busy={syncBusy}>동기화</Button>
			{/if}
			<Button variant="primary" onclick={openAdd} disabled={disconnected}>웹페이지 추가</Button>
		</div>
	</header>

	{#if syncNotice}<Notice kind="success">{syncNotice}</Notice>{/if}
	{#if syncError}<Notice kind="error">{syncError}</Notice>{/if}

	{#if addOpen}
		<form class="add" novalidate onsubmit={addWebpage}>
			<TextField
				label="웹페이지 주소"
				type="url"
				placeholder="https://"
				bind:value={addUrl}
				bind:input={addInput}
				error={addError}
			/>
			<div class="add-actions">
				<Button onclick={() => (addOpen = false)} disabled={addBusy}>취소</Button>
				<Button type="submit" variant="primary" busy={addBusy}>추가</Button>
			</div>
		</form>
	{/if}

	{#if disconnected && !loading && items.length === 0 && !filtered}
		<StatePanel
			kind="empty"
			title="Zotero를 연결해 주세요"
			description="Zotero 계정을 연결하면 내 논문이 이 서재에 나타납니다."
		>
			{#snippet action()}<Button href="/api/zotero/connect" variant="primary">Zotero 연결</Button>{/snippet}
		</StatePanel>
	{:else}
		{#if disconnected}
			<Notice>
				Zotero가 연결되어 있지 않아 새 논문을 불러올 수 없습니다.
				{#snippet action()}<Button href="/api/zotero/connect">연결</Button>{/snippet}
			</Notice>
		{/if}

		<div class="filters">
			<SearchField
				bind:value={search}
				label="논문 검색"
				placeholder="제목이나 저자로 검색"
				oninput={onSearchInput}
				onclear={clearSearch}
			/>
			{#if tree.length}
				<details class="collections">
					<summary>컬렉션: {selectedCollection?.name ?? '전체'}</summary>
					<ul>
						<li>
							<button type="button" class="collection" aria-pressed={!data.collection} onclick={() => toggleCollection('')}>
								전체
							</button>
						</li>
						{#each tree as c (c.key)}
							<li style:--depth={c.depth}>
								<button
									type="button"
									class="collection"
									aria-pressed={data.collection === c.key}
									onclick={() => toggleCollection(c.key)}
								>
									<span class="name">{c.name}</span>
									<span class="count">{c.paperCount}</span>
								</button>
							</li>
						{/each}
					</ul>
				</details>
			{/if}
		</div>

		{#if loading}
			<StatePanel kind="loading" title="논문을 불러오는 중입니다" />
		{:else if listError}
			<StatePanel kind="error" title="목록을 불러오지 못했습니다" description={listError}>
				{#snippet action()}<Button onclick={() => invalidate('app:library')}>다시 시도</Button>{/snippet}
			</StatePanel>
		{:else if items.length === 0 && filtered}
			<StatePanel kind="empty" title="검색어에 맞는 논문이 없습니다" description="다른 검색어를 쓰거나 컬렉션 선택을 풀어 보세요.">
				{#snippet action()}
					<Button onclick={() => (data.query ? clearSearch() : toggleCollection(data.collection))}>
						{data.query ? '검색어 지우기' : '컬렉션 선택 풀기'}
					</Button>
				{/snippet}
			</StatePanel>
		{:else if items.length === 0}
			<StatePanel kind="empty" title="서재가 비어 있습니다" description="동기화를 누르면 Zotero의 논문을 불러옵니다." />
		{:else}
			<ul class="papers" aria-label="논문 목록">
				{#each items as paper (paper.id)}
					<li class="paper">
						<a class="paper-link" href="/papers/{paper.id}">
							<span class="title">{paper.title || '제목 없음'}</span>
							<span class="meta">
								{paper.authors.length ? paper.authors.slice(0, 3).join(', ') : '저자 정보 없음'}{paper.authors.length > 3
									? ' 외'
									: ''}{paper.year ? ` · ${paper.year}` : ''}
							</span>
							<span class="badges">
								{#if paper.hasPdf}<span class="badge">PDF</span>{/if}
								{#if paper.hasMemo}<span class="badge">메모</span>{/if}
							</span>
						</a>
						<IconButton icon="trash" tone="danger" label="{paper.title || '제목 없음'} 삭제" onclick={() => askDelete(paper)} />
					</li>
				{/each}
			</ul>
			{#if moreError}<Notice kind="error">{moreError}</Notice>{/if}
			{#if nextCursor}
				<div class="more"><Button onclick={loadMore} busy={moreBusy}>더 보기</Button></div>
			{/if}
		{/if}
	{/if}
</div>

<ConfirmDialog
	bind:open={deleteOpen}
	title="논문을 삭제할까요?"
	confirmLabel="삭제"
	danger
	busy={deleteBusy}
	error={deleteError}
	onconfirm={confirmDelete}
>
	<p><strong>{target?.title || '제목 없음'}</strong></p>
	<p>Zotero 휴지통으로 이동하고 연결된 번역·분석 이력도 함께 삭제됩니다.</p>
</ConfirmDialog>

<style>
	.library {
		display: grid;
		gap: var(--space-lg);
		max-width: var(--read-w);
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
	}

	h1 {
		margin: 0;
		font-size: var(--fs-22);
		font-weight: var(--fw-700);
	}

	.tools,
	.add-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
	}

	.add {
		display: grid;
		gap: var(--space-md);
		padding: var(--space-lg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
	}

	.add-actions {
		justify-content: flex-end;
	}

	.filters {
		display: grid;
		gap: var(--space-sm);
	}

	.collections summary {
		display: flex;
		align-items: center;
		min-height: var(--control-h);
		padding: 0 var(--space-md);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		font-weight: var(--fw-600);
		cursor: pointer;
	}

	.collections summary:hover {
		background: var(--color-hover);
	}

	.collections summary:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
	}

	.collections ul {
		display: grid;
		gap: 2px;
		margin: var(--space-xs) 0 0;
		padding: var(--space-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		list-style: none;
	}

	.collection {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		width: 100%;
		min-height: 36px;
		padding: 0 var(--space-md) 0 calc(var(--space-md) + var(--depth, 0) * var(--space-lg));
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--color-text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.collection:hover {
		background: var(--color-hover);
	}

	.collection[aria-pressed='true'] {
		background: var(--color-accent-soft);
		font-weight: var(--fw-650);
	}

	.collection:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
	}

	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.count {
		color: var(--color-text-muted);
		font-size: var(--fs-12);
	}

	.papers {
		display: grid;
		gap: var(--space-sm);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.paper {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding-right: var(--space-xs);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		box-shadow: var(--shadow-card);
	}

	.paper-link {
		display: grid;
		gap: var(--space-xs);
		flex: 1;
		min-width: 0;
		padding: var(--space-md) var(--space-lg);
		border-radius: var(--radius-lg);
		color: var(--color-text);
		text-decoration: none;
	}

	.paper-link:hover .title {
		text-decoration: underline;
	}

	.paper-link:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
	}

	.title {
		font-size: var(--fs-15);
		font-weight: var(--fw-650);
		line-height: var(--lh-tight);
		overflow-wrap: anywhere;
	}

	.meta {
		color: var(--color-text-muted);
		font-size: var(--fs-13);
		overflow-wrap: anywhere;
	}

	.badges {
		display: flex;
		gap: var(--space-xs);
	}

	.badges:empty {
		display: none;
	}

	.badge {
		padding: 1px var(--space-sm);
		border-radius: var(--radius-pill);
		background: var(--color-well);
		color: var(--color-text-muted);
		font-size: var(--fs-12);
		font-weight: var(--fw-600);
	}

	.more {
		display: flex;
		justify-content: center;
	}
</style>

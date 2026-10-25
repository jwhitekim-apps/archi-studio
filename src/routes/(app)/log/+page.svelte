<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { ApiError, apiFetch, loginUrl } from '$lib/api/client';
	import { errorMessage } from '$lib/api/messages';
	import { appendUnique, briefingsPath, formatBriefingDate, type BriefingList, type BriefingListItem } from '$lib/briefing';
	import { Button, Notice, StatePanel } from '$lib/components/ui';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// 첫 묶음은 load가, '더 보기'는 여기서 불러와 뒤에 붙인다. 늦게 끝난 이전 요청은 버린다.
	let items: BriefingListItem[] = $state([]);
	let nextCursor: string | null = $state(null);
	let loading = $state(true);
	let listError = $state('');
	let moreBusy = $state(false);
	let moreError = $state('');
	let moreExpired = $state(false);
	let generation = 0;

	$effect(() => {
		const current = ++generation;
		loading = true;
		listError = '';
		moreError = '';
		moreExpired = false;
		data.list.then(
			(list) => {
				if (current !== generation) return;
				items = appendUnique([], list.items);
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

	async function loadMore() {
		if (!nextCursor) return;
		const current = generation;
		moreBusy = true;
		moreError = '';
		try {
			// 401이어도 보이는 목록을 지키려고 로그인 화면으로 바로 보내지 않는다
			const list = await apiFetch<BriefingList>(briefingsPath(nextCursor), { redirectOn401: false });
			if (current !== generation) return;
			items = appendUnique(items, list.items);
			nextCursor = list.nextCursor;
		} catch (error) {
			if (current !== generation) return;
			moreExpired = error instanceof ApiError && error.status === 401;
			moreError = errorMessage(error);
		} finally {
			moreBusy = false;
		}
	}
</script>

<svelte:head>
	<title>브리핑 · Archi Studio</title>
</svelte:head>

<div class="log">
	<header class="head">
		<h1>브리핑</h1>
		<p class="lead">비서가 하루 한 번 정리한 브리핑입니다.</p>
	</header>

	{#if loading}
		<StatePanel kind="loading" title="브리핑을 불러오는 중입니다" />
	{:else if listError}
		<StatePanel kind="error" title="브리핑을 불러오지 못했습니다" description={listError}>
			{#snippet action()}<Button onclick={() => invalidate('app:briefings')}>다시 시도</Button>{/snippet}
		</StatePanel>
	{:else if items.length === 0}
		<StatePanel kind="empty" title="아직 브리핑이 없어요" description="비서가 하루 한 번 브리핑을 만들면 여기에 쌓입니다." />
	{:else}
		<ul class="briefings" aria-label="브리핑 목록">
			{#each items as item (item.id)}
				<li>
					<a class="item" href="/log/{item.id}">
						<span class="date">{formatBriefingDate(item.date)}</span>
						<span class="summary">{item.summary}</span>
					</a>
				</li>
			{/each}
		</ul>
		{#if moreError}
			<Notice kind="error">
				{moreError}
				{#snippet action()}
					{#if moreExpired}
						<Button href={loginUrl(page.url, true)}>로그인</Button>
					{:else}
						<Button onclick={loadMore} busy={moreBusy}>다시 시도</Button>
					{/if}
				{/snippet}
			</Notice>
		{/if}
		{#if nextCursor && !moreError}
			<div class="more"><Button onclick={loadMore} busy={moreBusy}>더 보기</Button></div>
		{/if}
	{/if}
</div>

<style>
	.log {
		display: grid;
		gap: var(--space-lg);
		max-width: var(--read-w);
		min-width: 0;
	}

	.head {
		display: grid;
		gap: var(--space-xs);
	}

	h1 {
		margin: 0;
		font-size: var(--fs-22);
		font-weight: var(--fw-700);
	}

	.lead {
		margin: 0;
		font-size: var(--fs-14);
		color: var(--color-text-muted);
	}

	.briefings {
		display: grid;
		gap: var(--space-sm);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.item {
		display: grid;
		gap: var(--space-xs);
		min-width: 0;
		padding: var(--space-md) var(--space-lg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		color: var(--color-text);
		text-decoration: none;
	}

	.item:hover {
		background: var(--color-hover);
	}

	.item:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.date {
		font-size: var(--fs-14);
		font-weight: var(--fw-650);
		color: var(--color-text-muted);
	}

	.summary {
		font-size: var(--fs-15);
		overflow-wrap: anywhere;
	}

	.more {
		display: flex;
		justify-content: center;
	}
</style>

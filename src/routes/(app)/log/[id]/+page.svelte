<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { ApiError } from '$lib/api/client';
	import { errorMessage } from '$lib/api/messages';
	import { formatBriefingDate, paperLabel, type BriefingView } from '$lib/briefing';
	import { Button, StatePanel } from '$lib/components/ui';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let view: BriefingView | null = $state(null);
	let loading = $state(true);
	let notFound = $state(false);
	let loadError = $state('');
	let generation = 0;

	$effect(() => {
		const current = ++generation;
		loading = true;
		notFound = false;
		loadError = '';
		data.view.then(
			(value) => {
				if (current !== generation) return;
				view = value;
				loading = false;
			},
			(error) => {
				if (current !== generation) return;
				view = null;
				notFound = error instanceof ApiError && error.status === 404;
				loadError = errorMessage(error);
				loading = false;
			}
		);
	});
</script>

<svelte:head>
	<title>{view ? formatBriefingDate(view.briefing.date) : '브리핑'} · Archi Studio</title>
</svelte:head>

<div class="detail">
	<a class="back" href="/log">← 브리핑 목록</a>

	{#if loading}
		<StatePanel kind="loading" title="브리핑을 불러오는 중입니다" />
	{:else if notFound}
		<StatePanel kind="empty" title="브리핑을 찾을 수 없습니다" description="주소가 맞는지 확인해 주세요.">
			{#snippet action()}<Button href="/log">브리핑 목록으로</Button>{/snippet}
		</StatePanel>
	{:else if loadError || !view}
		<StatePanel kind="error" title="브리핑을 불러오지 못했습니다" description={loadError}>
			{#snippet action()}<Button onclick={() => invalidate('app:briefing')}>다시 시도</Button>{/snippet}
		</StatePanel>
	{:else}
		<article class="briefing">
			<header class="head">
				<h1>{formatBriefingDate(view.briefing.date)}</h1>
				<p class="summary">{view.briefing.summary}</p>
			</header>
			<!-- 바깥에서 온 글이 섞일 수 있어 글자 그대로만 그린다(design 결정 3) -->
			<div class="body" data-testid="briefing-body">{view.briefing.body}</div>
			{#if view.papers.length || view.hiddenPapers}
				<section class="papers" aria-labelledby="papers-title">
					<h2 id="papers-title">언급된 논문</h2>
					<ul>
						{#each view.papers as paper (paper.id)}
							<li><a href="/papers/{paper.id}">{paperLabel(paper)}</a></li>
						{/each}
					</ul>
					{#if view.hiddenPapers}<p class="hidden">외 {view.hiddenPapers}편</p>{/if}
				</section>
			{/if}
		</article>
	{/if}
</div>

<style>
	.detail {
		display: grid;
		gap: var(--space-lg);
		max-width: var(--read-w);
		min-width: 0;
	}

	.back {
		justify-self: start;
		color: var(--color-text-muted);
		font-size: var(--fs-14);
		font-weight: var(--fw-600);
		text-decoration: none;
	}

	.back:hover {
		color: var(--color-text);
	}

	.back:focus-visible,
	.papers a:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.briefing {
		display: grid;
		gap: var(--space-lg);
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

	.summary {
		margin: 0;
		font-size: var(--fs-15);
		color: var(--color-text-muted);
		overflow-wrap: anywhere;
	}

	.body {
		padding: var(--space-lg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		font-size: var(--fs-15);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.papers {
		display: grid;
		gap: var(--space-sm);
	}

	h2 {
		margin: 0;
		font-size: var(--fs-15);
		font-weight: var(--fw-650);
	}

	.papers ul {
		display: grid;
		gap: var(--space-xs);
		margin: 0;
		padding-left: var(--space-lg);
	}

	.papers a {
		color: var(--color-accent);
		overflow-wrap: anywhere;
	}

	.hidden {
		margin: 0;
		font-size: var(--fs-14);
		color: var(--color-text-muted);
	}
</style>

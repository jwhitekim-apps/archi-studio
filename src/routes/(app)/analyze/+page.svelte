<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ApiError, apiFetch, loginUrl } from '$lib/api/client';
	import type { Analysis, PaperDetail, PaperListItem } from '$lib/api/types';
	import AnalysisResult from '$lib/components/AnalysisResult.svelte';
	import PanelContent from '$lib/components/PanelContent.svelte';
	import PaperPicker from '$lib/components/PaperPicker.svelte';
	import { Button, StatePanel } from '$lib/components/ui';
	import { A } from '$lib/messages/analyze';
	import { isUuid } from '$lib/uuid';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// loading: 저장된 분석 조회 중, missing: 저장된 분석 없음, running: 분석 실행 중
	type View =
		| { kind: 'loading' }
		| { kind: 'result'; analysis: Analysis }
		| { kind: 'missing' }
		| { kind: 'running' }
		| { kind: 'notFound' }
		| { kind: 'error'; message: string; retry: 'get' | 'post' | null; login: boolean };

	let view = $state<View>({ kind: 'loading' });
	let paperTitle = $state('');
	let request = 0;

	const paperId = $derived(data.paperId);
	const validId = $derived(isUuid(paperId) ? paperId : null);

	function errorView(error: unknown, retry: 'get' | 'post'): View {
		if (error instanceof ApiError) {
			if (error.status === 401) return { kind: 'error', message: A.errLogin, retry: null, login: true };
			if (error.code === 'paper_not_found') return { kind: 'notFound' };
			if (error.code === 'no_source_for_analysis') return { kind: 'error', message: A.errNoSource, retry: null, login: false };
		}
		return { kind: 'error', message: retry === 'get' ? A.errLoad : A.errTemporary, retry, login: false };
	}

	async function loadSaved(id: string) {
		const current = ++request;
		view = { kind: 'loading' };
		try {
			const analysis = await apiFetch<Analysis>(`/api/papers/${id}/analysis`, { redirectOn401: false });
			if (current === request) view = { kind: 'result', analysis };
		} catch (error) {
			if (current !== request) return;
			view = error instanceof ApiError && error.code === 'analysis_not_found' ? { kind: 'missing' } : errorView(error, 'get');
		}
	}

	async function run() {
		const id = validId;
		// 진행 중이면 다시 보내지 않는다
		if (!id || view.kind === 'running') return;
		const current = ++request;
		view = { kind: 'running' };
		try {
			const analysis = await apiFetch<Analysis>(`/api/papers/${id}/analysis`, { method: 'POST', redirectOn401: false });
			if (current === request) view = { kind: 'result', analysis };
		} catch (error) {
			if (current === request) view = errorView(error, 'post');
		}
	}

	$effect(() => {
		const id = paperId;
		paperTitle = '';
		if (!id) return;
		if (!isUuid(id)) {
			view = { kind: 'notFound' };
			return;
		}
		void loadSaved(id);
		apiFetch<PaperDetail>(`/api/papers/${id}`, { redirectOn401: false }).then(
			(paper) => {
				if (data.paperId === id) paperTitle = paper.title || '제목 없음';
			},
			() => {}
		);
	});

	function select(paper: PaperListItem) {
		void goto(`/analyze?paperId=${paper.id}`);
	}

	function retry(kind: 'get' | 'post') {
		if (!validId) return;
		if (kind === 'get') void loadSaved(validId);
		else void run();
	}
</script>

<svelte:head>
	<title>분석 · Archi Studio</title>
</svelte:head>

<div class="analyze">
	<h1>{A.title}</h1>

	{#if !paperId}
		<PaperPicker onselect={select} />
	{:else if view.kind === 'loading'}
		<StatePanel kind="loading" title={A.loading} />
	{:else if view.kind === 'missing'}
		<StatePanel kind="empty" title={A.notAnalyzed} description={A.notAnalyzedHelp}>
			{#snippet action()}<Button variant="primary" onclick={run}>{A.start}</Button>{/snippet}
		</StatePanel>
	{:else if view.kind === 'running'}
		<StatePanel kind="loading" title={A.analyzing} description={A.analyzingHelp}>
			{#snippet action()}<Button variant="primary" busy onclick={run}>{A.start}</Button>{/snippet}
		</StatePanel>
	{:else if view.kind === 'notFound'}
		<StatePanel kind="error" title={A.errPaperNotFound}>
			{#snippet action()}<Button href="/analyze">{A.backToPicker}</Button>{/snippet}
		</StatePanel>
	{:else if view.kind === 'error'}
		{@const failure = view}
		<StatePanel kind="error" title={failure.message}>
			{#snippet action()}
				{#if failure.login}
					<Button href={loginUrl(page.url)}>{A.login}</Button>
				{:else if failure.retry}
					<Button onclick={() => retry(failure.retry ?? 'get')}>{failure.retry === 'post' ? A.retry : A.reload}</Button>
				{/if}
			{/snippet}
		</StatePanel>
	{:else if view.kind === 'result'}
		<AnalysisResult analysis={view.analysis} fallbackTitle={paperTitle} />
	{/if}
</div>

<PanelContent>
	<div class="settings">
		{#if validId}
			<div class="setting">
				<span class="setting-name">{A.panelTarget}</span>
				<p class="paper-title">{paperTitle || '불러오는 중…'}</p>
				<Button href="/analyze">{A.panelChange}</Button>
			</div>
			<div class="setting">
				<Button onclick={() => validId && loadSaved(validId)} disabled={view.kind === 'running'}>{A.panelReload}</Button>
			</div>
		{:else}
			<p class="paper-title">{A.panelEmpty}</p>
		{/if}
	</div>
</PanelContent>

<style>
	.analyze {
		display: grid;
		gap: var(--space-lg);
		max-width: var(--read-w);
	}

	h1 {
		margin: 0;
		font-size: var(--fs-22);
		font-weight: var(--fw-700);
	}

	.settings {
		display: grid;
		gap: var(--space-xl);
	}

	.setting {
		display: grid;
		gap: var(--space-sm);
		justify-items: start;
	}

	.setting-name {
		font-size: var(--fs-14);
		font-weight: var(--fw-650);
	}

	.paper-title {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--fs-13);
		overflow-wrap: anywhere;
	}
</style>

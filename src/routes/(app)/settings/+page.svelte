<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { apiFetch } from '$lib/api/client';
	import { errorMessage } from '$lib/api/messages';
	import type { ZoteroStatus } from '$lib/api/types';
	import { Button, Card, ConfirmDialog, Notice, StatePanel } from '$lib/components/ui';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const RESULT_MESSAGES: Record<string, string> = {
		denied: 'Zotero에서 승인을 거부해 연결되지 않았습니다. 다시 연결하려면 아래 버튼을 눌러 주세요.',
		error: 'Zotero 연결 중 문제가 생겨 연결되지 않았습니다. 잠시 뒤 다시 연결해 주세요.',
		in_use: '이 Zotero 계정은 이미 다른 사용자가 연결했습니다. 다른 Zotero 계정으로 연결해 주세요.'
	};
	const resultMessage = $derived(data.zoteroResult ? RESULT_MESSAGES[data.zoteroResult] : undefined);

	let status = $state<ZoteroStatus | null>(null);
	let loading = $state(true);
	let loadError = $state('');
	$effect(() => {
		loading = true;
		loadError = '';
		data.zotero.then(
			(value) => {
				status = value;
				loading = false;
			},
			(error) => {
				loadError = errorMessage(error);
				loading = false;
			}
		);
	});

	let confirmOpen = $state(false);
	let busy = $state(false);
	let disconnectError = $state('');
	let disconnected = $state(false);

	async function disconnect() {
		busy = true;
		disconnectError = '';
		try {
			await apiFetch('/api/zotero/connection', { method: 'DELETE' });
			status = { connected: false };
			disconnected = true;
			confirmOpen = false;
		} catch (error) {
			disconnectError = errorMessage(error);
		} finally {
			busy = false;
		}
	}

	const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long', timeStyle: 'short' });
	function formatDate(value: string | null | undefined): string {
		if (!value) return '아직 동기화하지 않았습니다';
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
	}
</script>

<svelte:head>
	<title>설정 · Archi Studio</title>
</svelte:head>

<div class="settings">
	<h1>설정</h1>

	{#if resultMessage && !status?.connected}
		<Notice kind="error">{resultMessage}</Notice>
	{/if}

	<section aria-labelledby="zotero-title">
		<h2 id="zotero-title">Zotero 연결</h2>
		{#if loading}
			<StatePanel kind="loading" title="연결 상태를 확인하는 중입니다" />
		{:else if loadError}
			<StatePanel kind="error" title="연결 상태를 확인하지 못했습니다" description={loadError}>
				{#snippet action()}<Button onclick={() => invalidate('app:settings')}>다시 시도</Button>{/snippet}
			</StatePanel>
		{:else if status?.connected}
			<Card>
				<dl>
					<div><dt>상태</dt><dd>연결됨</dd></div>
					<div><dt>Zotero 사용자명</dt><dd>{status.zoteroUsername || '알 수 없음'}</dd></div>
					<div><dt>마지막 동기화</dt><dd>{formatDate(status.lastSyncedAt)}</dd></div>
				</dl>
				<div class="actions">
					<Button variant="danger" onclick={() => ((disconnectError = ''), (confirmOpen = true))}>연결 해제</Button>
				</div>
			</Card>
		{:else}
			{#if disconnected}
				<Notice kind="success">연결을 해제했습니다. 서재의 논문 목록은 그대로 남아 있습니다.</Notice>
			{/if}
			<Card>
				<p class="state">연결되어 있지 않습니다.</p>
				<p class="help">Zotero를 연결하면 내 논문을 서재로 불러오고 동기화할 수 있습니다.</p>
				<div class="actions">
					<Button href="/api/zotero/connect" variant="primary">
						{resultMessage || disconnected ? 'Zotero 다시 연결' : 'Zotero 연결'}
					</Button>
				</div>
			</Card>
		{/if}
	</section>
</div>

<ConfirmDialog
	bind:open={confirmOpen}
	title="Zotero 연결을 해제할까요?"
	confirmLabel="연결 해제"
	danger
	{busy}
	error={disconnectError}
	onconfirm={disconnect}
>
	<p>저장된 Zotero 연결 정보가 지워져 더 이상 동기화할 수 없습니다.</p>
	<p>이미 불러온 논문 목록은 서재에 그대로 남습니다.</p>
</ConfirmDialog>

<style>
	.settings {
		display: grid;
		gap: var(--space-lg);
		max-width: var(--read-w);
	}

	h1 {
		margin: 0;
		font-size: var(--fs-22);
		font-weight: var(--fw-700);
	}

	section {
		display: grid;
		gap: var(--space-md);
	}

	h2 {
		margin: 0;
		font-size: var(--fs-16);
		font-weight: var(--fw-650);
	}

	dl {
		display: grid;
		gap: var(--space-sm);
		margin: 0;
	}

	dl div {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs) var(--space-lg);
	}

	dt {
		min-width: 120px;
		color: var(--color-text-muted);
	}

	dd {
		margin: 0;
		font-weight: var(--fw-600);
		overflow-wrap: anywhere;
	}

	.state {
		margin: 0 0 var(--space-xs);
		font-weight: var(--fw-650);
	}

	.help {
		margin: 0;
		color: var(--color-text-muted);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		margin-top: var(--space-lg);
	}
</style>

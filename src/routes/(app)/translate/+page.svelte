<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ApiError, apiFetch, loginUrl } from '$lib/api/client';
	import { MESSAGES } from '$lib/api/messages';
	import type { PaperDetail, TranslationRecord } from '$lib/api/types';
	import PanelContent from '$lib/components/PanelContent.svelte';
	import { Button, Notice, StreamOutput } from '$lib/components/ui';
	import { T } from '$lib/messages/translate';
	import { readBool, writeBool } from '$lib/prefs';
	import { isAbortError, MAX_TRANSLATE_CHARS, startTranslation, StreamInterrupted } from '$lib/translate';
	import { isUuid } from '$lib/uuid';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const AUTO_KEY = 'archi.translate.auto';
	const AUTO_DELAY_MS = 300;
	const HISTORY_STEP = 20;

	// ---- 논문 연결 ----
	let paperTitle = $state('');
	let paperMissing = $state(false);
	const linkedId = $derived(isUuid(data.paperId) && !paperMissing ? data.paperId : null);

	$effect(() => {
		const id = data.paperId;
		paperTitle = '';
		paperMissing = false;
		if (!id) return;
		// UUID가 아니면 API를 부르지 않고 없는 논문과 같게 다룬다
		if (!isUuid(id)) {
			paperMissing = true;
			return;
		}
		apiFetch<PaperDetail>(`/api/papers/${id}`, { redirectOn401: false }).then(
			(paper) => {
				if (data.paperId === id) paperTitle = paper.title || '제목 없음';
			},
			(error) => {
				if (data.paperId === id && error instanceof ApiError && error.code === 'paper_not_found') paperMissing = true;
			}
		);
	});

	function unlink() {
		void goto('/translate', { replaceState: true, keepFocus: true, noScroll: true });
	}

	// ---- 번역 ----
	type Status = 'idle' | 'streaming' | 'done' | 'stopped' | 'error';
	type Failure = { message: string; retry: boolean; login: boolean };

	let input = $state('');
	let output = $state('');
	let status = $state<Status>('idle');
	let failure: Failure | null = $state(null);
	let announcement = $state('');
	let copied = $state(false);
	let copyError = $state('');
	let controller: AbortController | null = null;
	let textarea: HTMLTextAreaElement | undefined = $state();

	const trimmed = $derived(input.trim());
	const streaming = $derived(status === 'streaming');

	function failureOf(error: unknown): Failure {
		if (error instanceof StreamInterrupted) return { message: T.errInterrupted, retry: true, login: false };
		if (error instanceof ApiError) {
			if (error.status === 401) return { message: T.errLogin, retry: false, login: true };
			if (error.status === 400 || error.status === 413) return { message: T.errInput, retry: false, login: false };
			if (error.code === 'ai_not_configured') return { message: MESSAGES.ai_not_configured, retry: false, login: false };
			if (error.code === 'paper_not_found') return { message: T.paperNotFound, retry: false, login: false };
		}
		return { message: T.errTemporary, retry: true, login: false };
	}

	async function translate() {
		const text = input.trim();
		if (!text) return;
		controller?.abort();
		const current = new AbortController();
		controller = current;
		output = '';
		failure = null;
		announcement = '';
		copied = false;
		copyError = '';
		status = 'streaming';
		try {
			await startTranslation({ text, paperId: linkedId }, current.signal, (chunk) => {
				if (controller === current) output += chunk;
			});
			if (controller !== current) return;
			status = 'done';
			announcement = T.done;
			void loadHistory();
		} catch (error) {
			if (controller !== current) return;
			if (isAbortError(error)) {
				status = 'stopped';
				return;
			}
			if (error instanceof ApiError && error.code === 'paper_not_found') paperMissing = true;
			failure = failureOf(error);
			status = 'error';
		} finally {
			if (controller === current) controller = null;
		}
	}

	function stop() {
		controller?.abort();
	}

	function onInput() {
		if (input.length > MAX_TRANSLATE_CHARS) input = input.slice(0, MAX_TRANSLATE_CHARS);
		if (!auto) return;
		// 자동 번역: 입력을 계속하면 진행 중인 요청을 취소하고 다시 기다린다
		clearTimeout(autoTimer);
		if (streaming) {
			controller?.abort();
			controller = null;
			status = 'idle';
		}
		autoTimer = setTimeout(() => void translate(), AUTO_DELAY_MS);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
			event.preventDefault();
			clearTimeout(autoTimer);
			void translate();
		} else if (event.key === 'Escape' && streaming) {
			event.preventDefault();
			stop();
		}
	}

	async function copy() {
		copyError = '';
		try {
			await navigator.clipboard.writeText(output);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			copyError = T.errCopy;
		}
	}

	// ---- 자동 번역 설정 ----
	let auto = $state(readBool(AUTO_KEY, false));
	let autoTimer: ReturnType<typeof setTimeout> | undefined;

	function toggleAuto() {
		auto = !auto;
		writeBool(AUTO_KEY, auto);
		if (!auto) clearTimeout(autoTimer);
	}

	$effect(() => () => {
		clearTimeout(autoTimer);
		controller?.abort();
	});

	// ---- 이력 ----
	let history: TranslationRecord[] = $state([]);
	let historyLoaded = $state(false);
	let historyError = $state('');
	let shown = $state(HISTORY_STEP);
	let scope = $state<'all' | 'paper'>('all');
	const scopedId = $derived(scope === 'paper' ? linkedId : null);
	let historyRequest = 0;

	async function loadHistory() {
		const current = ++historyRequest;
		const params = new URLSearchParams({ limit: '200' });
		const id = untrack(() => scopedId);
		if (id) params.set('paperId', id);
		try {
			const result = await apiFetch<{ items: TranslationRecord[] }>(`/api/translate/history?${params}`, { redirectOn401: false });
			if (current !== historyRequest) return;
			history = result.items;
			historyError = '';
		} catch {
			if (current === historyRequest) historyError = T.historyError;
		} finally {
			if (current === historyRequest) historyLoaded = true;
		}
	}

	$effect(() => {
		void scopedId;
		shown = HISTORY_STEP;
		void loadHistory();
	});

	// 연결이 풀리면 이력 범위도 전체로 돌린다
	$effect(() => {
		if (!linkedId) scope = 'all';
	});

	function pick(record: TranslationRecord) {
		controller?.abort();
		controller = null;
		clearTimeout(autoTimer);
		input = record.sourceText;
		output = record.translatedText;
		failure = null;
		announcement = '';
		status = 'done';
		textarea?.focus();
	}

	const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
	const loginHref = $derived(loginUrl(page.url));
</script>

<svelte:head>
	<title>번역 · Archi Studio</title>
</svelte:head>

<div class="translate">
	<h1>{T.title}</h1>

	{#if paperMissing}
		<Notice kind="error">
			{T.paperNotFound}
			{#snippet action()}<Button onclick={unlink}>{T.continueWithout}</Button>{/snippet}
		</Notice>
	{:else if linkedId}
		<p class="linked"><span class="linked-label">{T.paperLinked}</span> <span class="linked-title">{paperTitle || '불러오는 중…'}</span></p>
	{/if}

	<div class="field">
		<div class="field-head">
			<label for="translate-input">{T.inputLabel}</label>
			<span class="count" aria-live="off">{input.length} / {MAX_TRANSLATE_CHARS}</span>
		</div>
		<textarea
			id="translate-input"
			bind:this={textarea}
			bind:value={input}
			maxlength={MAX_TRANSLATE_CHARS}
			rows="6"
			placeholder={T.inputPlaceholder}
			oninput={onInput}
			onkeydown={onKeydown}
		></textarea>
	</div>

	<div class="actions">
		<Button variant="primary" onclick={() => translate()} disabled={!trimmed}>{T.translate}</Button>
		<Button onclick={stop} disabled={!streaming}>{T.stop}</Button>
		<Button onclick={copy} disabled={status !== 'done' || !output}>{copied ? T.copied : T.copy}</Button>
		{#if status === 'stopped'}<span class="state">{T.stopped}</span>{/if}
	</div>

	<StreamOutput
		text={output}
		{streaming}
		live={false}
		label={T.resultLabel}
		placeholder={T.resultPlaceholder}
		progressLabel={T.translating}
	/>
	<p class="sr-only" role="status" aria-live="polite">{announcement}</p>

	{#if failure}
		<Notice kind="error">
			{failure.message}
			{#snippet action()}
				{#if failure?.retry}<Button onclick={() => translate()}>{T.retry}</Button>{/if}
				{#if failure?.login}<Button href={loginHref}>{T.login}</Button>{/if}
			{/snippet}
		</Notice>
	{/if}
	{#if copyError}<Notice kind="error">{copyError}</Notice>{/if}

	<section class="history" aria-labelledby="history-title">
		<h2 id="history-title">{T.historyTitle}</h2>
		{#if historyError}
			<Notice kind="error">{historyError}</Notice>
		{:else if historyLoaded && history.length === 0}
			<p class="empty">{T.historyEmpty}</p>
		{:else}
			<ul>
				{#each history.slice(0, shown) as record (record.id)}
					<li>
						<button type="button" class="record" onclick={() => pick(record)}>
							<span class="source">{record.sourceText}</span>
							<span class="target">{record.translatedText}</span>
							<span class="when">{dateFormat.format(new Date(record.createdAt))}</span>
						</button>
					</li>
				{/each}
			</ul>
			{#if history.length > shown}
				<div class="more"><Button onclick={() => (shown += HISTORY_STEP)}>{T.historyMore}</Button></div>
			{/if}
		{/if}
	</section>
</div>

<PanelContent>
	<div class="settings">
		<div class="setting">
			<div class="setting-row">
				<span id="auto-label" class="setting-name">{T.settingsAuto}</span>
				<button
					type="button"
					class="switch"
					role="switch"
					aria-checked={auto}
					aria-labelledby="auto-label"
					aria-describedby="auto-help"
					onclick={toggleAuto}
				>
					<span class="knob"></span>
				</button>
			</div>
			<p id="auto-help" class="help">{T.settingsAutoHelp}</p>
		</div>

		{#if linkedId}
			<div class="setting">
				<span class="setting-name">{T.paperLinked}</span>
				<p class="paper-title">{paperTitle || '불러오는 중…'}</p>
				<Button onclick={unlink}>{T.settingsUnlink}</Button>
			</div>

			<fieldset class="setting">
				<legend class="setting-name">{T.settingsScope}</legend>
				<label class="radio"><input type="radio" name="scope" value="all" bind:group={scope} /> {T.scopeAll}</label>
				<label class="radio"><input type="radio" name="scope" value="paper" bind:group={scope} /> {T.scopePaper}</label>
			</fieldset>
		{/if}
	</div>
</PanelContent>

<style>
	.translate {
		display: grid;
		gap: var(--space-lg);
		max-width: var(--read-w);
	}

	h1 {
		margin: 0;
		font-size: var(--fs-22);
		font-weight: var(--fw-700);
	}

	h2 {
		margin: 0;
		font-size: var(--fs-16);
		font-weight: var(--fw-650);
	}

	.linked {
		margin: 0;
		padding: var(--space-sm) var(--space-md);
		border-radius: var(--radius-sm);
		background: var(--color-well);
		overflow-wrap: anywhere;
	}

	.linked-label {
		color: var(--color-text-muted);
		font-size: var(--fs-13);
	}

	.linked-title {
		font-weight: var(--fw-600);
	}

	.field {
		display: grid;
		gap: var(--space-xs);
	}

	.field-head {
		display: flex;
		justify-content: space-between;
		gap: var(--space-sm);
	}

	label {
		font-size: var(--fs-13);
		font-weight: var(--fw-600);
	}

	.count {
		color: var(--color-text-muted);
		font-size: var(--fs-13);
		font-variant-numeric: tabular-nums;
	}

	textarea {
		width: 100%;
		min-height: 140px;
		padding: var(--space-md);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		font-size: var(--fs-15);
		line-height: var(--lh-relaxed);
		resize: vertical;
	}

	textarea:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 1px;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-sm);
	}

	.state {
		color: var(--color-text-muted);
		font-weight: var(--fw-600);
	}

	.history {
		display: grid;
		gap: var(--space-sm);
	}

	.history ul {
		display: grid;
		gap: var(--space-xs);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.record {
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

	.record:hover {
		background: var(--color-hover);
	}

	.record:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 1px;
	}

	.source,
	.target {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.source {
		font-weight: var(--fw-600);
	}

	.target,
	.when,
	.empty {
		color: var(--color-text-muted);
	}

	.when {
		font-size: var(--fs-12);
	}

	.empty {
		margin: 0;
	}

	.more {
		display: flex;
		justify-content: center;
	}

	.settings {
		display: grid;
		gap: var(--space-xl);
	}

	.setting {
		display: grid;
		gap: var(--space-sm);
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}

	.setting-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
	}

	.setting-name {
		padding: 0;
		font-size: var(--fs-14);
		font-weight: var(--fw-650);
	}

	.help,
	.paper-title {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--fs-13);
		overflow-wrap: anywhere;
	}

	.switch {
		position: relative;
		flex: none;
		width: 44px;
		height: 26px;
		padding: 0;
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-pill);
		background: var(--color-well);
		cursor: pointer;
	}

	.switch[aria-checked='true'] {
		border-color: var(--color-accent-hover);
		background: var(--color-accent-hover);
	}

	.switch:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.knob {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 20px;
		height: 20px;
		border-radius: var(--radius-pill);
		background: var(--color-text-muted);
		box-shadow: var(--shadow-card);
		transition: transform 0.15s;
	}

	.switch[aria-checked='true'] .knob {
		background: var(--color-surface);
		transform: translateX(18px);
	}

	.radio {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		min-height: 32px;
		font-weight: var(--fw-500);
	}

	.radio input {
		accent-color: var(--color-accent-hover);
	}
</style>

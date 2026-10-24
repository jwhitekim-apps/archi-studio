<script lang="ts">
	// 논문별 메모 편집기. 폴리오 web/src/components/MarkdownNote.svelte를 TypeScript로 옮겼다.
	// 바꾼 곳: 메모를 직접 불러오고 저장한다(GET·PUT /api/papers/{id}/memo), 오류 코드별 안내,
	// 미리보기의 원본 HTML 이스케이프(design 결정 6), 초안 키 archi:memo-draft:{id}.
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { ApiError, apiFetch, loginUrl } from '$lib/api/client';
	import { errorMessage } from '$lib/api/messages';
	import { Button, Icon, Notice, Spinner } from '$lib/components/ui';
	import { renderMemo } from '$lib/memo/render';

	interface Memo {
		markdown: string;
		updatedAt: string | null;
	}

	let { paperId, paperTitle = '' }: { paperId: string; paperTitle?: string } = $props();

	// 입력이 멈춘 뒤 저장까지 기다리는 시간(폴리오와 같다)
	const SAVE_DELAY_MS = 900;

	// 긴 메모 중간에서 줄을 바꾸면 높이를 'auto'로 잠깐 줄이는 순간 스크롤 조상의 scrollTop이 0으로 밀려
	// 편집 중인 줄이 사라지던 문제를 폴리오에서 고쳤다. 리셋 앞뒤로 스크롤 위치를 보존한다.
	function autosize(node: HTMLTextAreaElement) {
		function findScroller(el: HTMLElement): HTMLElement | null {
			let parent = el.parentElement;
			while (parent) {
				const overflowY = getComputedStyle(parent).overflowY;
				if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) return parent;
				parent = parent.parentElement;
			}
			return null;
		}
		function resize() {
			const scroller = findScroller(node);
			const prevScrollTop = scroller ? scroller.scrollTop : 0;
			node.style.height = 'auto';
			node.style.height = `${node.scrollHeight}px`;
			if (scroller) scroller.scrollTop = prevScrollTop;
		}
		// 처음 붙을 때는 값이 아직 안 들어갔을 수 있어 다음 프레임에 한 번 더 잰다
		resize();
		const frame = requestAnimationFrame(resize);
		node.addEventListener('input', resize);
		// 접힌 시트 안처럼 안 보이다가 보이게 되는 순간도 크기 변화로 잡아 다시 잰다
		const observer = new ResizeObserver(resize);
		observer.observe(node);
		return {
			update: resize,
			destroy() {
				cancelAnimationFrame(frame);
				node.removeEventListener('input', resize);
				observer.disconnect();
			}
		};
	}

	// ---- 초안(sessionStorage). 접근이 막혀 있어도(시크릿 모드 등) 편집은 계속 된다 ----
	const draftKey = $derived(`archi:memo-draft:${paperId}`);

	function readDraft(): string | null {
		try {
			return sessionStorage.getItem(draftKey);
		} catch {
			return null;
		}
	}
	function writeDraft(value: string) {
		try {
			sessionStorage.setItem(draftKey, value);
		} catch {
			// 초안은 있으면 좋은 기능이라 조용히 넘긴다
		}
	}
	function clearDraft() {
		try {
			sessionStorage.removeItem(draftKey);
		} catch {
			// 위와 같다
		}
	}

	// ---- 불러오기 ----
	type Load = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string; login: boolean };
	let load = $state<Load>({ kind: 'loading' });
	let markdown = $state('');
	let hasPersisted = $state(false);

	async function loadMemo() {
		load = { kind: 'loading' };
		const draft = readDraft();
		try {
			const memo = await apiFetch<Memo>(`/api/papers/${paperId}/memo`, { redirectOn401: false });
			markdown = draft ?? memo.markdown;
			hasPersisted = memo.markdown.trim() !== '';
			load = { kind: 'ready' };
		} catch (error) {
			// 초안이 있으면 서버를 못 읽어도 편집은 이어 간다
			if (draft !== null) {
				markdown = draft;
				load = { kind: 'ready' };
			} else {
				const login = error instanceof ApiError && error.status === 401;
				load = { kind: 'error', message: login ? LOGIN_MESSAGE : errorMessage(error), login };
				return;
			}
		}
		// 저장하지 못하고 떠났던 초안이 있으면 바로 저장해 서버에 반영한다
		if (draft !== null) schedule(0);
	}

	$effect(() => {
		void paperId;
		untrack(() => void loadMemo());
		return () => clearTimeout(timer);
	});

	// ---- 저장 ----
	const LOGIN_MESSAGE = '로그인이 끝나 저장하지 못했습니다. 다시 로그인하면 저장할 수 있습니다. 입력한 내용은 이 브라우저에 보관했습니다.';

	type Save =
		| { kind: 'idle' }
		| { kind: 'saving' }
		| { kind: 'saved'; at: Date }
		| { kind: 'error'; message: string; login: boolean };
	let save = $state<Save>({ kind: 'idle' });
	let timer: ReturnType<typeof setTimeout> | undefined;
	let inFlight = false;
	let queued = false;

	function saveErrorMessage(error: unknown): { message: string; login: boolean } {
		if (error instanceof ApiError) {
			if (error.status === 401) return { message: LOGIN_MESSAGE, login: true };
			if (error.code === 'zotero_not_connected') return { message: 'Zotero를 연결해야 저장할 수 있습니다. 입력한 내용은 지우지 않았습니다.', login: false };
			if (error.code === 'payload_too_large' || error.status === 413)
				return { message: '메모가 너무 길어 저장하지 못했습니다. 내용을 줄인 뒤 다시 시도해 주세요.', login: false };
		}
		return { message: errorMessage(error), login: false };
	}

	async function doSave() {
		clearTimeout(timer);
		if (inFlight) {
			// 저장 중에 또 예약되면 지금 요청이 끝난 뒤 최신 내용으로 한 번 더 저장한다
			queued = true;
			return;
		}
		inFlight = true;
		save = { kind: 'saving' };
		// 저장을 시작한 때의 내용. 저장 도중 더 입력하면 초안을 지우지 않는다
		const snapshot = markdown;
		try {
			await apiFetch<Memo>(`/api/papers/${paperId}/memo`, {
				method: 'PUT',
				body: { markdown: snapshot },
				redirectOn401: false
			});
			hasPersisted = snapshot.trim() !== '';
			save = { kind: 'saved', at: new Date() };
			if (markdown === snapshot) clearDraft();
		} catch (error) {
			save = { kind: 'error', ...saveErrorMessage(error) };
		} finally {
			inFlight = false;
			if (queued) {
				queued = false;
				void doSave();
			}
		}
	}

	function schedule(delay = SAVE_DELAY_MS) {
		clearTimeout(timer);
		timer = setTimeout(() => void doSave(), delay);
	}

	function changed(value: string) {
		markdown = value;
		writeDraft(value);
		schedule();
	}

	// ---- 파일 불러오기·내려받기 ----
	let fileInput: HTMLInputElement | undefined = $state();

	function onFilePick(event: Event & { currentTarget: HTMLInputElement }) {
		const input = event.currentTarget;
		const file = input.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => changed(String(reader.result ?? ''));
		reader.readAsText(file);
		// 같은 파일을 다시 골라도 change가 나도록 비운다
		input.value = '';
	}

	function downloadFilename(): string {
		const base = (paperTitle || '메모').trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
		return `${base || '메모'}.md`;
	}

	function download() {
		const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
		const href = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = href;
		a.download = downloadFilename();
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(href);
	}

	// 편집과 미리보기 전환. 글 내용은 항상 markdown 하나다
	let viewMode = $state<'edit' | 'preview'>('edit');
	const previewHtml = $derived(viewMode === 'preview' ? renderMemo(markdown) : '');

	const timeText = (date: Date) => date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
</script>

<section class="note" aria-labelledby="memo-heading">
	<div class="note-head">
		<div class="note-strip">
			<Icon name="note" size={16} />
			<h2 id="memo-heading" class="note-label">메모</h2>
			<span class="status" class:error={save.kind === 'error'} role="status" data-testid="memo-status">
				{#if save.kind === 'saving'}
					저장 중…
				{:else if save.kind === 'error'}
					저장하지 못함
				{:else if save.kind === 'saved'}
					모두 저장됨 · {timeText(save.at)}
				{:else if hasPersisted}
					모두 저장됨
				{/if}
			</span>
		</div>

		<div class="toolbar">
			<button type="button" class="tool" title=".md 파일 불러오기" onclick={() => fileInput?.click()} disabled={load.kind !== 'ready'}>
				<Icon name="file" size={14} /> 불러오기
			</button>
			<button type="button" class="tool" title=".md 파일로 내려받기" onclick={download} disabled={load.kind !== 'ready'}>
				<Icon name="external" size={14} /> 내려받기
			</button>
			<button
				type="button"
				class="tool toggle"
				aria-pressed={viewMode === 'preview'}
				onclick={() => (viewMode = viewMode === 'edit' ? 'preview' : 'edit')}
				disabled={load.kind !== 'ready'}
			>
				<Icon name="note" size={14} />
				{viewMode === 'edit' ? '미리보기' : '편집'}
			</button>
			<input
				bind:this={fileInput}
				class="file-input"
				type="file"
				tabindex="-1"
				aria-hidden="true"
				accept=".md,.markdown,text/markdown,text/plain"
				onchange={onFilePick}
			/>
		</div>

		{#if save.kind === 'error'}
			{@const failure = save}
			<div class="notice">
				<Notice kind="error">
					{failure.message}
					{#snippet action()}
						{#if failure.login}
							<Button href={loginUrl(page.url)}>다시 로그인</Button>
						{:else}
							<Button onclick={() => void doSave()}>다시 시도</Button>
						{/if}
					{/snippet}
				</Notice>
			</div>
		{/if}
	</div>

	<div class="note-body" data-testid="memo-scroller">
		{#if load.kind === 'loading'}
			<p class="quiet" role="status"><Spinner size={14} /> 메모를 불러오는 중…</p>
		{:else if load.kind === 'error'}
			{@const failure = load}
			<Notice kind="error">
				{failure.message}
				{#snippet action()}
					{#if failure.login}
						<Button href={loginUrl(page.url)}>다시 로그인</Button>
					{:else}
						<Button onclick={() => void loadMemo()}>다시 시도</Button>
					{/if}
				{/snippet}
			</Notice>
		{:else if viewMode === 'edit'}
			<textarea
				class="editor"
				use:autosize
				aria-label="메모 본문"
				placeholder={'마크다운으로 메모를 작성하세요…\n\n# 제목\n- 목록\n**굵게** _기울임_'}
				rows="6"
				value={markdown}
				oninput={(event) => changed(event.currentTarget.value)}
			></textarea>
		{:else if markdown.trim() === ''}
			<p class="quiet">미리볼 내용이 없습니다.</p>
		{:else}
			<!-- renderMemo가 원본 HTML을 글자로 이스케이프하고 위험한 링크 주소를 지운 결과다 -->
			<div class="preview" data-testid="memo-preview">{@html previewHtml}</div>
		{/if}
	</div>
</section>

<style>
	.note {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		background: var(--color-surface);
	}

	.note-head {
		flex: none;
		display: grid;
		gap: var(--space-sm);
		padding: var(--space-md) var(--space-lg);
		border-bottom: 1px solid var(--color-border);
	}

	.note-strip {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		color: var(--color-text);
	}

	.note-label {
		margin: 0;
		font-size: var(--fs-14);
		font-weight: var(--fw-700);
	}

	.status {
		margin-left: auto;
		color: var(--color-text-muted);
		font-size: var(--fs-12);
		white-space: nowrap;
	}

	.status.error {
		color: var(--color-error);
		font-weight: var(--fw-650);
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-xs) var(--space-md);
	}

	.tool {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		min-height: 32px;
		padding: 0 var(--space-sm);
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--color-text-muted);
		font: inherit;
		font-size: var(--fs-13);
		font-weight: var(--fw-600);
		cursor: pointer;
	}

	.tool:hover:not(:disabled) {
		background: var(--color-hover);
		color: var(--color-text);
	}

	.tool:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 1px;
	}

	.tool:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.toggle {
		margin-left: auto;
	}

	.file-input {
		display: none;
	}

	.note-body {
		flex: 1 1 auto;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		padding: var(--space-lg) var(--space-lg) var(--space-2xl);
	}

	.quiet {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--fs-14);
	}

	.editor {
		display: block;
		overflow: hidden;
		width: 100%;
		min-height: 240px;
		resize: none;
		padding: 0;
		border: 0;
		outline: 0;
		background: none;
		color: var(--color-text);
		/* 16px 미만이면 iOS Safari가 포커스 때 화면을 확대한다 */
		font: inherit;
		font-size: var(--fs-16);
		line-height: var(--lh-relaxed);
		tab-size: 2;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.editor::placeholder {
		color: var(--color-text-muted);
	}

	.preview {
		color: var(--color-text);
		font-size: var(--fs-15);
		line-height: var(--lh-relaxed);
		overflow-wrap: anywhere;
	}

	.preview :global(:is(h1, h2, h3, h4, h5, h6)) {
		margin: 1.4em 0 0.6em;
		font-weight: var(--fw-700);
		line-height: var(--lh-tight);
	}

	.preview :global(:is(h1, h2, h3):first-child) {
		margin-top: 0;
	}

	.preview :global(h1) {
		font-size: var(--fs-22);
	}

	.preview :global(h2) {
		font-size: var(--fs-18);
	}

	.preview :global(h3) {
		font-size: var(--fs-16);
	}

	.preview :global(:is(p, ul, ol, blockquote, pre, table)) {
		margin: 0 0 0.9em;
	}

	.preview :global(:is(ul, ol)) {
		padding-left: 1.5em;
	}

	.preview :global(a) {
		color: var(--color-accent);
		text-decoration: underline;
	}

	.preview :global(blockquote) {
		padding-left: 1em;
		border-left: 3px solid var(--color-border-strong);
		color: var(--color-text-muted);
	}

	.preview :global(code) {
		padding: 0.15em 0.4em;
		border-radius: var(--radius-sm);
		background: var(--color-well);
		font-family: var(--font-mono);
		font-size: 0.88em;
	}

	.preview :global(pre) {
		padding: var(--space-md);
		overflow-x: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-well);
	}

	.preview :global(pre code) {
		padding: 0;
		background: none;
	}

	.preview :global(table) {
		width: 100%;
		border-collapse: collapse;
	}

	.preview :global(:is(th, td)) {
		padding: 0.4em 0.7em;
		border: 1px solid var(--color-border);
		text-align: left;
	}
</style>

<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import Button from './Button.svelte';

	// 브라우저 기본 <dialog>의 showModal(): 포커스 가두기, 배경 차단, Escape 닫기는 브라우저가 한다(design 결정 6).
	// 닫을 때 연 버튼으로 포커스를 되돌리는 것만 여기서 한다.
	let {
		open = $bindable(false),
		title,
		children,
		confirmLabel = '확인',
		cancelLabel = '취소',
		danger = false,
		busy = false,
		error,
		onconfirm,
		oncancel
	}: {
		open?: boolean;
		title: string;
		children: Snippet;
		confirmLabel?: string;
		cancelLabel?: string;
		danger?: boolean;
		// 확인 동작이 진행 중이면 두 버튼 모두 다시 누를 수 없고 Escape도 막는다
		busy?: boolean;
		// 확인 동작이 실패했을 때 대화상자 안에 보여줄 문구
		error?: string;
		onconfirm: () => void | Promise<void>;
		oncancel?: () => void;
	} = $props();

	const uid = $props.id();
	let dialog: HTMLDialogElement | undefined = $state();
	let opener: HTMLElement | null = null;

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			dialog.showModal();
		} else if (!open && dialog.open) {
			dialog.close();
		}
	});

	async function restoreFocus() {
		open = false;
		await tick();
		opener?.focus();
		opener = null;
	}

	function cancel() {
		if (busy) return;
		oncancel?.();
		open = false;
	}
</script>

<dialog
	bind:this={dialog}
	class="dialog"
	aria-labelledby="dialog-{uid}-title"
	aria-describedby="dialog-{uid}-body"
	oncancel={(event) => {
		event.preventDefault();
		cancel();
	}}
	onclose={restoreFocus}
>
	<h2 id="dialog-{uid}-title" class="title">{title}</h2>
	<div id="dialog-{uid}-body" class="body">{@render children()}</div>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<div class="actions">
		<Button onclick={cancel} disabled={busy}>{cancelLabel}</Button>
		<Button variant={danger ? 'danger' : 'primary'} {busy} onclick={() => onconfirm()}>{confirmLabel}</Button>
	</div>
</dialog>

<style>
	.dialog {
		width: min(440px, calc(100vw - 2 * var(--space-lg)));
		padding: var(--space-xl);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		color: var(--color-text);
		box-shadow: var(--shadow-popover);
	}

	.dialog::backdrop {
		background: var(--color-text);
		opacity: 0.4;
	}

	.title {
		margin: 0 0 var(--space-sm);
		font-size: var(--fs-16);
		font-weight: var(--fw-700);
	}

	.body {
		color: var(--color-text-muted);
		font-size: var(--fs-14);
		line-height: var(--lh-relaxed);
	}

	.body :global(p) {
		margin: 0 0 var(--space-sm);
	}

	.error {
		margin: var(--space-md) 0 0;
		padding: var(--space-sm) var(--space-md);
		border-radius: var(--radius-sm);
		background: var(--color-error-soft);
		color: var(--color-error);
		font-size: var(--fs-13);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--space-sm);
		margin-top: var(--space-xl);
	}
</style>

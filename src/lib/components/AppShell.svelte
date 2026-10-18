<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		hasPanel = true,
		children
	}: {
		hasPanel?: boolean;
		children: Snippet;
	} = $props();

	let menuOpen = $state(false);
	let panelOpen = $state(false);

	const menuItems = ['서재', '번역', '분석', '메모', '브리핑'];

	function closeOverlays() {
		menuOpen = false;
		panelOpen = false;
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') closeOverlays();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="shell" class:no-panel={!hasPanel}>
	<header class="topbar">
		<button
			type="button"
			class="icon-button"
			aria-label="메뉴 열기"
			aria-expanded={menuOpen}
			aria-controls="shell-menu"
			onclick={() => {
				panelOpen = false;
				menuOpen = !menuOpen;
			}}
		>
			메뉴
		</button>
		<span class="wordmark">Archi Studio</span>
		{#if hasPanel}
			<button
				type="button"
				class="icon-button"
				aria-label="설정 열기"
				aria-expanded={panelOpen}
				aria-controls="shell-panel"
				onclick={() => {
					menuOpen = false;
					panelOpen = !panelOpen;
				}}
			>
				설정
			</button>
		{:else}
			<span class="icon-button-spacer"></span>
		{/if}
	</header>

	<nav id="shell-menu" class="menu" class:open={menuOpen} aria-label="주 메뉴">
		<div class="menu-title wordmark">Archi Studio</div>
		<ul>
			{#each menuItems as item (item)}
				<li><span class="menu-item">{item}</span></li>
			{/each}
		</ul>
	</nav>

	<main class="work">
		{@render children()}
	</main>

	{#if hasPanel}
		<aside id="shell-panel" class="panel" class:open={panelOpen} aria-label="설정 패널">
			<h2 class="panel-title">설정</h2>
			<p class="empty">선택한 도구의 설정이 여기에 표시됩니다.</p>
		</aside>
	{/if}

	{#if menuOpen || panelOpen}
		<button type="button" class="scrim" aria-label="닫기" onclick={closeOverlays}></button>
	{/if}
</div>

<style>
	.shell {
		display: grid;
		grid-template-columns: var(--sidebar-w) minmax(0, 1fr) var(--panel-w);
		grid-template-areas: 'menu work panel';
		min-height: 100dvh;
		background: var(--color-canvas);
		color: var(--color-text);
	}

	.shell.no-panel {
		grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
		grid-template-areas: 'menu work';
	}

	.topbar {
		display: none;
	}

	.menu {
		grid-area: menu;
		background: var(--color-surface);
		border-right: 1px solid var(--color-border);
		padding: var(--space-lg);
	}

	.menu-title {
		height: var(--control-h);
		display: flex;
		align-items: center;
		margin-bottom: var(--space-md);
	}

	.menu ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-xs);
	}

	.menu-item {
		display: flex;
		align-items: center;
		min-height: var(--control-h);
		padding: 0 var(--space-md);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		font-size: var(--fs-14);
	}

	.work {
		grid-area: work;
		min-width: 0;
		padding: var(--gutter);
	}

	.panel {
		grid-area: panel;
		background: var(--color-surface);
		border-left: 1px solid var(--color-border);
		padding: var(--space-lg);
	}

	.panel-title {
		margin: 0 0 var(--space-md);
		font-size: var(--fs-15);
		font-weight: var(--fw-650);
	}

	.empty {
		margin: 0;
		color: var(--color-text-faint);
		font-size: var(--fs-13);
		line-height: var(--lh-normal);
	}

	.wordmark {
		font-size: var(--fs-16);
		font-weight: var(--fw-700);
		color: var(--color-accent);
	}

	.scrim {
		display: none;
	}

	@media (max-width: 767px) {
		.shell,
		.shell.no-panel {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: var(--header-h) minmax(0, 1fr);
			grid-template-areas:
				'top'
				'work';
		}

		.topbar {
			grid-area: top;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--space-sm);
			padding: 0 var(--space-md);
			background: var(--color-surface);
			border-bottom: 1px solid var(--color-border);
		}

		.icon-button,
		.icon-button-spacer {
			min-width: var(--control-h);
			height: var(--control-h);
		}

		.icon-button {
			padding: 0 var(--space-md);
			border: 1px solid var(--color-border);
			border-radius: var(--radius-sm);
			background: var(--color-surface);
			color: var(--color-text);
			font: inherit;
			font-size: var(--fs-14);
			cursor: pointer;
		}

		.icon-button:hover {
			background: var(--color-hover);
		}

		.menu,
		.panel {
			position: fixed;
			top: var(--header-h);
			bottom: 0;
			z-index: 20;
			width: min(var(--sidebar-w), 85vw);
			overflow-y: auto;
			box-shadow: var(--shadow-popover);
			visibility: hidden;
		}

		.menu {
			left: 0;
			transform: translateX(-100%);
		}

		.panel {
			right: 0;
			width: min(var(--panel-w), 90vw);
			transform: translateX(100%);
		}

		.menu.open,
		.panel.open {
			visibility: visible;
			transform: none;
		}

		.menu-title {
			display: none;
		}

		.scrim {
			display: block;
			position: fixed;
			inset: var(--header-h) 0 0 0;
			z-index: 10;
			border: 0;
			padding: 0;
			background: var(--color-text);
			opacity: 0.4;
			cursor: pointer;
		}

		.work {
			padding: var(--space-lg);
		}
	}
</style>

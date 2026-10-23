<script lang="ts" module>
	// 폴리오 web/src/components/Icon.svelte의 경로 중 쓰는 것만 옮겼다(24×24, 선 아이콘).
	const PATHS = {
		library: ['M4 19.5V5.8a1.8 1.8 0 0 1 1.8-1.8H18v15.5H6.2A2.2 2.2 0 0 0 4 21.7', 'M4 19.5A2.5 2.5 0 0 1 6.5 17H18', 'M8 7.5h6'],
		note: ['M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z', 'M14 3v6h6M8 13h8M8 17h5'],
		folder: ['M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z'],
		search: ['M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14Z', 'm20 20-4-4'],
		refresh: ['M20 6v5h-5', 'M4 18v-5h5', 'M18.2 9A7 7 0 0 0 6.5 6.5L4 11M6 15a7 7 0 0 0 11.5 2.5L20 13'],
		file: ['M14 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-12Z', 'M14 2.5v5h5M8.5 13h7M8.5 17h5'],
		external: ['M15 4h5v5M13 11l7-7M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6'],
		logout: ['M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8', 'm17 8 4 4-4 4M21 12H9'],
		plus: ['M12 5v14M5 12h14'],
		close: ['m6 6 12 12M18 6 6 18'],
		check: ['m5 12 4 4L19 6'],
		trash: [
			'M4 6.5h16M9 6.5V4.8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.7M6.5 6.5 7.3 19a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12.5',
			'M10.3 10.5v6.3M13.7 10.5v6.3'
		],
		alert: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z', 'M12 8v5M12 16.5h.01'],
		settings: ['M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6Z', 'M19 12h2M3 12h2M12 3v2M12 19v2M17 7l1.4-1.4M5.6 18.4 7 17M17 17l1.4 1.4M5.6 5.6 7 7'],
		menu: ['M4 7h16M4 12h16M4 17h16'],
		link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1']
	} as const;

	export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
	let { name, size = 18 }: { name: IconName; size?: number } = $props();
</script>

<svg
	class="icon"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.8"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
>
	{#each PATHS[name] as d (d)}
		<path {d} />
	{/each}
</svg>

<style>
	.icon {
		flex: none;
		display: block;
	}
</style>

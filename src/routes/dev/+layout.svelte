<script lang="ts">
	// 로그인 없이 셸과 부품을 확인하는 개발용 묶음. 메뉴는 실제 화면과 같은 설정을 쓴다.
	import { page } from '$app/state';
	import AppShell from '$lib/components/AppShell.svelte';
	import { NAV_ITEMS } from '$lib/nav';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<AppShell nav={NAV_ITEMS} pathname={page.url.pathname} email="dev@example.com" onlogout={() => {}}>
	{@render children()}
</AppShell>

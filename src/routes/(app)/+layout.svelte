<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AppShell from '$lib/components/AppShell.svelte';
	import { NAV_ITEMS } from '$lib/nav';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// 요청이 실패해도 로그인 화면으로 간다. 서버 세션이 남았더라도 다음 보호 화면 확인에서 다시 걸러진다.
	async function logout() {
		try {
			await fetch('/api/auth/logout', { method: 'POST' });
		} catch {
			// 네트워크 실패도 로그인 화면으로 보낸다
		}
		await goto('/login', { invalidateAll: true, replaceState: true });
	}
</script>

<AppShell
	hasPanel={page.data.hasPanel !== false}
	nav={NAV_ITEMS}
	pathname={page.url.pathname}
	email={data.user.email}
	onlogout={logout}
>
	{@render children()}
</AppShell>

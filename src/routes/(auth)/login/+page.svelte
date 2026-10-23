<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ApiError, apiFetch } from '$lib/api/client';
	import { errorMessage } from '$lib/api/messages';
	import type { User } from '$lib/api/types';
	import { safeRedirect } from '$lib/auth/redirect';
	import { Button, Notice, TextField } from '$lib/components/ui';

	let email = $state('');
	let password = $state('');
	let emailError = $state('');
	let passwordError = $state('');
	let failure = $state('');
	let busy = $state(false);
	let emailInput: HTMLInputElement | undefined = $state();
	let passwordInput: HTMLInputElement | undefined = $state();

	// redirect가 여러 개 붙은 주소(배열 형태)는 믿지 않는다
	const target = $derived.by(() => {
		const values = page.url.searchParams.getAll('redirect');
		return safeRedirect(values.length === 1 ? values[0] : values.length ? values : undefined);
	});
	const expired = $derived(page.url.searchParams.get('expired') === '1');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		failure = '';
		emailError = email.trim() ? '' : '이메일을 입력해 주세요.';
		passwordError = password ? '' : '비밀번호를 입력해 주세요.';
		if (emailError) return emailInput?.focus();
		if (passwordError) return passwordInput?.focus();

		busy = true;
		try {
			await apiFetch<User>('/api/auth/login', { method: 'POST', body: { email: email.trim(), password } });
			await goto(target, { invalidateAll: true, replaceState: true });
		} catch (error) {
			failure = errorMessage(error instanceof ApiError && error.status >= 500 ? new ApiError(500, 'internal_error', '') : error);
			password = '';
			passwordInput?.focus();
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>로그인 · Archi Studio</title>
</svelte:head>

<h1>로그인</h1>

{#if expired}
	<Notice>세션이 끝났습니다. 다시 로그인해 주세요.</Notice>
{/if}

<form novalidate onsubmit={submit}>
	<TextField
		label="이메일"
		type="email"
		name="email"
		autocomplete="email"
		required
		bind:value={email}
		bind:input={emailInput}
		error={emailError}
	/>
	<TextField
		label="비밀번호"
		type="password"
		name="password"
		autocomplete="current-password"
		required
		bind:value={password}
		bind:input={passwordInput}
		error={passwordError}
	/>
	{#if failure}
		<Notice kind="error">{failure}</Notice>
	{/if}
	<Button type="submit" variant="primary" {busy}>로그인</Button>
</form>

<p class="switch">계정이 없나요? <a href="/signup">가입하기</a></p>

<style>
	h1 {
		margin: 0;
		font-size: var(--fs-22);
		font-weight: var(--fw-700);
	}

	form {
		display: grid;
		gap: var(--space-lg);
	}

	.switch {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--fs-14);
	}
</style>

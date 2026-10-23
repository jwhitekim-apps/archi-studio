<script lang="ts">
	import { ApiError, apiFetch } from '$lib/api/client';
	import { errorMessage, MESSAGES } from '$lib/api/messages';
	import { Button, Notice, TextField } from '$lib/components/ui';

	const MIN_PASSWORD = 8;

	let email = $state('');
	let password = $state('');
	let emailError = $state('');
	let passwordError = $state('');
	let failure = $state('');
	let busy = $state(false);
	let done = $state(false);
	let emailInput: HTMLInputElement | undefined = $state();
	let passwordInput: HTMLInputElement | undefined = $state();

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		failure = '';
		emailError = email.trim() ? '' : '이메일을 입력해 주세요.';
		passwordError = password.length >= MIN_PASSWORD ? '' : `비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다.`;
		if (emailError) return emailInput?.focus();
		if (passwordError) return passwordInput?.focus();

		busy = true;
		try {
			// 성공(201)해도 세션은 생기지 않는다. 승인 뒤에 로그인한다.
			await apiFetch('/api/auth/signup', { method: 'POST', body: { email: email.trim(), password } });
			done = true;
		} catch (error) {
			if (error instanceof ApiError && error.code === 'email_taken') {
				emailError = MESSAGES.email_taken;
				emailInput?.focus();
			} else {
				failure = errorMessage(error instanceof ApiError && error.status >= 500 ? new ApiError(500, 'internal_error', '') : error);
			}
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>가입 · Archi Studio</title>
</svelte:head>

{#if done}
	<h1>가입 신청이 접수되었습니다</h1>
	<div class="pending" role="status">
		<p>관리자가 승인하면 로그인할 수 있습니다.</p>
		<p>승인 전에는 로그인해도 들어갈 수 없습니다.</p>
	</div>
	<Button href="/login" variant="primary">로그인 화면으로</Button>
{:else}
	<h1>가입</h1>
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
			autocomplete="new-password"
			required
			hint="{MIN_PASSWORD}자 이상으로 정해 주세요."
			bind:value={password}
			bind:input={passwordInput}
			error={passwordError}
		/>
		{#if failure}
			<Notice kind="error">{failure}</Notice>
		{/if}
		<Button type="submit" variant="primary" {busy}>가입하기</Button>
	</form>
	<p class="switch">이미 계정이 있나요? <a href="/login">로그인</a></p>
{/if}

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

	.pending p {
		margin: 0 0 var(--space-xs);
		color: var(--color-text-muted);
	}

	.switch {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--fs-14);
	}
</style>

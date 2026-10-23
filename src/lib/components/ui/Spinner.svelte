<script lang="ts">
	// label이 있으면 스크린리더가 읽고, 없으면 장식으로 숨긴다(버튼 안처럼 다른 곳에서 상태를 알릴 때).
	let { size = 16, label }: { size?: number; label?: string } = $props();
</script>

<span
	class="spinner"
	style:--size="{size}px"
	role={label ? 'status' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
></span>

<style>
	.spinner {
		display: inline-block;
		flex: none;
		width: var(--size);
		height: var(--size);
		border: 2px solid currentColor;
		border-right-color: transparent;
		border-radius: var(--radius-pill);
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation-duration: 2.4s;
		}
	}
</style>

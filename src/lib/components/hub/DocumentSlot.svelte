<script lang="ts">
	// 허브의 원문 자리. 원문 뷰어(src/lib/components/viewer/PdfPane.svelte, 따로 이식 중)가 붙을 경계다.
	// 뷰어를 붙일 때는 아래 임시 패널을 <PdfPane src={fileUrl} type={type} />로 바꾸면 된다.
	// 이 요소는 분할과 시트를 오가도 다시 만들어지지 않으므로 뷰어의 배율 상태가 유지된다.
	import { Button, StatePanel } from '$lib/components/ui';

	let { paperId, type }: { paperId: string; type: 'pdf' | 'html' | null } = $props();

	const fileUrl = $derived(`/api/papers/${paperId}/file`);
</script>

<section class="document" aria-label="원문" data-testid="document-slot" data-type={type ?? 'none'}>
	{#if type === null}
		<StatePanel kind="empty" title="원문이 없습니다" description="첨부 파일이 없는 논문입니다. 메모는 그대로 쓸 수 있습니다." />
	{:else}
		<!-- 원문 자리: PdfPane src=/api/papers/{id}/file type={type} -->
		<StatePanel
			kind="empty"
			title={type === 'pdf' ? 'PDF 원문 보기를 준비하고 있습니다' : '웹페이지 원문 보기를 준비하고 있습니다'}
			description="원문 뷰어가 붙기 전까지는 새 탭에서 파일을 열어 볼 수 있습니다."
		>
			{#snippet action()}<Button href={fileUrl}>원문 파일 열기</Button>{/snippet}
		</StatePanel>
	{/if}
</section>

<style>
	.document {
		height: 100%;
		min-width: 0;
		min-height: 0;
		overflow: auto;
		padding: var(--space-lg);
		background: var(--color-canvas);
	}
</style>

<script lang="ts">
	// 허브의 원문 자리. 원문 뷰어(PdfPane)를 붙인다. 첨부가 없으면 PdfPane이 "첨부 없음"을 보인다.
	// 이 요소는 분할과 시트를 오가도 다시 만들어지지 않으므로 뷰어의 배율 상태가 유지된다.
	import PdfPane from '$lib/components/viewer/PdfPane.svelte';

	let { paperId, type }: { paperId: string; type: 'pdf' | 'html' | null } = $props();

	const fileUrl = $derived(`/api/papers/${paperId}/file`);
</script>

<section class="document" aria-label="원문" data-testid="document-slot" data-type={type ?? 'none'}>
	<PdfPane src={fileUrl} {type} />
</section>

<style>
	.document {
		height: 100%;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
		background: var(--color-canvas);
	}
</style>

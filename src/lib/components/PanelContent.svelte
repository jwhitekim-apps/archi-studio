<script lang="ts">
	// 이 컴포넌트가 화면에 있는 동안 내용(children)을 오른쪽 설정 패널에 보여준다.
	import type { Snippet } from 'svelte';
	import { usePanelSlot } from './panel-slot.svelte';

	let { children }: { children: Snippet } = $props();
	const slot = usePanelSlot();

	$effect(() => {
		if (!slot) return;
		const owner = slot.register(children);
		return () => slot.release(owner);
	});
</script>

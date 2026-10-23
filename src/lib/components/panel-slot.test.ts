import type { Snippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import { PanelSlot } from './panel-slot.svelte';

const snippet = (name: string) => (() => name) as unknown as Snippet;

describe('PanelSlot', () => {
	it('A 등록 → B 등록 → A 정리 뒤에도 B가 남는다', () => {
		const slot = new PanelSlot();
		const a = slot.register(snippet('A'));
		const bContent = snippet('B');
		const b = slot.register(bContent);
		slot.release(a);
		expect(slot.content).toBe(bContent);
		slot.release(b);
		expect(slot.content).toBeNull();
	});
});

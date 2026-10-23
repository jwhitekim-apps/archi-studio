// 오른쪽 설정 패널에 화면이 자기 설정을 넣는 자리(design 결정 4).
// 화면은 PanelContent로 등록하고, 사라질 때 자기 등록일 때만 지운다(A→B 이동에서 A의 정리가 B를 지우지 않게).
import { getContext, setContext, type Snippet } from 'svelte';

const KEY = Symbol('panel-slot');

export class PanelSlot {
	content = $state<Snippet | null>(null);
	#owner: symbol | null = null;

	register(content: Snippet): symbol {
		const owner = Symbol('panel-owner');
		this.#owner = owner;
		this.content = content;
		return owner;
	}

	release(owner: symbol): void {
		if (this.#owner !== owner) return;
		this.#owner = null;
		this.content = null;
	}
}

export function providePanelSlot(): PanelSlot {
	return setContext(KEY, new PanelSlot());
}

export function usePanelSlot(): PanelSlot | undefined {
	return getContext<PanelSlot | undefined>(KEY);
}

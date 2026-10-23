// 사이드바 메뉴 설정(design 결정 9). 화면을 만든 change가 disabled를 빼고 href를 채운다.
import type { IconName } from '$lib/components/ui';

export interface NavEntry {
	label: string;
	href?: string;
	icon?: IconName;
	disabled?: boolean;
}

export const NAV_ITEMS: NavEntry[] = [
	{ label: '서재', href: '/library', icon: 'library' },
	{ label: '번역', href: '/translate', icon: 'file' },
	{ label: '분석', href: '/analyze', icon: 'search' },
	{ label: '메모', icon: 'note', disabled: true },
	{ label: '브리핑', icon: 'external', disabled: true }
];

// 현재 주소가 메뉴 항목의 화면(또는 그 아래 화면)인지
export function isActive(href: string | undefined, pathname: string): boolean {
	if (!href) return false;
	return pathname === href || pathname.startsWith(`${href}/`);
}

// 시작 주소는 서재로 보낸다(design 결정 12). 로그인하지 않았다면 (app) 레이아웃이 로그인 화면으로 보낸다.
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => redirect(303, '/library');

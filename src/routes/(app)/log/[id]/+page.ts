import { loadBriefingView } from '$lib/briefing';
import type { PageLoad } from './$types';

export const ssr = false;

export const load: PageLoad = ({ fetch, url, params, depends }) => {
	depends('app:briefing');
	return { hasPanel: false, view: loadBriefingView(fetch, params.id, url) };
};

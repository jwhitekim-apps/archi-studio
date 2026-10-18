import type { RequestHandler } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import {
	SIGNUP_MIN_PASSWORD_LENGTH,
	invalidRequest,
	parseCredentials,
	readJson,
	signup
} from '$lib/server/auth-service';

export const POST: RequestHandler = async ({ request }) => {
	const credentials = parseCredentials(await readJson(request), SIGNUP_MIN_PASSWORD_LENGTH);
	if (!credentials) return invalidRequest();
	return signup(authDeps(), credentials);
};

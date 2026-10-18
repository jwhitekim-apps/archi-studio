import type { RequestHandler } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { me } from '$lib/server/auth-service';
import { standardError } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return standardError('unauthenticated');
	return me(authDeps(), locals.user.id);
};

import type { APIRoute } from 'astro';
import { revokeSession, sessionCookie } from '../../lib/session';

export const POST: APIRoute = async ({ cookies, redirect }) => {
  // Se borra la fila, no solo la cookie: un token robado deja de servir.
  await revokeSession(cookies.get(sessionCookie.name)?.value);
  cookies.delete(sessionCookie.name, sessionCookie.options);
  return redirect('/', 303);
};

import type { APIRoute } from 'astro';
import { sessionCookie } from '../../lib/session';

export const POST: APIRoute = async ({ cookies, redirect }) => {
  cookies.delete(sessionCookie.name, { path: '/' });
  return redirect('/', 303);
};

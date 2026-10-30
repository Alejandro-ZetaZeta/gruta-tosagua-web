import { defineMiddleware } from 'astro:middleware';
import { isAdmin } from './lib/admin';
import { sessionCookie, verifySession } from './lib/session';

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  const session = verifySession(context.cookies.get(sessionCookie.name)?.value);

  if (session) {
    context.locals.userId = session.userId;
    context.locals.userEmail = session.email;
  }

  const adminPath =
    path.startsWith('/panel') || path.startsWith('/api/admin') || path.startsWith('/_actions/');
  const admin = session && adminPath ? await isAdmin(session.userId) : false;
  if (admin && session) context.locals.adminEmail = session.email;

  const publicClientAuth = path === '/cuenta/registro';
  if (path.startsWith('/cuenta') && !publicClientAuth && !session) {
    return context.redirect('/login');
  }

  if (path.startsWith('/panel') && path !== '/panel/login' && !admin) {
    return context.redirect('/login');
  }

  if (path.startsWith('/api/admin') && !admin) {
    return new Response(JSON.stringify({ ok: false, error: 'No autorizado.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const response = await next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  return response;
});

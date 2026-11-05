import { defineMiddleware } from 'astro:middleware';
import { isAdmin } from './lib/admin';
import { sessionCookie, verifySession } from './lib/session';

function harden(response: Response, path: string): Response {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  if (import.meta.env.PROD) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (
    path === '/' ||
    path === '/login' ||
    path === '/seguimiento' ||
    path === '/gracias' ||
    path.startsWith('/cuenta') ||
    path.startsWith('/panel') ||
    path.startsWith('/api') ||
    path.startsWith('/_actions/')
  ) {
    response.headers.set('Cache-Control', 'no-store');
  }
  return response;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  const session = await verifySession(context.cookies.get(sessionCookie.name)?.value);

  if (session) {
    context.locals.userId = session.userId;
    context.locals.userEmail = session.email;
  }

  const adminPath =
    path.startsWith('/panel') || path.startsWith('/api/admin') || path.startsWith('/_actions/');
  const admin = session && adminPath ? await isAdmin(session.userId) : false;
  if (admin && session) context.locals.adminEmail = session.email;

  const publicClientAuth =
    path === '/cuenta/registro' ||
    path === '/cuenta/registro/' ||
    path.startsWith('/cuenta/verificar') ||
    path.startsWith('/cuenta/recuperar') ||
    path.startsWith('/cuenta/restablecer');
  const privateClientPath = path.startsWith('/cuenta') || path === '/seguimiento' || path === '/gracias';
  if (privateClientPath && !publicClientAuth && !session) {
    return harden(context.redirect('/login'), path);
  }

  if (path.startsWith('/panel') && path !== '/panel/login' && !admin) {
    return harden(context.redirect('/login'), path);
  }

  if (path.startsWith('/api/admin') && !admin) {
    return harden(
      new Response(JSON.stringify({ ok: false, error: 'No autorizado.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
      path,
    );
  }

  return harden(await next(), path);
});

import type { APIRoute } from 'astro';
import { authClient } from '../../../lib/insforge';

const VERIFIER_COOKIE = 'gruta_google_verifier';

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const callback = new URL('/api/auth/google/callback', url.origin);
  const { data, error } = await authClient().auth.signInWithOAuth('google', {
    redirectTo: callback.toString(),
    skipBrowserRedirect: true,
    additionalParams: { prompt: 'select_account' },
  });

  if (error || !data?.url || !data.codeVerifier) {
    console.error('[google-auth] inicio', error);
    return redirect('/login?error=' + encodeURIComponent('No pudimos abrir Google. Intente de nuevo.'), 303);
  }

  cookies.set(VERIFIER_COOKIE, data.codeVerifier, {
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    path: '/api/auth/google',
    maxAge: 600,
  });

  return redirect(data.url, 303);
};

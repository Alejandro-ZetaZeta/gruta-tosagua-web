import type { APIRoute } from 'astro';
import { authClient } from '../../../lib/supabase';

export const GET: APIRoute = async ({ url, redirect }) => {
  const callback = new URL('/api/auth/google/callback', url.origin);
  const { data, error } = await authClient().auth.signInWithOAuth('google', {
    redirectTo: callback.toString(),
    additionalParams: { prompt: 'select_account' },
  });

  if (error || !data?.url) {
    console.error('[google-auth] inicio', error);
    return redirect('/login?error=' + encodeURIComponent('No pudimos abrir Google. Intente de nuevo.'), 303);
  }

  return redirect(data.url, 303);
};

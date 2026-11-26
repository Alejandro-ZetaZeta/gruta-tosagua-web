import type { APIRoute } from 'astro';
import { authClient, db } from '../../../../lib/supabase';
import { getProfile } from '../../../../lib/profiles';
import {
  createSession,
  sessionCookie,
  sessionCookieOptions,
  sessionTtlSeconds,
} from '../../../../lib/session';

function backToLogin(message: string): string {
  return '/login?error=' + encodeURIComponent(message);
}

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const code = url.searchParams.get('code') || url.searchParams.get('insforge_code');

  if (!code) {
    return redirect(backToLogin('La entrada con Google se interrumpió. Intente de nuevo.'), 303);
  }

  const { data, error } = await authClient().auth.exchangeOAuthCode(code);
  if (error || !data?.user?.id) {
    console.error('[google-auth] intercambio', error);
    return redirect(backToLogin('No pudimos completar la entrada con Google. Intente de nuevo.'), 303);
  }

  const user = data.user;
  let profile = await getProfile(user.id);

  if (!profile) {
    const displayName =
      (user.user_metadata?.full_name as string) ||
      (user.user_metadata?.name as string) ||
      user.email;
    const inserted = await db()
      .database.from('profiles')
      .insert([{ user_id: user.id, display_name: displayName, role: 'CLIENT' }]);
    if (inserted.error) console.error('[google-auth] perfil', inserted.error);
    profile = await getProfile(user.id);
  }

  if (!profile) {
    return redirect(backToLogin('Su cuenta no tiene perfil. Comuníquese con la encargada.'), 303);
  }

  const isAdmin = profile.role === 'ADMIN';
  const token = await createSession(user.id, user.email ?? '', isAdmin);
  cookies.set(sessionCookie.name, token, sessionCookieOptions(sessionTtlSeconds(isAdmin)));
  return redirect(isAdmin ? '/panel' : '/cuenta', 303);
};

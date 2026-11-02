import type { APIRoute } from 'astro';
import { authClient, db } from '../../../../lib/insforge';
import { getProfile } from '../../../../lib/profiles';
import { createSession, sessionCookie } from '../../../../lib/session';

const VERIFIER_COOKIE = 'gruta_google_verifier';

function backToLogin(message: string): string {
  return '/login?error=' + encodeURIComponent(message);
}

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const code = url.searchParams.get('insforge_code');
  const verifier = cookies.get(VERIFIER_COOKIE)?.value;
  cookies.delete(VERIFIER_COOKIE, { path: '/api/auth/google' });

  if (!code || !verifier) {
    return redirect(backToLogin('La entrada con Google se interrumpió. Intente de nuevo.'), 303);
  }

  const { data, error } = await authClient().auth.exchangeOAuthCode(code, verifier);
  if (error || !data?.user?.id) {
    console.error('[google-auth] intercambio', error);
    return redirect(backToLogin('No pudimos completar la entrada con Google. Intente de nuevo.'), 303);
  }

  const user = data.user;
  let profile = await getProfile(user.id);

  // El trigger de InsForge crea el perfil al registrarse; esto cubre cuentas creadas antes.
  if (!profile) {
    const inserted = await db()
      .database.from('profiles')
      .insert([{ user_id: user.id, display_name: user.profile?.name ?? user.email, role: 'CLIENT' }]);
    if (inserted.error) console.error('[google-auth] perfil', inserted.error);
    profile = await getProfile(user.id);
  }

  if (!profile) {
    return redirect(backToLogin('Su cuenta no tiene perfil. Comuníquese con la encargada.'), 303);
  }

  cookies.set(sessionCookie.name, createSession(user.id, user.email), sessionCookie.options);
  return redirect(profile.role === 'ADMIN' ? '/panel' : '/cuenta', 303);
};

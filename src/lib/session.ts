import { createHash, randomBytes } from 'node:crypto';
import { db } from './insforge';

/**
 * Sesiones opacas guardadas en Postgres. La cookie no lleva datos ni JWT:
 * solo un token de 256 bits que se puede revocar borrando su fila.
 */
const CLIENT_TTL_SECONDS = 60 * 60 * 24 * 7;
const ADMIN_TTL_SECONDS = 60 * 60 * 24;
const COOKIE_NAME = import.meta.env.PROD ? '__Host-gruta_session' : 'gruta_session';

export interface SessionUser {
  userId: string;
  email: string;
}

export function sessionTtlSeconds(isAdmin: boolean): number {
  return isAdmin ? ADMIN_TTL_SECONDS : CLIENT_TTL_SECONDS;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: string, email: string, isAdmin: boolean): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionTtlSeconds(isAdmin) * 1000).toISOString();

  // Limpieza oportunista: no bloquea el login si falla.
  const cleanup = await db()
    .database.from('user_sessions')
    .delete()
    .lt('expires_at', new Date().toISOString());
  if (cleanup.error) console.warn('[session] cleanup', cleanup.error);

  const { error } = await db()
    .database.from('user_sessions')
    .insert([
      {
        token_hash: hashToken(token),
        user_id: userId,
        email: email.trim().toLowerCase(),
        expires_at: expiresAt,
      },
    ]);

  if (error) {
    console.error('[session] create', error);
    throw new Error('No pudimos iniciar su sesión. Intente de nuevo.');
  }
  return token;
}

export async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;

  const { data, error } = await db()
    .database.from('user_sessions')
    .select('user_id, email, expires_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle();

  // Si la base falla, se cierra la sesión (fail-closed).
  if (error || !data) return null;

  const row = data as { user_id: string; email: string; expires_at: string };
  const expiresAt = Date.parse(row.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return { userId: row.user_id, email: row.email };
}

/** Revoca la sesión actual. Si la base falla, la cookie se borra igual y la fila expira sola. */
export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) return;
  const { error } = await db().database.from('user_sessions').delete().eq('token_hash', hashToken(token));
  if (error) console.error('[session] revoke', error);
}

/** Tras un cambio de contraseña, todas las sesiones de ese correo dejan de servir. */
export async function revokeSessionsByEmail(email: string): Promise<void> {
  const { error } = await db()
    .database.from('user_sessions')
    .delete()
    .eq('email', email.trim().toLowerCase());
  if (error) console.error('[session] revoke-all', error);
}

export const sessionCookie = {
  name: COOKIE_NAME,
  options: {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: import.meta.env.PROD,
    path: '/',
  },
};

export function sessionCookieOptions(maxAge: number) {
  return { ...sessionCookie.options, maxAge };
}

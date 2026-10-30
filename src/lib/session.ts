import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverEnv } from './env';

const COOKIE_NAME = 'gruta_session';
const WEEK_SECONDS = 60 * 60 * 24 * 7;

function secret(): string {
  const value = serverEnv('SESSION_SECRET', import.meta.env.SESSION_SECRET);
  if (!value) throw new Error('Falta SESSION_SECRET en .env.local');
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createSession(userId: string, email: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, email, exp: Date.now() + WEEK_SECONDS * 1000 }),
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifySession(token: string | undefined): { userId: string; email: string } | null {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      uid?: string;
      email?: string;
      exp?: number;
    };
    if (!parsed.uid || !parsed.email || !parsed.exp || parsed.exp < Date.now()) return null;
    return { userId: parsed.uid, email: parsed.email };
  } catch {
    return null;
  }
}

export const sessionCookie = {
  name: COOKIE_NAME,
  options: {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: import.meta.env.PROD,
    path: '/',
    maxAge: WEEK_SECONDS,
  },
};

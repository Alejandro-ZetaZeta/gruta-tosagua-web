import { timingSafeEqual } from 'node:crypto';
import { serverEnv } from './env';

export function isPlayerRequest(request: Request): boolean {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const expected = serverEnv('PLAYER_TOKEN', import.meta.env.PLAYER_TOKEN);
  if (!token || !expected) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ ok: false, error: 'No autorizado.' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

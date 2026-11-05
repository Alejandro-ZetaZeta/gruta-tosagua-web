import { createHash } from 'node:crypto';
import { db } from './insforge';

/**
 * Límite persistente por clave (acción + IP). La IP se guarda hasheada.
 * Si la base falla, no bloquea: el límite es defensa en profundidad.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const separator = key.indexOf(':');
  const scope = separator === -1 ? 'general' : key.slice(0, separator);
  const identifier = separator === -1 ? key : key.slice(separator + 1);
  const storageKey = `${scope}:${createHash('sha256').update(identifier).digest('hex')}`;

  const { data, error } = await db().database.rpc('consume_rate_limit', {
    p_key: storageKey,
    p_limit: limit,
    p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
  });

  if (error) {
    console.error('[rate-limit]', error);
    return true;
  }
  return data === true;
}

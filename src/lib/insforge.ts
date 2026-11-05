import { createAdminClient, createClient } from '@insforge/sdk';
import { serverEnv } from './env';

let admin: ReturnType<typeof createAdminClient> | null = null;

/** Cliente con la API key del proyecto. Solo se usa en el servidor. */
export function db() {
  if (admin) return admin;
  const baseUrl = serverEnv('INSFORGE_URL', import.meta.env.INSFORGE_URL);
  const apiKey = serverEnv('INSFORGE_API_KEY', import.meta.env.INSFORGE_API_KEY);
  if (!baseUrl || !apiKey) {
    throw new Error('Falta configurar InsForge. Revise .env.local.');
  }
  admin = createAdminClient({ baseUrl, apiKey });
  return admin;
}

/**
 * Cliente público, solo para validar credenciales. Sus JWT se descartan a
 * propósito: InsForge no revoca refresh tokens del lado del servidor, así que
 * la sesión de la app vive en public.user_sessions.
 */
export function authClient() {
  const baseUrl = serverEnv('INSFORGE_URL', import.meta.env.INSFORGE_URL);
  const anonKey = serverEnv('INSFORGE_ANON_KEY', import.meta.env.INSFORGE_ANON_KEY);
  if (!baseUrl || !anonKey) {
    throw new Error('Falta configurar InsForge. Revise .env.local.');
  }
  return createClient({ baseUrl, anonKey, isServerMode: true });
}

export function storage(bucket: 'receipts' | 'audios') {
  return db().storage.from(bucket);
}

export function describeDbError(error: unknown): string {
  if (!error) return 'Error desconocido.';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = String((error as { message?: unknown }).message ?? '');
    if (message.includes('SLOT_CAPACITY_EXCEEDED')) return 'La tanda ya está llena.';
    if (message.includes('profiles_phone_ec') || message.includes('orders_client_phone_ec')) {
      return 'Escriba un teléfono de Ecuador. Ej.: 0991234567.';
    }
    if (message.includes('orders_client_name_len')) {
      return 'Escriba un nombre válido.';
    }
    return message || 'Error de base de datos.';
  }
  return String(error);
}

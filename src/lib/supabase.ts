import { createClient } from '@supabase/supabase-js';
import { serverEnv } from './env';

let adminClient: any = null;
let publicClient: any = null;

function getSupabaseUrl(): string {
  const url =
    serverEnv('SUPABASE_URL', import.meta.env.SUPABASE_URL) ||
    serverEnv('INSFORGE_URL', import.meta.env.INSFORGE_URL);
  if (!url) throw new Error('Falta SUPABASE_URL en .env.local.');
  return url;
}

function getServiceRoleKey(): string {
  const key =
    serverEnv('SUPABASE_SERVICE_ROLE_KEY', import.meta.env.SUPABASE_SERVICE_ROLE_KEY) ||
    serverEnv('SUPABASE_SECRET_KEY', import.meta.env.SUPABASE_SECRET_KEY) ||
    serverEnv('INSFORGE_API_KEY', import.meta.env.INSFORGE_API_KEY);
  if (!key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en .env.local.');
  return key;
}

function getAnonKey(): string {
  const key =
    serverEnv('SUPABASE_ANON_KEY', import.meta.env.SUPABASE_ANON_KEY) ||
    serverEnv('SUPABASE_PUBLISHABLE_KEY', import.meta.env.SUPABASE_PUBLISHABLE_KEY) ||
    serverEnv('INSFORGE_ANON_KEY', import.meta.env.INSFORGE_ANON_KEY);
  if (!key) throw new Error('Falta SUPABASE_ANON_KEY en .env.local.');
  return key;
}

/** Cliente con permisos de administración (service_role). Solo para el servidor. */
export function getAdminClient(): any {
  if (adminClient) return adminClient;
  adminClient = createClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

/** Cliente público para autenticación. */
export function getAnonClient(): any {
  if (publicClient) return publicClient;
  publicClient = createClient(getSupabaseUrl(), getAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return publicClient;
}

/**
 * Cliente de base de datos compatible tanto con llamadas directas (db().from(...))
 * como con la sintaxis de InsForge (db().database.from(...)).
 */
export function db(): any {
  const client = getAdminClient();
  if (!client.database) {
    client.database = {
      from: client.from.bind(client),
      rpc: client.rpc.bind(client),
    };
  }
  return client;
}

/**
 * Cliente de autenticación con adaptadores para compatibilidad de firmas de InsForge y Supabase.
 */
export function authClient(): any {
  const anon = getAnonClient();

  return {
    ...anon,
    auth: {
      ...anon.auth,
      signInWithPassword: async (credentials: any) => {
        const res = await anon.auth.signInWithPassword(credentials);
        if (res.error) {
          (res.error as any).statusCode = (res.error as any).status || 400;
        }
        return res;
      },

      signUp: async ({ email, password, name }: { email: string; password: string; name?: string }) => {
        const res = await anon.auth.signUp({
          email,
          password,
          options: name ? { data: { name, full_name: name } } : undefined,
        });
        if (res.error || !res.data) {
          return res;
        }
        const requiresVerification =
          !res.data.session && Boolean(res.data.user && !(res.data.user as any).confirmed_at);
        return {
          data: {
            ...res.data,
            requireEmailVerification: requiresVerification,
            accessToken: res.data.session?.access_token ?? null,
          },
          error: null,
        };
      },

      verifyEmail: async ({ email, otp }: { email: string; otp: string }) => {
        return anon.auth.verifyOtp({ email, token: otp, type: 'signup' });
      },

      resendVerificationEmail: async ({ email }: { email: string }) => {
        return anon.auth.resend({ email, type: 'signup' });
      },

      sendResetPasswordEmail: async ({ email }: { email: string }) => {
        return anon.auth.resetPasswordForEmail(email);
      },

      exchangeResetPasswordToken: async ({ email, code }: { email: string; code: string }) => {
        const res = await anon.auth.verifyOtp({ email, token: code, type: 'recovery' });
        if (res.error || !res.data?.session?.access_token) {
          return { data: null, error: res.error ?? new Error('Código inválido o expirado.') };
        }
        return {
          data: { token: res.data.session.access_token, user: res.data.user },
          error: null,
        };
      },

      resetPassword: async ({ newPassword, otp }: { newPassword: string; otp?: string }) => {
        if (otp) {
          const userClient = createClient(getSupabaseUrl(), getAnonKey(), {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: `Bearer ${otp}` } },
          });
          return userClient.auth.updateUser({ password: newPassword });
        }
        return anon.auth.updateUser({ password: newPassword });
      },

      signInWithOAuth: async (provider: string, options?: { redirectTo?: string; additionalParams?: Record<string, string> }) => {
        return anon.auth.signInWithOAuth({
          provider: provider as any,
          options: {
            redirectTo: options?.redirectTo,
            queryParams: options?.additionalParams,
            skipBrowserRedirect: true,
          },
        });
      },

      exchangeOAuthCode: async (code: string) => {
        return anon.auth.exchangeCodeForSession(code);
      },
    },
  };
}

/**
 * Acceso al storage de Supabase (receipts / audios).
 * Adapta métodos como remove() y upload() para compatibilidad total.
 */
export function storage(bucket: 'receipts' | 'audios'): any {
  const b = getAdminClient().storage.from(bucket);
  return {
    ...b,
    upload: async (path: string, fileBody: any, fileOptions?: any) => {
      const res = await b.upload(path, fileBody, fileOptions);
      if (res.data) {
        (res.data as any).url = res.data.path;
      }
      return res;
    },
    createSignedUrl: b.createSignedUrl.bind(b),
    createSignedUrls: b.createSignedUrls.bind(b),
    remove: async (paths: string | string[]) => {
      const list = Array.isArray(paths) ? paths : [paths];
      return b.remove(list);
    },
  };
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

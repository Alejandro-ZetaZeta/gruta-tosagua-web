import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const env = {};
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index > 0) env[line.slice(0, index)] = line.slice(index + 1);
  }
  return env;
}

const env = loadEnv();
const rl = createInterface({ input: process.stdin, output: process.stdout });

try {
  const defaultEmail = (env.ADMIN_EMAIL || '').trim().toLowerCase();
  const suggested = defaultEmail ? ` (${defaultEmail})` : '';
  const email = (
    process.argv[2] ??
    ((await rl.question(`Correo a promover a ADMIN${suggested}: `)) || defaultEmail)
  )
    .trim()
    .toLowerCase();

  if (!email || !email.includes('@')) throw new Error('Correo inválido.');

  const supabaseUrl = env.SUPABASE_URL || env.INSFORGE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || env.INSFORGE_API_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.');
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc('set_user_role_by_email', {
    p_email: email,
    p_role: 'ADMIN',
  });
  if (error) throw new Error(error.message);

  // Un ascenso de privilegios invalida las sesiones abiertas con el rol anterior.
  const revoked = await admin.from('user_sessions').delete().eq('user_id', data);
  if (revoked.error) console.warn('Rol actualizado, pero no se pudieron cerrar las sesiones:', revoked.error.message);

  console.log(`La cuenta ${email} ahora es ADMIN (${data}). Vuelva a entrar para usar el panel.`);
} catch (error) {
  console.error('No se pudo promover la cuenta:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  rl.close();
}

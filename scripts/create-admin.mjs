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
    ((await rl.question(`Correo de la encargada${suggested}: `)) || defaultEmail)
  )
    .trim()
    .toLowerCase();

  const password = await rl.question('Contraseña (mínimo 12 caracteres): ');

  if (!email || !email.includes('@')) throw new Error('Correo inválido.');
  if (password.length < 12) throw new Error('Use una contraseña de al menos 12 caracteres.');

  const supabaseUrl = env.SUPABASE_URL || env.INSFORGE_URL;
  const anonKey = env.SUPABASE_ANON_KEY || env.INSFORGE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || env.INSFORGE_API_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.');
  }

  const client = createClient(supabaseUrl, anonKey || serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { name: 'Encargada' } },
  });

  if (error) {
    if (/already|exists|registered/i.test(error.message)) {
      throw new Error('Esa cuenta ya existe. Use "npm run promote-admin" para darle acceso al panel.');
    }
    throw new Error(error.message);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const promoted = await admin.rpc('set_user_role_by_email', {
    p_email: email,
    p_role: 'ADMIN',
  });
  if (promoted.error) throw new Error(promoted.error.message);

  console.log(`Cuenta lista y promovida a ADMIN: ${data?.user?.email ?? email}`);
} catch (error) {
  console.error('No se pudo crear la cuenta:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  rl.close();
}

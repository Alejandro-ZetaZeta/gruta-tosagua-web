import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { createAdminClient, createClient } from '@insforge/sdk';

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
  const password = process.argv[3] ?? (await rl.question('Contraseña (mínimo 10 caracteres): '));

  if (!email || !email.includes('@')) throw new Error('Correo inválido.');
  if (password.length < 10) throw new Error('Use una contraseña de al menos 10 caracteres.');

  const client = createClient({
    baseUrl: env.INSFORGE_URL,
    anonKey: env.INSFORGE_ANON_KEY,
    isServerMode: true,
  });

  const { data, error } = await client.auth.signUp({ email, password, name: 'Encargada' });
  if (error) {
    if (/already|exists|registered/i.test(error.message)) {
      throw new Error('Esa cuenta ya existe. Use "npm run promote-admin" para darle acceso al panel.');
    }
    throw new Error(error.message);
  }
  if (data?.requireEmailVerification) {
    console.log('La cuenta se creó, pero el proyecto pide verificación por correo.');
  }

  const admin = createAdminClient({ baseUrl: env.INSFORGE_URL, apiKey: env.INSFORGE_API_KEY });
  const promoted = await admin.database.rpc('set_user_role_by_email', {
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

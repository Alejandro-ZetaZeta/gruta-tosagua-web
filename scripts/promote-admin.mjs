import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { createAdminClient } from '@insforge/sdk';

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

  const admin = createAdminClient({ baseUrl: env.INSFORGE_URL, apiKey: env.INSFORGE_API_KEY });
  const { data, error } = await admin.database.rpc('set_user_role_by_email', {
    p_email: email,
    p_role: 'ADMIN',
  });
  if (error) throw new Error(error.message);

  console.log(`La cuenta ${email} ahora es ADMIN (${data}).`);
} catch (error) {
  console.error('No se pudo promover la cuenta:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  rl.close();
}

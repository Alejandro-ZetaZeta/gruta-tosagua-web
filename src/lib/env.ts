/**
 * En producción, las variables del proceso mandan (se pueden cambiar sin
 * reconstruir). En desarrollo, Astro las inyecta desde .env.local.
 */
export function serverEnv(name: string, fallback: string | undefined): string {
  const fromProcess = process.env[name];
  return fromProcess && fromProcess.length > 0 ? fromProcess : (fallback ?? '');
}

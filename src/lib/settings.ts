import { db, describeDbError } from './insforge';
import type { Settings } from './types';

export async function getSettings(): Promise<Settings> {
  const { data, error } = await db()
    .database.from('system_settings')
    .select('*')
    .eq('id', 1)
    .single();
  if (error || !data) throw new Error(`No pudimos leer la configuración. ${describeDbError(error)}`);
  return data as Settings;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const { data, error } = await db()
    .database.from('system_settings')
    .update(patch)
    .eq('id', 1)
    .select('*')
    .single();
  if (error || !data) throw new Error(`No pudimos guardar la configuración. ${describeDbError(error)}`);
  return data as Settings;
}

export async function addBlockedPhone(phone: string): Promise<void> {
  const settings = await getSettings();
  const normalized = phone.replace(/\D/g, '');
  if (!normalized || settings.blocked_phones.includes(normalized)) return;
  await updateSettings({ blocked_phones: [...settings.blocked_phones, normalized] });
}

export function isBlocked(settings: Settings, phone: string): boolean {
  const normalized = phone.replace(/\D/g, '');
  return settings.blocked_phones.includes(normalized);
}

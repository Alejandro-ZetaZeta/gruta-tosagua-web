import { serverEnv } from './env';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function offsetFromEnv(): number {
  const n = Number(serverEnv('UTC_OFFSET_MIN', import.meta.env.UTC_OFFSET_MIN) || -300);
  return Number.isFinite(n) ? n : -300;
}

export function toLocal(instant: Date, offsetMin: number): Date {
  return new Date(instant.getTime() + offsetMin * 60_000);
}

export function localDateKey(instant: Date, offsetMin: number): string {
  const d = toLocal(instant, offsetMin);
  return keyFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function localMinutes(instant: Date, offsetMin: number): number {
  const d = toLocal(instant, offsetMin);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function keyFromParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseDateKey(key: string): { year: number; month: number; day: number } {
  const m = DATE_RE.exec(key);
  if (!m) throw new Error(`Fecha inválida: ${key}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function addDaysKey(key: string, days: number): string {
  const { year, month, day } = parseDateKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return keyFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function parseTimeToMinutes(time: string): number {
  const [h = '0', m = '0'] = time.split(':');
  return Number(h) * 60 + Number(m);
}

export function minutesToTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Instante UTC que corresponde a una fecha y hora locales de La Gruta. */
export function utcFromLocal(dateKey: string, time: string, offsetMin: number): Date {
  const { year, month, day } = parseDateKey(dateKey);
  const minutes = parseTimeToMinutes(time);
  return new Date(Date.UTC(year, month - 1, day, 0, minutes) - offsetMin * 60_000);
}

export function formatTime(instant: string | Date, offsetMin = offsetFromEnv()): string {
  const d = toLocal(new Date(instant), offsetMin);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function formatClock(time: string): string {
  return time.slice(0, 5);
}

const longDate = new Intl.DateTimeFormat('es-EC', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

const shortDate = new Intl.DateTimeFormat('es-EC', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

export function formatDateLong(dateKey: string): string {
  const { year, month, day } = parseDateKey(dateKey);
  const text = longDate.format(new Date(Date.UTC(year, month - 1, day)));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatDateShort(dateKey: string): string {
  const { year, month, day } = parseDateKey(dateKey);
  const text = shortDate.format(new Date(Date.UTC(year, month - 1, day)));
  return text.charAt(0).toUpperCase() + text.slice(1).replace(/\.$/, '');
}

export function formatDateTime(instant: string, offsetMin = offsetFromEnv()): string {
  const key = localDateKey(new Date(instant), offsetMin);
  return `${formatDateShort(key)} · ${formatTime(instant, offsetMin)}`;
}

export function formatMoney(value: number): string {
  return `$${Number(value).toFixed(2)}`;
}

/** ~2.5 palabras por segundo: 110 s ≈ 275 palabras de lectura pausada. */
export function estimateSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 2.5));
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

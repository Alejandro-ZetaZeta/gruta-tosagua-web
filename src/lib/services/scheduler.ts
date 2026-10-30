import { db, describeDbError } from '../insforge';
import {
  addDaysKey,
  localDateKey,
  localMinutes,
  minutesToTime,
  parseTimeToMinutes,
  utcFromLocal,
} from '../time';
import type { Order, ScheduleSlot, Settings } from '../types';

export interface ExistingUsage {
  slot_time: string;
  duration_sec: number;
}

export interface Placement {
  date: string;
  time: string;
  at: Date;
}

export interface PlanResult {
  placements: Placement[];
  spillover: number;
  days: string[];
  warning: 'CUTOFF_TODAY' | 'NO_SPACE' | null;
}

export interface PlanInput {
  targetDate: string;
  quantity: number;
  durationSec: number;
  urgent: boolean;
  settings: Settings;
  now?: Date;
  existing: ExistingUsage[];
  maxDays?: number;
}

const MAX_LOOKAHEAD_DAYS = 7;
const SLOT_BUFFER_MIN = 5;

function minuteKey(at: Date): number {
  return Math.floor(at.getTime() / 60_000);
}

export function slotTimesForDay(settings: Settings): string[] {
  const open = parseTimeToMinutes(settings.open_time);
  const close = parseTimeToMinutes(settings.close_time);
  const times: string[] = [];
  for (let m = open; m < close; m += settings.slot_interval_min) {
    times.push(minutesToTime(m));
  }
  return times;
}

function pickSpread(times: Date[], count: number, gapMinutes: number): Date[] {
  if (count <= 0 || times.length === 0) return [];
  const gap = gapMinutes * 60_000;
  const picked: Date[] = [];
  const fitsGap = (t: Date) => picked.every((p) => Math.abs(p.getTime() - t.getTime()) >= gap);
  const first = times[0]!.getTime();
  const last = times[times.length - 1]!.getTime();

  for (let i = 0; i < count; i++) {
    const ideal = count === 1 ? (first + last) / 2 : first + (i * (last - first)) / (count - 1);
    let best: Date | null = null;
    let bestDistance = Infinity;
    for (const t of times) {
      if (picked.includes(t) || !fitsGap(t)) continue;
      const distance = Math.abs(t.getTime() - ideal);
      if (distance < bestDistance) {
        best = t;
        bestDistance = distance;
      }
    }
    if (best) picked.push(best);
  }

  return picked.sort((a, b) => a.getTime() - b.getTime());
}

function pickEarliest(times: Date[], count: number, gapMinutes: number): Date[] {
  if (count <= 0) return [];
  const gap = gapMinutes * 60_000;
  const picked: Date[] = [];
  const fitsGap = (t: Date) => picked.every((p) => Math.abs(p.getTime() - t.getTime()) >= gap);

  for (const t of times) {
    if (picked.length >= count) break;
    if (fitsGap(t)) picked.push(t);
  }
  return picked.sort((a, b) => a.getTime() - b.getTime());
}

export function planSchedule(input: PlanInput): PlanResult {
  const { settings, durationSec } = input;
  const now = input.now ?? new Date();
  const offset = settings.utc_offset_min;
  const today = localDateKey(now, offset);
  const maxDays = input.maxDays ?? MAX_LOOKAHEAD_DAYS;

  let day = input.targetDate;
  let lastWarning: PlanResult['warning'] = null;
  if (day < today) throw new Error('La fecha elegida ya pasó.');

  if (day === today && localMinutes(now, offset) >= parseTimeToMinutes(settings.cutoff_time)) {
    day = addDaysKey(today, 1);
    lastWarning = 'CUTOFF_TODAY';
  }

  const usage = new Map<number, number>();
  for (const row of input.existing) {
    const key = minuteKey(new Date(row.slot_time));
    usage.set(key, (usage.get(key) ?? 0) + row.duration_sec);
  }

  const placements: Placement[] = [];
  let pending = input.quantity;

  for (let i = 0; i <= maxDays && pending > 0; i++) {
    const date = addDaysKey(day, i);
    const candidates = slotTimesForDay(settings)
      .map((time) => ({ date, time, at: utcFromLocal(date, time, offset) }))
      .filter((c) => c.at.getTime() > now.getTime() + SLOT_BUFFER_MIN * 60_000)
      .filter((c) => (usage.get(minuteKey(c.at)) ?? 0) + durationSec <= settings.max_slot_seconds);

    if (candidates.length === 0) continue;

    const times = candidates.map((c) => c.at);
    const chosen = input.urgent
      ? pickEarliest(times, pending, settings.min_repeat_gap_min)
      : pickSpread(times, pending, settings.min_repeat_gap_min);

    for (const at of chosen) {
      placements.push({ date: localDateKey(at, offset), time: minutesToTime(localMinutes(at, offset)), at });
      usage.set(minuteKey(at), (usage.get(minuteKey(at)) ?? 0) + durationSec);
    }
    pending -= chosen.length;
  }

  if (pending > 0) lastWarning = 'NO_SPACE';

  const uniqueDays = [...new Set(placements.map((p) => p.date))].sort();
  return {
    placements,
    spillover: placements.filter((p) => p.date !== input.targetDate).length,
    days: uniqueDays,
    warning: lastWarning,
  };
}

function rangeBounds(targetDate: string, settings: Settings, maxDays = MAX_LOOKAHEAD_DAYS) {
  const start = utcFromLocal(targetDate, '00:00', settings.utc_offset_min);
  const end = utcFromLocal(addDaysKey(targetDate, maxDays + 1), '00:00', settings.utc_offset_min);
  return { start, end };
}

export async function getUsage(
  targetDate: string,
  settings: Settings,
  maxDays = MAX_LOOKAHEAD_DAYS,
): Promise<ExistingUsage[]> {
  const { start, end } = rangeBounds(targetDate, settings, maxDays);
  const { data, error } = await db()
    .database.from('schedule_slots')
    .select('slot_time, duration_sec')
    .gte('slot_time', start.toISOString())
    .lt('slot_time', end.toISOString());
  if (error) throw new Error(`No pudimos leer las tandas. ${describeDbError(error)}`);
  return (data ?? []) as ExistingUsage[];
}

export async function previewSchedule(
  targetDate: string,
  quantity: number,
  durationSec: number,
  urgent: boolean,
  settings: Settings,
): Promise<PlanResult> {
  const existing = await getUsage(targetDate, settings);
  return planSchedule({ targetDate, quantity, durationSec, urgent, settings, existing });
}

export interface ScheduleOutcome {
  placements: Placement[];
  spillover: number;
  warning: PlanResult['warning'];
}

export async function scheduleOrder(
  orderId: string,
  durationSec: number,
  settings: Settings,
): Promise<ScheduleOutcome> {
  const { data, error } = await db()
    .database.from('orders')
    .select('id, target_date, total_emissions, is_urgent, status')
    .eq('id', orderId)
    .single();
  if (error || !data) throw new Error(`No pudimos leer el pedido. ${describeDbError(error)}`);
  const order = data as Pick<Order, 'id' | 'target_date' | 'total_emissions' | 'is_urgent' | 'status'>;

  if (order.status !== 'UNDER_REVIEW' && order.status !== 'APPROVED') {
    throw new Error('Este pedido ya fue procesado.');
  }

  const existing = await getUsage(order.target_date, settings);
  const plan = planSchedule({
    targetDate: order.target_date,
    quantity: order.total_emissions,
    durationSec,
    urgent: order.is_urgent,
    settings,
    existing,
  });

  if (plan.placements.length < order.total_emissions) {
    throw new Error(
      'No hay suficientes tandas libres esta semana. Revise los ajustes de horario o pida al cliente otra fecha.',
    );
  }

  const rows = plan.placements.map((p) => ({
    slot_time: p.at.toISOString(),
    order_id: orderId,
    duration_sec: durationSec,
  }));

  const inserted = await db().database.from('schedule_slots').insert(rows).select('id');
  if (inserted.error) {
    throw new Error(`No pudimos programar las tandas. ${describeDbError(inserted.error)}`);
  }
  const slotIds = ((inserted.data ?? []) as Array<{ id: string }>).map((row) => row.id);

  const updated = await db()
    .database.from('orders')
    .update({
      status: 'SCHEDULED',
      remaining_emissions: order.total_emissions,
      approved_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('status', order.status)
    .select('id');

  if (updated.error || !updated.data || updated.data.length === 0) {
    if (slotIds.length > 0) {
      const cleanup = await db().database.from('schedule_slots').delete().in('id', slotIds);
      if (cleanup.error) {
        console.error('[schedule] No pudimos limpiar las tandas huérfanas:', cleanup.error);
      }
    }
    throw new Error(
      updated.error
        ? `No pudimos actualizar el pedido. ${describeDbError(updated.error)}`
        : 'El pedido cambió de estado mientras lo programábamos. Intente de nuevo.',
    );
  }

  return { placements: plan.placements, spillover: plan.spillover, warning: plan.warning };
}

export interface DaySlot extends ScheduleSlot {
  order_code: string;
  client_name: string;
  category: Order['category'];
}

export async function getDaySlots(dateKey: string, settings: Settings): Promise<DaySlot[]> {
  const { start, end } = rangeBounds(dateKey, settings, 0);
  const { data, error } = await db()
    .database.from('schedule_slots')
    .select('id, slot_time, order_id, status, duration_sec, played_at, created_at, orders(order_code, client_name, category)')
    .gte('slot_time', start.toISOString())
    .lt('slot_time', end.toISOString())
    .order('slot_time', { ascending: true });
  if (error) throw new Error(`No pudimos leer las tandas del día. ${describeDbError(error)}`);

  type Row = ScheduleSlot & {
    orders: { order_code: string; client_name: string; category: Order['category'] } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    ...row,
    order_code: row.orders?.order_code ?? '—',
    client_name: row.orders?.client_name ?? '—',
    category: row.orders?.category ?? 'OTHER',
  }));
}

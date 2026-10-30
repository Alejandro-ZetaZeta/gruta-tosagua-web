import { db, describeDbError } from '../insforge';
import { localDateKey, utcFromLocal, formatTime } from '../time';
import type { Category, Order, Payment, Settings } from '../types';
import { getDaySlots, type DaySlot } from './scheduler';

export interface DashboardStats {
  pendingReview: number;
  queuedToday: number;
  playedToday: number;
  collectedToday: number;
}

export interface SlotGroup {
  time: string;
  slotAt: string;
  count: number;
  seconds: number;
  status: 'played' | 'next' | 'full' | 'normal' | 'failed';
  codes: string[];
  items: DaySlot[];
}

export interface NextSlot {
  time: string;
  count: number;
  seconds: number;
}

export interface ReconciliationRow {
  id: string;
  playedAt: string;
  orderCode: string;
  clientName: string;
  amount: number;
  reference: string | null;
  referenceValue: string | null;
  bank: string | null;
  paymentId: string | null;
  receiptKey: string | null;
  reconciled: boolean;
  category: Category;
}

export interface HistoryRow {
  order: Order;
  payment: Payment | null;
}

export async function getDashboardStats(settings: Settings): Promise<DashboardStats> {
  const today = localDateKey(new Date(), settings.utc_offset_min);
  const start = utcFromLocal(today, '00:00', settings.utc_offset_min).toISOString();
  const end = utcFromLocal(today, '23:59', settings.utc_offset_min).toISOString();

  const pending = await db()
    .database.from('orders')
    .select('id', { count: 'exact' })
    .eq('status', 'UNDER_REVIEW')
    .limit(1);
  if (pending.error) throw new Error(describeDbError(pending.error));

  const queue = await db()
    .database.from('schedule_slots')
    .select('id', { count: 'exact' })
    .gte('slot_time', start)
    .lte('slot_time', end)
    .in('status', ['QUEUED', 'DOWNLOADED_LOCALLY'])
    .limit(1);
  if (queue.error) throw new Error(describeDbError(queue.error));

  const played = await db()
    .database.from('emissions_log')
    .select('id', { count: 'exact' })
    .gte('played_at', start)
    .lte('played_at', end)
    .limit(1);
  if (played.error) throw new Error(describeDbError(played.error));

  const approved = await db()
    .database.from('orders')
    .select('amount_due')
    .gte('approved_at', start)
    .lte('approved_at', end);
  if (approved.error) throw new Error(describeDbError(approved.error));

  return {
    pendingReview: pending.count ?? 0,
    queuedToday: queue.count ?? 0,
    playedToday: played.count ?? 0,
    collectedToday: (approved.data ?? []).reduce(
      (sum: number, row: { amount_due: number }) => sum + Number(row.amount_due),
      0,
    ),
  };
}

export function groupSlots(slots: DaySlot[], settings: Settings, now = new Date(), markNext = true): SlotGroup[] {
  const groups = new Map<string, DaySlot[]>();
  for (const slot of slots) {
    const list = groups.get(slot.slot_time) ?? [];
    list.push(slot);
    groups.set(slot.slot_time, list);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slotAt, items]) => {
      const seconds = items.reduce((sum, item) => sum + item.duration_sec, 0);
      const allPlayed = items.every((item) => item.status === 'PLAYED' || item.status === 'SKIPPED');
      const failed = items.some((item) => item.status === 'FAILED');
      const isNext = markNext && !allPlayed && new Date(slotAt) >= now;
      const status: SlotGroup['status'] = allPlayed
        ? 'played'
        : failed
          ? 'failed'
          : isNext
            ? 'next'
            : seconds >= settings.max_slot_seconds
              ? 'full'
              : 'normal';
      return {
        time: formatTime(slotAt, settings.utc_offset_min),
        slotAt,
        count: items.length,
        seconds,
        status,
        codes: items.map((item) => item.order_code),
        items,
      };
    });
}

export function nextSlot(slots: DaySlot[], settings: Settings, now = new Date()): NextSlot | null {
  const upcoming = slots
    .filter((slot) => new Date(slot.slot_time) >= now && slot.status !== 'PLAYED' && slot.status !== 'SKIPPED')
    .sort((a, b) => new Date(a.slot_time).getTime() - new Date(b.slot_time).getTime());

  const first = upcoming[0];
  if (!first) return null;
  const same = upcoming.filter((slot) => slot.slot_time === first.slot_time);
  return {
    time: formatTime(first.slot_time, settings.utc_offset_min),
    count: same.length,
    seconds: same.reduce((sum, slot) => sum + slot.duration_sec, 0),
  };
}

export async function getTodaySlotGroups(settings: Settings): Promise<{
  slots: DaySlot[];
  groups: SlotGroup[];
  next: NextSlot | null;
}> {
  const slots = await getDaySlots(localDateKey(new Date(), settings.utc_offset_min), settings);
  return { slots, groups: groupSlots(slots, settings), next: nextSlot(slots, settings) };
}

type EmissionRow = {
  id: string;
  played_at: string;
  amount: number;
  orders:
    | {
        order_code: string;
        client_name: string;
        category: Category;
        payments: Array<{
          id: string;
          reference_number: string | null;
          receipt_key: string | null;
          extracted_data: { banco?: string | null } | null;
          validation_flags: { reference_value?: string | null } | null;
          reconciled_at: string | null;
          created_at: string;
        }>;
      }
    | null;
};

export async function getReconciliation(settings: Settings, dateKey?: string): Promise<ReconciliationRow[]> {
  const day = dateKey ?? localDateKey(new Date(), settings.utc_offset_min);
  const start = utcFromLocal(day, '00:00', settings.utc_offset_min).toISOString();
  const end = utcFromLocal(day, '23:59', settings.utc_offset_min).toISOString();

  const { data, error } = await db()
    .database.from('emissions_log')
    .select(
      'id, played_at, amount, orders!inner(order_code, client_name, category, payments(id, reference_number, receipt_key, extracted_data, validation_flags, reconciled_at, created_at))',
    )
    .gte('played_at', start)
    .lte('played_at', end)
    .order('played_at', { ascending: false });

  if (error) throw new Error(describeDbError(error));

  return ((data ?? []) as unknown as EmissionRow[]).map((row) => {
    const payment = [...(row.orders?.payments ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return {
      id: row.id,
      playedAt: row.played_at,
      orderCode: row.orders?.order_code ?? '—',
      clientName: row.orders?.client_name ?? '—',
      amount: Number(row.amount),
      reference: payment?.reference_number ?? null,
      referenceValue: payment?.validation_flags?.reference_value ?? null,
      bank: payment?.extracted_data?.banco ?? null,
      paymentId: payment?.id ?? null,
      receiptKey: payment?.receipt_key ?? null,
      reconciled: Boolean(payment?.reconciled_at),
      category: row.orders?.category ?? 'OTHER',
    };
  });
}

export async function getHistory(search = ''): Promise<HistoryRow[]> {
  const { data, error } = await db()
    .database.from('orders')
    .select('*, payments(*)')
    .in('status', ['COMPLETED', 'REJECTED', 'APPROVED', 'SCHEDULED'])
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(describeDbError(error));

  type Row = Order & { payments: Payment[] };
  const rows = ((data ?? []) as Row[]).map((row) => {
    const payment = [...(row.payments ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
    return { order: row, payment };
  });

  const term = search.trim().toLowerCase();
  if (!term) return rows;
  return rows.filter(
    ({ order }) =>
      order.order_code.toLowerCase().includes(term) ||
      order.client_name.toLowerCase().includes(term) ||
      order.client_phone.includes(term),
  );
}

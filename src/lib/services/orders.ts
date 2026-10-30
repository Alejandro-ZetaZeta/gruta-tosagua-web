import { db, describeDbError } from '../insforge';
import { isBlocked } from '../settings';
import { formatClock, localDateKey, localMinutes, normalizePhone, parseTimeToMinutes } from '../time';
import type { Category, Order, Payment, ScheduleSlot, Settings, Voice } from '../types';
import { CATEGORIES, VOICES } from '../types';
import { latestPayment } from './payments';

export interface CreateOrderInput {
  clientName: string;
  clientPhone: string;
  category: Category;
  rawIdea: string;
  finalScript: string;
  voice: Voice;
  totalEmissions: number;
  targetDate: string;
  isUrgent: boolean;
}

export function validateOrderInput(input: CreateOrderInput, settings: Settings): CreateOrderInput {
  const clientName = input.clientName.trim();
  const clientPhone = input.clientPhone.trim();
  const rawIdea = input.rawIdea.trim();
  const finalScript = input.finalScript.trim();

  if (clientName.length < 2 || clientName.length > 80) throw new Error('Escriba su nombre completo.');
  if (normalizePhone(clientPhone).length < 7) throw new Error('Escriba un teléfono válido.');
  if (rawIdea.length < 10 || rawIdea.length > 1200) {
    throw new Error('Cuéntenos su anuncio con un poco más de detalle.');
  }
  if (!CATEGORIES.includes(input.category)) throw new Error('Elija el tipo de anuncio.');
  if (!VOICES.includes(input.voice)) throw new Error('Elija un tono de voz válido.');
  if (!Number.isInteger(input.totalEmissions) || input.totalEmissions < 1 || input.totalEmissions > settings.max_emissions) {
    throw new Error(`Puede pedir entre 1 y ${settings.max_emissions} emisiones.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.targetDate)) throw new Error('Elija el día de emisión.');
  if (finalScript.length < 10) throw new Error('El texto del anuncio es muy corto.');

  const today = localDateKey(new Date(), settings.utc_offset_min);
  if (input.targetDate < today) throw new Error('Elija una fecha de hoy en adelante.');
  if (
    input.targetDate === today &&
    localMinutes(new Date(), settings.utc_offset_min) >= parseTimeToMinutes(settings.cutoff_time)
  ) {
    throw new Error(
      `Ya pasó la hora límite de hoy (${formatClock(settings.cutoff_time)}). Elija el día de mañana para su anuncio.`,
    );
  }

  return { ...input, clientName, clientPhone, rawIdea, finalScript };
}

export async function createOrder(input: CreateOrderInput, settings: Settings, userId: string): Promise<Order> {
  const clean = validateOrderInput(input, settings);
  if (isBlocked(settings, clean.clientPhone)) {
    throw new Error('No pudimos recibir este pedido. Comuníquese con la encargada para ayudarle.');
  }

  const { data, error } = await db()
    .database.from('orders')
    .insert([
      {
        user_id: userId,
        client_name: clean.clientName,
        client_phone: clean.clientPhone,
        category: clean.category,
        is_urgent: clean.isUrgent,
        raw_idea: clean.rawIdea,
        final_script: clean.finalScript,
        voice_profile: clean.voice,
        total_emissions: clean.totalEmissions,
        amount_due: clean.totalEmissions,
        target_date: clean.targetDate,
        status: 'PENDING_PAYMENT',
      },
    ])
    .select('*')
    .single();

  if (error || !data) throw new Error(`No pudimos crear el pedido. ${describeDbError(error)}`);
  return data as Order;
}

export async function getOrderById(id: string): Promise<Order | null> {
  const { data, error } = await db().database.from('orders').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(describeDbError(error));
  return (data as Order | null) ?? null;
}

export async function getOrderByCode(code: string): Promise<Order | null> {
  const { data, error } = await db()
    .database.from('orders')
    .select('*')
    .eq('order_code', code.trim().toUpperCase())
    .maybeSingle();
  if (error) throw new Error(describeDbError(error));
  return (data as Order | null) ?? null;
}

export async function getOrderForClient(code: string, phone: string): Promise<Order | null> {
  const order = await getOrderByCode(code);
  if (!order) return null;
  if (normalizePhone(order.client_phone) !== normalizePhone(phone)) return null;
  return order;
}

export async function getOrderSlots(orderId: string): Promise<ScheduleSlot[]> {
  const { data, error } = await db()
    .database.from('schedule_slots')
    .select('*')
    .eq('order_id', orderId)
    .order('slot_time', { ascending: true });
  if (error) throw new Error(describeDbError(error));
  return (data ?? []) as ScheduleSlot[];
}

export async function getOrdersForUser(userId: string): Promise<Order[]> {
  const { data, error } = await db()
    .database.from('orders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw new Error(describeDbError(error));
  return (data ?? []) as Order[];
}

export interface ReviewItem extends Order {
  payment: Payment | null;
}

export async function getReviewQueue(): Promise<ReviewItem[]> {
  const { data, error } = await db()
    .database.from('orders')
    .select('*, payments(*)')
    .eq('status', 'UNDER_REVIEW')
    .order('is_urgent', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) throw new Error(describeDbError(error));

  return ((data ?? []) as Array<Order & { payments: Payment[] }>).map((row) => {
    const { payments, ...order } = row;
    const payment = [...(payments ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
    return { ...order, payment };
  });
}

export async function getReviewItem(orderId: string): Promise<ReviewItem | null> {
  const order = await getOrderById(orderId);
  if (!order) return null;
  return { ...order, payment: await latestPayment(order.id) };
}

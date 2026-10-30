import { db, describeDbError, storage } from '../insforge';
import { localDateKey, normalizePhone } from '../time';
import type { ExtractedReceipt, Order, Payment, Settings, ValidationFlags } from '../types';
import { extractReceipt } from './ai';

const RECENT_DAYS = 3;

export function normalizeConcept(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function parseReceiptDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const latam = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(value);
  if (latam) {
    return `${latam[3]}-${latam[2]!.padStart(2, '0')}-${latam[1]!.padStart(2, '0')}`;
  }
  return null;
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.abs(Date.UTC(ay!, am! - 1, ad!) - Date.UTC(by!, bm! - 1, bd!)) / 86_400_000;
}

export async function validateReceipt(
  order: Order,
  extracted: ExtractedReceipt | null,
  settings: Settings,
  reference: string | null,
): Promise<{ flags: ValidationFlags; referenceNumber: string | null }> {
  const today = localDateKey(new Date(), settings.utc_offset_min);
  const flags: ValidationFlags = {
    amount_matches: null,
    code_matches: null,
    date_is_recent: null,
    account_matches: null,
    reference_unused: null,
  };

  if (extracted) {
    if (typeof extracted.monto === 'number' && Number.isFinite(extracted.monto)) {
      flags.amount_matches = Math.abs(extracted.monto - Number(order.amount_due)) <= 0.01;
    }

    if (extracted.concepto) {
      flags.code_matches = normalizeConcept(extracted.concepto).includes(normalizeConcept(order.order_code));
    }

    const receiptDate = parseReceiptDate(extracted.fecha);
    if (receiptDate) flags.date_is_recent = daysBetween(receiptDate, today) <= RECENT_DAYS;

    const destination = normalizePhone(extracted.cuenta_destino ?? '');
    const expected = normalizePhone(settings.bank_account);
    if (destination.length >= 4 && expected.length >= 4) {
      flags.account_matches = destination.endsWith(expected.slice(-4)) || expected.endsWith(destination.slice(-4));
    }
  }

  let referenceNumber = reference?.trim() || null;
  if (referenceNumber) {
    flags.reference_value = referenceNumber;
    const { data, error } = await db()
      .database.from('payments')
      .select('id')
      .eq('reference_number', referenceNumber)
      .limit(1);
    if (error) {
      flags.reference_unused = null;
    } else {
      flags.reference_unused = (data ?? []).length === 0;
      if (!flags.reference_unused) referenceNumber = null;
    }
  }

  flags.manual_review = Object.entries(flags).some(
    ([key, value]) => key !== 'manual_review' && key !== 'reference_value' && value !== true,
  );

  return { flags, referenceNumber };
}

export function validationRows(flags: ValidationFlags): Array<{
  label: string;
  state: 'ok' | 'warn';
  icon: string;
}> {
  const rows: Array<{
    value: boolean | null | undefined;
    ok: string;
    bad: string;
    unknown: string;
  }> = [
    {
      value: flags.amount_matches,
      ok: 'El monto coincide',
      bad: 'El monto no coincide',
      unknown: 'No se pudo leer el monto',
    },
    {
      value: flags.reference_unused,
      ok: 'Comprobante no usado antes',
      bad: 'Este comprobante ya se usó antes',
      unknown: 'No se pudo leer el n.º de comprobante',
    },
    {
      value: flags.account_matches,
      ok: 'Cuenta de destino correcta',
      bad: 'La cuenta de destino no coincide',
      unknown: 'No se pudo leer la cuenta de destino',
    },
    {
      value: flags.code_matches,
      ok: 'Escribió el código en el concepto',
      bad: 'No escribió el código en el concepto',
      unknown: 'No se pudo leer el concepto',
    },
    {
      value: flags.date_is_recent,
      ok: 'Fecha del comprobante reciente',
      bad: 'El comprobante tiene una fecha antigua',
      unknown: 'No se pudo leer la fecha',
    },
  ];

  return rows.map((row) => ({
    label: row.value === true ? row.ok : row.value === false ? row.bad : row.unknown,
    state: row.value === true ? 'ok' : 'warn',
    icon: row.value === true ? 'check-circle' : 'warning',
  }));
}

export async function latestPayment(orderId: string): Promise<Payment | null> {
  const { data, error } = await db()
    .database.from('payments')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(describeDbError(error));
  return (data as Payment | null) ?? null;
}

function safeExtension(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
  return ext && ext.length <= 5 ? ext : 'jpg';
}

export async function attachReceipt(
  order: Order,
  file: File,
  settings: Settings,
  manualReference: string | null = null,
): Promise<Payment> {
  if (order.status !== 'PENDING_PAYMENT' && order.status !== 'UNDER_REVIEW') {
    throw new Error('Este pedido ya no recibe comprobantes.');
  }
  if (file.size === 0) throw new Error('El archivo está vacío.');
  if (file.size > 8 * 1024 * 1024) throw new Error('La foto es muy grande. Intente con una foto más liviana (máx. 8 MB).');

  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!file.type.startsWith('image/') && !isPdf) {
    throw new Error('Suba una foto o un PDF del comprobante.');
  }

  const key = `${order.order_code}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${safeExtension(file.name)}`;
  const uploaded = await storage('receipts').upload(key, file);
  if (uploaded.error) throw new Error(`No pudimos guardar la foto. ${describeDbError(uploaded.error)}`);

  let extracted: ExtractedReceipt | null = null;
  if (!isPdf) {
    try {
      extracted = await extractReceipt(file);
    } catch (error) {
      console.warn('[receipt] Lectura automática falló:', error instanceof Error ? error.message : error);
    }
  }

  const reference = extracted?.numero_comprobante ?? manualReference?.trim() ?? null;
  const { flags, referenceNumber } = await validateReceipt(order, extracted, settings, reference);

  const inserted = await db()
    .database.from('payments')
    .insert([
      {
        order_id: order.id,
        receipt_image_url: uploaded.data?.url ?? key,
        receipt_key: key,
        reference_number: referenceNumber,
        extracted_data: extracted ?? {},
        validation_flags: flags,
      },
    ])
    .select('*')
    .single();

  if (inserted.error || !inserted.data) {
    await storage('receipts').remove(key);
    throw new Error(`No pudimos registrar el comprobante. ${describeDbError(inserted.error)}`);
  }

  const updated = await db()
    .database.from('orders')
    .update({ status: 'UNDER_REVIEW', photo_requested_at: null })
    .eq('id', order.id)
    .in('status', ['PENDING_PAYMENT', 'UNDER_REVIEW'])
    .select('id');

  if (updated.error || !updated.data || updated.data.length === 0) {
    await db().database.from('payments').delete().eq('id', (inserted.data as Payment).id);
    await storage('receipts').remove(key);
    throw new Error('El pedido cambió de estado. Vuelva a consultarlo y suba el comprobante de nuevo.');
  }

  return inserted.data as Payment;
}

export async function signedUrl(
  bucket: 'receipts' | 'audios',
  key: string | null | undefined,
  expiresIn = 3600,
): Promise<string | null> {
  if (!key) return null;
  const { data, error } = await storage(bucket).createSignedUrl(key, expiresIn);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function signedUrls(
  bucket: 'receipts' | 'audios',
  keys: string[],
  expiresIn = 3600,
): Promise<Map<string, string>> {
  const unique = [...new Set(keys.filter(Boolean))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const { data, error } = await storage(bucket).createSignedUrls(unique, expiresIn);
  if (error || !data) return map;
  for (const entry of data) {
    if (entry.signedUrl) map.set(entry.path, entry.signedUrl);
  }
  return map;
}

export async function uploadAudio(orderId: string, buffer: Buffer): Promise<string> {
  const key = `orders/${orderId}.mp3`;
  const uploaded = await storage('audios').upload(key, new Blob([new Uint8Array(buffer)], { type: 'audio/mpeg' }));
  if (uploaded.error) throw new Error(`No pudimos guardar el audio. ${describeDbError(uploaded.error)}`);
  return key;
}

export async function reconcilePayment(paymentId: string): Promise<void> {
  const { error } = await db()
    .database.from('payments')
    .update({ reconciled_at: new Date().toISOString() })
    .eq('id', paymentId);
  if (error) throw new Error(describeDbError(error));
}

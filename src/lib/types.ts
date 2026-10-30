export const CATEGORIES = ['FUNERAL', 'MASS', 'PRAYER', 'GREETING', 'PROMO', 'OTHER'] as const;
export type Category = (typeof CATEGORIES)[number];

export const VOICES = ['SOLEMN', 'CHEERFUL', 'NEUTRAL'] as const;
export type Voice = (typeof VOICES)[number];

export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'UNDER_REVIEW',
  'APPROVED',
  'SCHEDULED',
  'COMPLETED',
  'REJECTED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const SLOT_STATUSES = ['QUEUED', 'DOWNLOADED_LOCALLY', 'PLAYED', 'FAILED', 'SKIPPED'] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

export const CATEGORY_META: Record<
  Category,
  { label: string; short: string; icon: string; voice: Voice; help: string; closing: string }
> = {
  FUNERAL: {
    label: 'Sepelio',
    short: 'Sepelio',
    icon: 'flower-lotus',
    voice: 'SOLEMN',
    help: 'Invitación a velorio o entierro',
    closing: 'La familia agradece su compañía y sus oraciones.',
  },
  MASS: {
    label: 'Misa',
    short: 'Misa',
    icon: 'church',
    voice: 'SOLEMN',
    help: 'Misa de difuntos, aniversario…',
    closing: 'Quedan todos cordialmente invitados.',
  },
  PRAYER: {
    label: 'Rezo',
    short: 'Rezo',
    icon: 'hands-praying',
    voice: 'SOLEMN',
    help: 'Novenas y rezos',
    closing: 'Agradecemos su compañía y sus oraciones.',
  },
  GREETING: {
    label: 'Saludo',
    short: 'Saludo',
    icon: 'cake',
    voice: 'CHEERFUL',
    help: 'Cumpleaños y felicitaciones',
    closing: '¡Muchas felicidades!',
  },
  PROMO: {
    label: 'Promoción',
    short: 'Promoción',
    icon: 'storefront',
    voice: 'NEUTRAL',
    help: 'Negocios y ventas',
    closing: '',
  },
  OTHER: {
    label: 'Otro aviso',
    short: 'Otro aviso',
    icon: 'megaphone-simple',
    voice: 'NEUTRAL',
    help: 'Cualquier otro anuncio',
    closing: '',
  },
};

export const VOICE_META: Record<Voice, { label: string; icon: string; hint: string }> = {
  SOLEMN: { label: 'Solemne', icon: 'moon-stars', hint: 'Voz pausada, serena y empática.' },
  CHEERFUL: { label: 'Alegre', icon: 'sun', hint: 'Voz cálida y animada.' },
  NEUTRAL: { label: 'Neutral', icon: 'chat-circle', hint: 'Tono claro para avisos generales.' },
};

export const STATUS_META: Record<OrderStatus, { label: string; pill: string; icon: string }> = {
  PENDING_PAYMENT: { label: 'Esperando pago', pill: 'gold', icon: 'hourglass-simple' },
  UNDER_REVIEW: { label: 'En revisión', pill: 'gold', icon: 'magnifying-glass' },
  APPROVED: { label: 'Aprobado', pill: 'ok', icon: 'check-circle' },
  SCHEDULED: { label: 'Programado', pill: 'ok', icon: 'calendar-check' },
  COMPLETED: { label: 'Emitido', pill: 'ok', icon: 'speaker-high' },
  REJECTED: { label: 'Rechazado', pill: 'danger', icon: 'prohibit' },
};

export const SLOT_STATUS_META: Record<SlotStatus, { label: string; icon: string }> = {
  QUEUED: { label: 'En cola', icon: 'clock' },
  DOWNLOADED_LOCALLY: { label: 'Descargado', icon: 'download-simple' },
  PLAYED: { label: 'Emitida', icon: 'check-circle' },
  FAILED: { label: 'Falló', icon: 'warning' },
  SKIPPED: { label: 'Omitida', icon: 'minus-circle' },
};

export interface Order {
  id: string;
  user_id: string | null;
  order_code: string;
  client_name: string;
  client_phone: string;
  category: Category;
  is_urgent: boolean;
  raw_idea: string;
  final_script: string | null;
  voice_profile: Voice;
  total_emissions: number;
  remaining_emissions: number;
  amount_due: number;
  target_date: string;
  status: OrderStatus;
  audio_url: string | null;
  audio_duration_sec: number | null;
  photo_requested_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  order_id: string;
  receipt_image_url: string | null;
  receipt_key: string | null;
  reference_number: string | null;
  extracted_data: ExtractedReceipt;
  validation_flags: ValidationFlags;
  reconciled_at: string | null;
  created_at: string;
}

export interface ExtractedReceipt {
  monto?: number | null;
  fecha?: string | null;
  hora?: string | null;
  banco?: string | null;
  numero_comprobante?: string | null;
  cuenta_destino?: string | null;
  concepto?: string | null;
}

export interface ValidationFlags {
  amount_matches?: boolean | null;
  code_matches?: boolean | null;
  date_is_recent?: boolean | null;
  account_matches?: boolean | null;
  reference_unused?: boolean | null;
  reference_value?: string | null;
  manual_review?: boolean;
}

export interface ScheduleSlot {
  id: string;
  slot_time: string;
  order_id: string;
  status: SlotStatus;
  duration_sec: number;
  played_at: string | null;
  created_at: string;
}

export interface Settings {
  id: number;
  is_paused: boolean;
  open_time: string;
  close_time: string;
  cutoff_time: string;
  slot_interval_min: number;
  min_repeat_gap_min: number;
  max_slot_seconds: number;
  max_emissions: number;
  utc_offset_min: number;
  bank_name: string;
  bank_account: string;
  bank_holder: string;
  help_phone: string;
  blocked_phones: string[];
  updated_at: string;
}

export interface EmissionLog {
  id: string;
  order_id: string;
  slot_id: string | null;
  played_at: string;
  amount: number;
  device: string | null;
  created_at: string;
}

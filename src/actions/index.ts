import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { db, describeDbError } from '../lib/insforge';
import { getProfile } from '../lib/profiles';
import { rateLimit } from '../lib/rate-limit';
import { addBlockedPhone, getSettings, updateSettings } from '../lib/settings';
import { createSession, sessionCookie } from '../lib/session';
import { estimateSeconds, normalizePhone } from '../lib/time';
import type { Settings } from '../lib/types';
import { CATEGORIES, VOICES } from '../lib/types';
import { authClient } from '../lib/insforge';
import { draftScript } from '../lib/services/ai';
import {
  createOrder as insertOrder,
  getOrderById,
  getOrderForClient,
  getOrderSlots,
} from '../lib/services/orders';
import { latestPayment } from '../lib/services/payments';
import { previewSchedule, scheduleOrder } from '../lib/services/scheduler';
import { MAX_AD_SECONDS, synthesize } from '../lib/services/tts';
import { signedUrl, uploadAudio } from '../lib/services/payments';

function fail(message: string, code: 'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' = 'BAD_REQUEST'): never {
  throw new ActionError({ code, message });
}

function requireAdmin(locals: App.Locals): string {
  if (!locals.adminEmail) fail('Su sesión expiró. Vuelva a entrar.', 'UNAUTHORIZED');
  return locals.adminEmail;
}

function maybeLimit(clientAddress: string | undefined, scope: string, limit: number): void {
  if (!rateLimit(`${scope}:${clientAddress ?? 'local'}`, limit, 60 * 60 * 1000)) {
    fail('Recibimos muchos intentos seguidos. Espere unos minutos y vuelva a intentar.');
  }
}

const checkbox = z
  .string()
  .optional()
  .transform((value) => value === 'on' || value === 'true' || value === '1');

const timeString = z
  .string()
  .regex(/^\d{2}:\d{2}$/, 'Use el formato HH:MM.');

export const server = {
  draftScript: defineAction({
    input: z.object({
      rawIdea: z.string().min(10, 'Cuéntenos un poco más de su anuncio.').max(1200),
      category: z.enum(CATEGORIES),
      clientName: z.string().max(80).optional().default(''),
      targetDate: z.string().optional().default(''),
    }),
    handler: async (input, context) => {
      maybeLimit(context.clientAddress, 'draft-script', 30);
      const draft = await draftScript(input.rawIdea, input.category, input.clientName, input.targetDate);
      return {
        script: draft.script,
        voice: draft.voice,
        ai: draft.ai,
        seconds: estimateSeconds(draft.script),
      };
    },
  }),

  previewSchedule: defineAction({
    input: z.object({
      targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      quantity: z.number().int().min(1).max(12),
      durationSec: z.number().int().min(5).max(120),
      urgent: z.boolean().optional().default(false),
    }),
    handler: async (input) => {
      const settings = await getSettings();
      const plan = await previewSchedule(
        input.targetDate,
        input.quantity,
        input.durationSec,
        input.urgent,
        settings,
      );
      return {
        times: plan.placements.map((p) => ({ date: p.date, time: p.time })),
        spillover: plan.spillover,
        days: plan.days,
        warning: plan.warning,
        closeTime: settings.close_time.slice(0, 5),
        cutoffTime: settings.cutoff_time.slice(0, 5),
        interval: settings.slot_interval_min,
      };
    },
  }),

  createOrder: defineAction({
    input: z.object({
      clientName: z.string().min(2).max(80),
      clientPhone: z.string().min(7).max(24),
      category: z.enum(CATEGORIES),
      rawIdea: z.string().min(10).max(1200),
      finalScript: z.string().min(10).max(1800),
      voice: z.enum(VOICES),
      totalEmissions: z.number().int().min(1).max(12),
      targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      isUrgent: z.boolean().optional().default(false),
      website: z.string().max(0).optional(), // honeypot
    }),
    handler: async (input, context) => {
      maybeLimit(context.clientAddress, 'create-order', 8);
      if (input.website) fail('No pudimos recibir el pedido.');
      const userId = context.locals.userId;
      if (!userId) fail('Inicie sesión para pedir un anuncio.', 'UNAUTHORIZED');

      const settings = await getSettings();
      const duration = Math.min(110, Math.max(5, estimateSeconds(input.finalScript)));
      const plan = await previewSchedule(
        input.targetDate,
        input.totalEmissions,
        duration,
        input.isUrgent,
        settings,
      );
      if (plan.warning === 'NO_SPACE' || plan.placements.length < input.totalEmissions) {
        fail('No hay suficientes tandas libres para esas repeticiones en esa fecha. Elija otro día o menos repeticiones.');
      }

      const order = await insertOrder(input, settings, userId);
      return {
        ok: true,
        orderCode: order.order_code,
        amount: Number(order.amount_due),
        bankName: settings.bank_name,
        bankAccount: settings.bank_account,
        bankHolder: settings.bank_holder,
        helpPhone: settings.help_phone,
        maxEmissions: settings.max_emissions,
        spillover: plan.spillover,
        days: plan.days,
      };
    },
  }),

  trackOrder: defineAction({
    accept: 'form',
    input: z.object({
      code: z.string().min(4).max(12),
      phone: z.string().min(6).max(24),
    }),
    handler: async (input, context) => {
      maybeLimit(context.clientAddress, 'track-order', 30);
      const order = await getOrderForClient(input.code, input.phone);
      if (!order) return { found: false as const };
      const slots = await getOrderSlots(order.id);
      const payment = await latestPayment(order.id);
      return {
        found: true as const,
        order,
        slots: slots.map((slot) => ({
          id: slot.id,
          slot_time: slot.slot_time,
          status: slot.status,
        })),
        hasReceipt: Boolean(payment),
        photoRequested: Boolean(order.photo_requested_at),
      };
    },
  }),

  login: defineAction({
    accept: 'form',
    input: z.object({
      email: z.email('Escriba un correo válido.'),
      password: z.string().min(1, 'Escriba su contraseña.'),
    }),
    handler: async (input, context) => {
      maybeLimit(context.clientAddress, 'login', 20);
      const email = input.email.trim().toLowerCase();

      const { data, error } = await authClient().auth.signInWithPassword({
        email,
        password: input.password,
      });
      if (error || !data?.user) fail('Correo o contraseña incorrectos.', 'UNAUTHORIZED');

      const profile = await getProfile(data.user.id);
      if (!profile) fail('Su cuenta no tiene perfil. Comuníquese con la encargada.', 'FORBIDDEN');

      context.cookies.set(
        sessionCookie.name,
        createSession(data.user.id, data.user.email ?? email),
        sessionCookie.options,
      );
      return { ok: true, isAdmin: profile.role === 'ADMIN' };
    },
  }),

  clientRegister: defineAction({
    accept: 'form',
    input: z.object({
      name: z.string().min(2, 'Escriba su nombre.').max(80),
      email: z.email('Escriba un correo válido.'),
      phone: z.string().min(7, 'Escriba su teléfono.').max(24),
      password: z.string().min(8, 'Use al menos 8 caracteres.').max(72),
      confirmPassword: z.string(),
    }),
    handler: async (input, context) => {
      maybeLimit(context.clientAddress, 'client-register', 6);
      const name = input.name.trim();
      const email = input.email.trim().toLowerCase();
      const phone = input.phone.trim();
      if (normalizePhone(phone).length < 7) fail('Escriba un teléfono válido.');
      if (input.password !== input.confirmPassword) fail('Las dos contraseñas no coinciden.');

      const { data, error } = await authClient().auth.signUp({
        email,
        password: input.password,
        name,
      });

      if (error) {
        if (/already|exists|registered/i.test(error.message)) {
          fail('Ese correo ya tiene una cuenta. Inicie sesión.');
        }
        console.error('[register]', error);
        fail('No pudimos crear la cuenta. Intente de nuevo.');
      }
      if (!data?.user?.id) fail('No pudimos crear la cuenta. Intente de nuevo.');
      if (data.requireEmailVerification) {
        fail('La cuenta se creó, pero debe verificar su correo antes de entrar.');
      }

      const updated = await db()
        .database.from('profiles')
        .update({ display_name: name, phone })
        .eq('user_id', data.user.id)
        .select('user_id');

      if (updated.error) {
        console.error('[register] profile', updated.error);
        fail('La cuenta se creó, pero no pudimos guardar sus datos. Comuníquese con la encargada.');
      }
      if (!updated.data || updated.data.length === 0) {
        const inserted = await db()
          .database.from('profiles')
          .insert([{ user_id: data.user.id, display_name: name, phone, role: 'CLIENT' }]);
        if (inserted.error) {
          console.error('[register] profile insert', inserted.error);
          fail('La cuenta se creó, pero no pudimos guardar sus datos. Comuníquese con la encargada.');
        }
      }

      context.cookies.set(
        sessionCookie.name,
        createSession(data.user.id, data.user.email ?? email),
        sessionCookie.options,
      );
      return { ok: true };
    },
  }),

  adminSetPause: defineAction({
    input: z.object({ paused: z.boolean() }),
    handler: async (input, context) => {
      requireAdmin(context.locals);
      const settings = await updateSettings({ is_paused: input.paused });
      return { ok: true, isPaused: settings.is_paused };
    },
  }),

  adminApprove: defineAction({
    accept: 'form',
    input: z.object({
      orderId: z.uuid(),
      script: z.string().min(10, 'Escriba el texto del anuncio.').max(1800),
      voice: z.enum(VOICES),
    }),
    handler: async (input, context) => {
      requireAdmin(context.locals);
      const order = await getOrderById(input.orderId);
      if (!order) fail('Pedido no encontrado.', 'NOT_FOUND');
      if (order.status !== 'UNDER_REVIEW') fail('Este pedido ya fue procesado.');

      const script = input.script.trim();
      const estimate = estimateSeconds(script);
      if (estimate > MAX_AD_SECONDS) {
        fail(`El texto dura unos ${estimate} segundos. Acórtelo a ${MAX_AD_SECONDS} segundos o menos.`);
      }

      const settings = await getSettings();
      let audio;
      try {
        audio = await synthesize(script, input.voice);
      } catch (error) {
        console.error('[approve] TTS falló:', error);
        fail('No pudimos generar el audio en este momento. Intente de nuevo en unos segundos.');
      }
      if (audio.durationSec > MAX_AD_SECONDS) {
        fail(`El audio dura ${audio.durationSec} segundos. Acorte el texto un poco e intente de nuevo.`);
      }

      const audioKey = await uploadAudio(order.id, audio.buffer);
      const saved = await db()
        .database.from('orders')
        .update({
          final_script: script,
          voice_profile: input.voice,
          audio_url: audioKey,
          audio_duration_sec: audio.durationSec,
        })
        .eq('id', order.id);
      if (saved.error) fail(`No pudimos guardar el texto. ${describeDbError(saved.error)}`);

      const outcome = await scheduleOrder(order.id, audio.durationSec, settings);
      return {
        ok: true,
        code: order.order_code,
        spillover: outcome.spillover,
        duration: audio.durationSec,
      };
    },
  }),

  adminRequestPhoto: defineAction({
    accept: 'form',
    input: z.object({ orderId: z.uuid() }),
    handler: async (input, context) => {
      requireAdmin(context.locals);
      const { error } = await db()
        .database.from('orders')
        .update({ photo_requested_at: new Date().toISOString() })
        .eq('id', input.orderId)
        .eq('status', 'UNDER_REVIEW');
      if (error) fail(`No pudimos registrar la solicitud. ${describeDbError(error)}`);
      return { ok: true };
    },
  }),

  adminReject: defineAction({
    accept: 'form',
    input: z.object({
      orderId: z.uuid(),
      blockPhone: checkbox.default(false),
    }),
    handler: async (input, context) => {
      requireAdmin(context.locals);
      const order = await getOrderById(input.orderId);
      if (!order) fail('Pedido no encontrado.', 'NOT_FOUND');
      if (order.status !== 'UNDER_REVIEW') {
        fail('Este pedido ya fue programado o procesado; no se puede rechazar desde aquí.');
      }

      const cleaned = await db().database.from('schedule_slots').delete().eq('order_id', order.id);
      if (cleaned.error) fail(`No pudimos limpiar las tandas. ${describeDbError(cleaned.error)}`);

      const { error } = await db()
        .database.from('orders')
        .update({ status: 'REJECTED' })
        .eq('id', order.id)
        .eq('status', 'UNDER_REVIEW');
      if (error) fail(`No pudimos rechazar el pedido. ${describeDbError(error)}`);
      if (input.blockPhone) await addBlockedPhone(order.client_phone);
      return { ok: true, code: order.order_code };
    },
  }),

  adminPreviewAudio: defineAction({
    input: z.object({
      orderId: z.uuid(),
      script: z.string().min(10).max(1800),
      voice: z.enum(VOICES),
    }),
    handler: async (input, context) => {
      requireAdmin(context.locals);
      const estimate = estimateSeconds(input.script);
      if (estimate > MAX_AD_SECONDS) {
        fail(`El texto dura unos ${estimate} segundos. Acórtelo a ${MAX_AD_SECONDS} segundos o menos.`);
      }
      let audio;
      try {
        audio = await synthesize(input.script, input.voice);
      } catch {
        fail('No pudimos generar el audio. Intente de nuevo.');
      }
      const key = `previews/${input.orderId}.mp3`;
      const uploaded = await db().storage.from('audios').upload(
        key,
        new Blob([new Uint8Array(audio.buffer)], { type: 'audio/mpeg' }),
      );
      if (uploaded.error) fail('No pudimos preparar la escucha.');
      const url = await signedUrl('audios', key, 600);
      if (!url) fail('No pudimos preparar la escucha.');
      return { url, duration: audio.durationSec };
    },
  }),

  adminReconcile: defineAction({
    accept: 'form',
    input: z.object({
      paymentId: z.uuid(),
      reconciled: checkbox.default(false),
    }),
    handler: async (input, context) => {
      requireAdmin(context.locals);
      const { error } = await db()
        .database.from('payments')
        .update({ reconciled_at: input.reconciled ? new Date().toISOString() : null })
        .eq('id', input.paymentId);
      if (error) fail(`No pudimos guardar la conciliación. ${describeDbError(error)}`);
      return { ok: true, reconciled: input.reconciled };
    },
  }),

  adminSaveSettings: defineAction({
    accept: 'form',
    input: z.object({
      openTime: timeString,
      closeTime: timeString,
      cutoffTime: timeString,
      slotInterval: z.coerce.number().int().min(15).max(120),
      minGap: z.coerce.number().int().min(0).max(240),
      bankName: z.string().min(2).max(80),
      bankAccount: z.string().min(4).max(40),
      bankHolder: z.string().min(2).max(80),
      helpPhone: z.string().min(6).max(24),
      blockedPhones: z.preprocess(
        (value) => (value === null || value === undefined ? '' : value),
        z.string().max(4000),
      ),
    }),
    handler: async (input, context) => {
      requireAdmin(context.locals);
      if (input.openTime >= input.closeTime) fail('La hora de apertura debe ser menor que la de cierre.');
      if (input.cutoffTime < input.openTime || input.cutoffTime > input.closeTime) {
        fail('La hora límite debe estar dentro del horario de atención.');
      }

      const phones = input.blockedPhones
        .split(/[\n,;]+/)
        .map((p) => p.replace(/\D/g, ''))
        .filter(Boolean);

      const patch: Partial<Settings> = {
        open_time: input.openTime,
        close_time: input.closeTime,
        cutoff_time: input.cutoffTime,
        slot_interval_min: input.slotInterval,
        min_repeat_gap_min: input.minGap,
        bank_name: input.bankName.trim(),
        bank_account: input.bankAccount.trim(),
        bank_holder: input.bankHolder.trim(),
        help_phone: input.helpPhone.trim(),
        blocked_phones: [...new Set(phones)],
      };
      const updated = await updateSettings(patch);
      return { ok: true, paused: updated.is_paused };
    },
  }),
};

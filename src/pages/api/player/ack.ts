import type { APIRoute } from 'astro';
import { db, describeDbError } from '../../../lib/insforge';
import { isPlayerRequest, unauthorized } from '../../../lib/player-auth';

export const prerender = false;

const EVENTS = ['downloaded', 'played', 'failed'] as const;
type PlayerEvent = (typeof EVENTS)[number];

export const POST: APIRoute = async ({ request }) => {
  if (!isPlayerRequest(request)) return unauthorized();

  try {
    const body = (await request.json()) as {
      slotId?: string;
      event?: PlayerEvent;
      device?: string;
    };

    if (!body.slotId || !body.event || !EVENTS.includes(body.event)) {
      return new Response(JSON.stringify({ ok: false, error: 'Datos incompletos.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let result: unknown = null;
    if (body.event === 'downloaded') {
      const rpc = await db().database.rpc('mark_slot_downloaded', { p_slot_id: body.slotId });
      if (rpc.error) throw new Error(describeDbError(rpc.error));
      result = rpc.data;
    } else if (body.event === 'played') {
      const rpc = await db().database.rpc('record_emission', {
        p_slot_id: body.slotId,
        p_device: body.device ?? 'gruta-pc',
      });
      if (rpc.error) throw new Error(describeDbError(rpc.error));
      result = rpc.data;
    } else {
      const rpc = await db().database.rpc('mark_slot_failed', { p_slot_id: body.slotId });
      if (rpc.error) throw new Error(describeDbError(rpc.error));
      result = rpc.data;
    }

    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error del servidor.';
    const status = /SLOT_NOT_FOUND/.test(message) ? 404 : 500;
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

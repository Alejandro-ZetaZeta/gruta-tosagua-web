import type { APIRoute } from 'astro';
import { db, describeDbError } from '../../../lib/insforge';
import { isPlayerRequest, unauthorized } from '../../../lib/player-auth';
import { getSettings } from '../../../lib/settings';
import { isBlank } from '../../../lib/time';
import type { Category, SlotStatus } from '../../../lib/types';

export const prerender = false;

type QueueRow = {
  id: string;
  slot_time: string;
  status: SlotStatus;
  duration_sec: number;
  orders:
    | {
        order_code: string;
        category: Category;
        audio_url: string | null;
        status: string;
      }
    | null;
};

export const GET: APIRoute = async ({ request }) => {
  if (!isPlayerRequest(request)) return unauthorized();

  try {
    const settings = await getSettings();
    const now = Date.now();
    const from = new Date(now - 10 * 60_000).toISOString();
    const to = new Date(now + 26 * 60 * 60_000).toISOString();

    const { data, error } = await db()
      .database.from('schedule_slots')
      .select('id, slot_time, status, duration_sec, orders!inner(order_code, category, audio_url, status)')
      .gte('slot_time', from)
      .lte('slot_time', to)
      .in('status', ['QUEUED', 'DOWNLOADED_LOCALLY', 'FAILED'])
      .order('slot_time', { ascending: true })
      .limit(200);

    if (error) throw new Error(describeDbError(error));

    const rows = ((data ?? []) as unknown as QueueRow[]).filter(
      (row) => row.orders && row.orders.status === 'SCHEDULED' && !isBlank(row.orders.audio_url),
    );

    const keys = rows.map((row) => row.orders!.audio_url!).filter(Boolean);
    const signed = new Map<string, string>();
    if (keys.length > 0) {
      const urls = await db().storage.from('audios').createSignedUrls(keys, 3600);
      for (const entry of urls.data ?? []) {
        if (entry.signedUrl) signed.set(entry.path, entry.signedUrl);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        serverTime: new Date().toISOString(),
        paused: settings.is_paused,
        utcOffsetMinutes: settings.utc_offset_min,
        maxSlotSeconds: settings.max_slot_seconds,
        slots: rows.map((row) => ({
          id: row.id,
          slotTime: row.slot_time,
          status: row.status,
          durationSec: row.duration_sec,
          orderCode: row.orders?.order_code ?? null,
          category: row.orders?.category ?? null,
          audioUrl: signed.get(row.orders!.audio_url!) ?? null,
        })),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Error del servidor.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};

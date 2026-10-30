import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join, resolve } from 'node:path';
import {
  dueSlots,
  enqueueAck,
  markAckSent,
  markDownloaded,
  markFailed,
  markPlayed,
  nextSlotTime,
  openDb,
  pendingAcks,
  pendingDownloads,
  prune,
  scheduleRetry,
  staleSlots,
  upsertSlot,
} from './db.ts';

const API_URL = (process.env.PLAYER_API_URL ?? 'http://localhost:4321').replace(/\/+$/, '');
const TOKEN = process.env.PLAYER_TOKEN ?? '';
const AUDIO_DIR = resolve(process.env.AUDIO_DIR ?? './audios_cache');
const DB_PATH = resolve(process.env.DB_PATH ?? './data/player.db');
const POLL_MS = Math.max(30, Number(process.env.POLL_SECONDS ?? 120)) * 1000;
const PLAY_CMD = process.env.PLAY_CMD ?? 'ffplay -nodisp -autoexit -loglevel quiet {file}';
const DRY_RUN = process.env.DRY_RUN === '1';
const GRACE_MIN = 75;
const DEVICE = hostname() || 'gruta-pc';

if (!TOKEN) {
  console.error('Falta PLAYER_TOKEN. Copie .env.example a .env y complete el token.');
  process.exit(1);
}

mkdirSync(AUDIO_DIR, { recursive: true });

const db = openDb(DB_PATH);
let paused = false;
let playing = false;
let polling = false;
let polls = 0;

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

interface QueueSlot {
  id: string;
  slotTime: string;
  status: string;
  durationSec: number;
  orderCode: string | null;
  audioUrl: string | null;
}

interface QueueResponse {
  ok: boolean;
  paused: boolean;
  slots: QueueSlot[];
}

async function fetchQueue(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    const response = await fetch(`${API_URL}/api/player/queue`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`El servidor respondió ${response.status}`);
    const data = (await response.json()) as QueueResponse;
    if (!data.ok) throw new Error('El servidor no devolvió la cola.');

    for (const slot of data.slots) {
      upsertSlot(db, slot);
    }

    if (paused !== data.paused) {
      paused = data.paused;
      log(paused ? 'Emisiones en pausa: no se reproducirá nada.' : 'Emisiones activas.');
    }

    polls += 1;
    if (polls % 10 === 1) log(`Cola revisada: ${data.slots.length} tandas en las próximas 26 horas.`);
  } catch (error) {
    log(`Sin conexión con el servidor: ${error instanceof Error ? error.message : error}. Se sigue con los audios guardados.`);
  } finally {
    polling = false;
  }
}

function audioPath(slotId: string): string {
  return join(AUDIO_DIR, `${slotId}.mp3`);
}

async function downloadMissing(): Promise<void> {
  for (const slot of pendingDownloads(db)) {
    const file = audioPath(slot.id);
    if (existsSync(file) && statSync(file).size > 1000) {
      markDownloaded(db, slot.id);
      enqueueAck(db, slot.id, 'downloaded');
      continue;
    }
    if (!slot.audio_url) continue;

    try {
      const response = await fetch(slot.audio_url, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`Descarga ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 1000) throw new Error('El audio llegó vacío.');
      const temp = `${file}.part`;
      writeFileSync(temp, buffer);
      renameSync(temp, file);
      markDownloaded(db, slot.id);
      enqueueAck(db, slot.id, 'downloaded');
      log(`Descargado ${slot.order_code ?? slot.id} (${slot.duration_sec} s).`);
    } catch (error) {
      log(`No se pudo descargar ${slot.order_code ?? slot.id}: ${error instanceof Error ? error.message : error}`);
    }
  }
}

async function flushAcks(): Promise<void> {
  for (const ack of pendingAcks(db)) {
    try {
      const response = await fetch(`${API_URL}/api/player/ack`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ slotId: ack.slot_id, event: ack.event, device: DEVICE }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        if ([400, 404, 409, 422].includes(response.status)) {
          log(`ACK descartado (${ack.event}) por respuesta ${response.status}.`);
          markAckSent(db, ack.id);
          continue;
        }
        throw new Error(`ACK ${response.status}`);
      }
      markAckSent(db, ack.id);
    } catch (error) {
      log(`ACK pendiente (${ack.event}): ${error instanceof Error ? error.message : error}`);
      return;
    }
  }
}

function playFile(file: string, durationSec: number): Promise<void> {
  if (DRY_RUN) {
    log('DRY_RUN: simulando reproducción.');
    return new Promise((resolve) => setTimeout(resolve, durationSec * 1000));
  }
  if (!PLAY_CMD.trim()) return Promise.reject(new Error('PLAY_CMD está vacío.'));

  return new Promise((resolve, reject) => {
    const [command, ...baseArgs] = PLAY_CMD.trim().split(/\s+/);
    if (!command) {
      reject(new Error('PLAY_CMD no tiene comando.'));
      return;
    }
    const args = baseArgs.map((arg) => arg.replaceAll('{file}', file));
    if (!baseArgs.some((arg) => arg.includes('{file}'))) args.push(file);

    const child = spawn(command, args, { stdio: 'inherit' });
    const timer = setTimeout(
      () => {
        child.kill('SIGKILL');
        reject(new Error('La reproducción tardó demasiado.'));
      },
      (durationSec + 60) * 1000,
    );

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`El reproductor terminó con código ${code}.`));
    });
  });
}

async function playDue(): Promise<void> {
  if (playing || paused) return;

  const now = new Date();
  const nowIso = now.toISOString();
  const cutoff = new Date(now.getTime() - GRACE_MIN * 60_000).toISOString();

  for (const stale of staleSlots(db, cutoff)) {
    markFailed(db, stale.id, 'La tanda quedó vencida sin reproducirse.');
    enqueueAck(db, stale.id, 'failed');
    log(`Tanda vencida ${stale.order_code ?? stale.id}: no se reproduce y no se descuenta saldo.`);
  }

  const due = dueSlots(db, nowIso, cutoff)[0];
  if (!due) return;

  const file = audioPath(due.id);
  if (!existsSync(file)) {
    log(`Falta el audio de ${due.order_code ?? due.id}; se intentará descargar.`);
    return;
  }

  playing = true;
  log(`Emitiendo ${due.order_code ?? due.id} (${due.duration_sec} s).`);
  try {
    await playFile(file, due.duration_sec);
    markPlayed(db, due.id);
    enqueueAck(db, due.id, 'played');
    log(`Emitido ${due.order_code ?? due.id}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const attempts = due.attempts + 1;
    if (attempts >= 2) {
      markFailed(db, due.id, message);
      enqueueAck(db, due.id, 'failed');
      log(`Falló dos veces ${due.order_code ?? due.id}: ${message}. No se descuenta saldo.`);
    } else {
      const next = nextSlotTime(db, nowIso);
      const retryAt = next ?? new Date(now.getTime() + 30 * 60_000).toISOString();
      scheduleRetry(db, due.id, retryAt, message);
      log(`Falló ${due.order_code ?? due.id}: ${message}. Se reintentará en la próxima tanda.`);
    }
  } finally {
    playing = false;
  }
}

async function tick(): Promise<void> {
  await flushAcks();
  await downloadMissing();
  await playDue();
}

async function pollCycle(): Promise<void> {
  await fetchQueue();
  await tick();
}

prune(db);
log(`Reproductor de La Gruta iniciado. Servidor: ${API_URL}`);
log(`Audios en ${AUDIO_DIR}. Base local: ${DB_PATH}.`);
log(`Consulta cada ${POLL_MS / 1000} s. Comando de audio: ${DRY_RUN ? 'DRY_RUN' : PLAY_CMD}`);

await pollCycle();
setInterval(() => void pollCycle(), POLL_MS);
setInterval(() => void tick(), 5000);
setInterval(() => prune(db), 60 * 60 * 1000);

function shutdown(signal: string): void {
  log(`Cerrando (${signal})…`);
  db.close();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => {
  log(`Error no controlado: ${error instanceof Error ? error.message : String(error)}`);
});

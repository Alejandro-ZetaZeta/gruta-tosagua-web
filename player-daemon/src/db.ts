import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type LocalStatus = 'PENDING' | 'DOWNLOADED' | 'PLAYED' | 'FAILED';

export interface LocalSlot {
  id: string;
  slot_time: string;
  duration_sec: number;
  order_code: string | null;
  audio_url: string | null;
  status: LocalStatus;
  attempts: number;
  retry_at: string | null;
  last_error: string | null;
}

export function openDb(path: string): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    create table if not exists slots (
      id text primary key,
      slot_time text not null,
      duration_sec integer not null,
      order_code text,
      audio_url text,
      status text not null default 'PENDING',
      attempts integer not null default 0,
      retry_at text,
      last_error text
    );
    create table if not exists acks (
      id integer primary key autoincrement,
      slot_id text not null,
      event text not null,
      created_at text not null,
      sent integer not null default 0
    );
    create unique index if not exists acks_unique on acks (slot_id, event);
    create index if not exists slots_due on slots (status, slot_time);
  `);
  return db;
}

export function upsertSlot(db: DatabaseSync, slot: {
  id: string;
  slotTime: string;
  durationSec: number;
  orderCode: string | null;
  audioUrl: string | null;
  status: string;
}): void {
  db.prepare(`
    insert into slots (id, slot_time, duration_sec, order_code, audio_url, status)
    values (?, ?, ?, ?, ?, ?)
    on conflict(id) do update set
      slot_time = excluded.slot_time,
      duration_sec = excluded.duration_sec,
      order_code = excluded.order_code,
      audio_url = excluded.audio_url,
      status = case
        when slots.status in ('PLAYED', 'FAILED', 'DOWNLOADED') then slots.status
        when excluded.status = 'FAILED' then 'FAILED'
        else 'PENDING'
      end
  `).run(
    slot.id,
    slot.slotTime,
    slot.durationSec,
    slot.orderCode,
    slot.audioUrl,
    slot.status === 'FAILED' ? 'FAILED' : 'PENDING',
  );
}

export function pendingDownloads(db: DatabaseSync): LocalSlot[] {
  return db
    .prepare("select * from slots where status in ('PENDING', 'DOWNLOADED') order by slot_time asc")
    .all() as unknown as LocalSlot[];
}

export function markDownloaded(db: DatabaseSync, id: string): void {
  db.prepare("update slots set status = 'DOWNLOADED' where id = ? and status = 'PENDING'").run(id);
}

export function markPlayed(db: DatabaseSync, id: string): void {
  db.prepare("update slots set status = 'PLAYED', last_error = null where id = ?").run(id);
}

export function markFailed(db: DatabaseSync, id: string, error: string): void {
  db.prepare("update slots set status = 'FAILED', last_error = ? where id = ?").run(error, id);
}

export function scheduleRetry(db: DatabaseSync, id: string, retryAt: string, error: string): void {
  db.prepare("update slots set attempts = attempts + 1, retry_at = ?, last_error = ? where id = ?").run(
    retryAt,
    error,
    id,
  );
}

export function dueSlots(db: DatabaseSync, nowIso: string, notOlderThan: string): LocalSlot[] {
  return db
    .prepare(`
      select * from slots
      where status in ('PENDING', 'DOWNLOADED')
        and slot_time <= ?
        and slot_time >= ?
        and (retry_at is null or retry_at <= ?)
      order by slot_time asc
    `)
    .all(nowIso, notOlderThan, nowIso) as unknown as LocalSlot[];
}

export function staleSlots(db: DatabaseSync, olderThan: string): LocalSlot[] {
  return db
    .prepare("select * from slots where status in ('PENDING', 'DOWNLOADED') and slot_time < ?")
    .all(olderThan) as unknown as LocalSlot[];
}

export function nextSlotTime(db: DatabaseSync, afterIso: string): string | null {
  const row = db
    .prepare('select slot_time from slots where slot_time > ? order by slot_time asc limit 1')
    .get(afterIso) as { slot_time?: string } | undefined;
  return row?.slot_time ?? null;
}

export function enqueueAck(db: DatabaseSync, slotId: string, event: string): void {
  db.prepare('insert or ignore into acks (slot_id, event, created_at) values (?, ?, ?)').run(
    slotId,
    event,
    new Date().toISOString(),
  );
}

export function pendingAcks(db: DatabaseSync, limit = 20): Array<{ id: number; slot_id: string; event: string }> {
  return db
    .prepare('select id, slot_id, event from acks where sent = 0 order by id asc limit ?')
    .all(limit) as unknown as Array<{ id: number; slot_id: string; event: string }>;
}

export function markAckSent(db: DatabaseSync, id: number): void {
  db.prepare('update acks set sent = 1 where id = ?').run(id);
}

export function prune(db: DatabaseSync): void {
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
  db.prepare("delete from slots where status = 'PLAYED' and slot_time < ?").run(cutoff);
  db.prepare('delete from acks where sent = 1 and created_at < ?').run(cutoff);
}

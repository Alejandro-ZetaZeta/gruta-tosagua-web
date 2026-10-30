-- La Gruta · esquema inicial
-- Acceso: solo desde el servidor con la API key de administración.
-- RLS activo y sin políticas públicas: anon/authenticated no ven nada.

create type public.order_category as enum ('FUNERAL', 'MASS', 'PRAYER', 'GREETING', 'PROMO', 'OTHER');
create type public.voice_profile as enum ('SOLEMN', 'CHEERFUL', 'NEUTRAL');
create type public.order_status as enum ('PENDING_PAYMENT', 'UNDER_REVIEW', 'APPROVED', 'SCHEDULED', 'COMPLETED', 'REJECTED');
create type public.slot_status as enum ('QUEUED', 'DOWNLOADED_LOCALLY', 'PLAYED', 'FAILED', 'SKIPPED');

-- Código corto y fácil de escribir en el concepto bancario.
create sequence public.order_code_seq start with 1000;

create function public.generate_order_code() returns text
language sql volatile
as $$
  select 'GRU-' || lpad(nextval('public.order_code_seq')::text, 4, '0');
$$;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique default public.generate_order_code(),
  client_name text not null,
  client_phone text not null,
  category public.order_category not null,
  is_urgent boolean not null default false,
  raw_idea text not null,
  final_script text,
  voice_profile public.voice_profile not null default 'NEUTRAL',
  total_emissions integer not null check (total_emissions between 1 and 12),
  remaining_emissions integer not null default 0 check (remaining_emissions >= 0),
  amount_due numeric(6, 2) not null check (amount_due = total_emissions * 1.00),
  target_date date not null,
  status public.order_status not null default 'PENDING_PAYMENT',
  audio_url text,
  audio_duration_sec integer check (audio_duration_sec is null or audio_duration_sec between 1 and 120),
  photo_requested_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.orders.remaining_emissions is 'Se fija al programar y baja solo cuando el reproductor confirma la emisión.';

create index orders_review_idx on public.orders (status, is_urgent desc, created_at);
create index orders_target_date_idx on public.orders (target_date);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  receipt_image_url text,
  receipt_key text,
  reference_number text,
  extracted_data jsonb not null default '{}'::jsonb,
  validation_flags jsonb not null default '{}'::jsonb,
  reconciled_at timestamptz,
  created_at timestamptz not null default now()
);

-- Un comprobante no puede reutilizarse. Los no legibles quedan en NULL y se revisan a mano.
create unique index payments_reference_number_key on public.payments (reference_number)
  where reference_number is not null;
create index payments_order_idx on public.payments (order_id, created_at desc);

create table public.schedule_slots (
  id uuid primary key default gen_random_uuid(),
  slot_time timestamptz not null,
  order_id uuid not null references public.orders (id) on delete cascade,
  status public.slot_status not null default 'QUEUED',
  duration_sec integer not null check (duration_sec between 1 and 120),
  played_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, slot_time)
);

create index schedule_slots_time_idx on public.schedule_slots (slot_time);
create index schedule_slots_status_idx on public.schedule_slots (status, slot_time);

create table public.emissions_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  slot_id uuid unique references public.schedule_slots (id) on delete set null,
  played_at timestamptz not null default now(),
  amount numeric(6, 2) not null default 1.00,
  device text,
  created_at timestamptz not null default now()
);

create index emissions_log_played_at_idx on public.emissions_log (played_at);

create table public.system_settings (
  id smallint primary key default 1 check (id = 1),
  is_paused boolean not null default false,
  open_time time not null default '07:00',
  close_time time not null default '18:30',
  cutoff_time time not null default '16:30',
  slot_interval_min integer not null default 30 check (slot_interval_min between 10 and 180),
  min_repeat_gap_min integer not null default 45 check (min_repeat_gap_min between 0 and 240),
  max_slot_seconds integer not null default 120 check (max_slot_seconds between 30 and 120),
  max_emissions integer not null default 12 check (max_emissions between 1 and 12),
  utc_offset_min integer not null default -300,
  bank_name text not null default 'Banco Pichincha',
  bank_account text not null default '2201 4455 66',
  bank_holder text not null default 'Parroquia La Gruta',
  help_phone text not null default '099 000 0000',
  blocked_phones text[] not null default '{}',
  updated_at timestamptz not null default now()
);

insert into public.system_settings (id) values (1) on conflict (id) do nothing;

create trigger orders_updated_at before update on public.orders
  for each row execute function system.update_updated_at();
create trigger system_settings_updated_at before update on public.system_settings
  for each row execute function system.update_updated_at();

-- El límite de 120 s por tanda también se protege en la base, no solo en el planificador.
create function public.enforce_slot_capacity() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  used integer;
  cap integer;
begin
  select max_slot_seconds into cap from public.system_settings where id = 1;
  select coalesce(sum(duration_sec), 0) into used
    from public.schedule_slots
    where slot_time = new.slot_time and id <> new.id;

  if used + new.duration_sec > cap then
    raise exception 'SLOT_CAPACITY_EXCEEDED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger schedule_slots_capacity before insert or update of slot_time, duration_sec
  on public.schedule_slots for each row execute function public.enforce_slot_capacity();

-- ACK atómico del reproductor: marca la tanda, registra la emisión y descuenta el saldo.
create function public.record_emission(p_slot_id uuid, p_device text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  s public.schedule_slots;
  o public.orders;
begin
  select * into s from public.schedule_slots where id = p_slot_id for update;
  if not found then
    raise exception 'SLOT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if s.status = 'PLAYED' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  update public.schedule_slots
    set status = 'PLAYED', played_at = now()
    where id = s.id;

  insert into public.emissions_log (order_id, slot_id, played_at, device)
    values (s.order_id, s.id, now(), p_device)
    on conflict (slot_id) do nothing;

  update public.orders
    set remaining_emissions = greatest(remaining_emissions - 1, 0),
        status = case when remaining_emissions - 1 <= 0 then 'COMPLETED'::public.order_status else status end,
        updated_at = now()
    where id = s.order_id
    returning * into o;

  return jsonb_build_object('ok', true, 'remaining', o.remaining_emissions, 'status', o.status);
end;
$$;

create function public.mark_slot_downloaded(p_slot_id uuid)
returns void
language sql security definer set search_path = public
as $$
  update public.schedule_slots
    set status = 'DOWNLOADED_LOCALLY'
    where id = p_slot_id and status = 'QUEUED';
$$;

create function public.mark_slot_failed(p_slot_id uuid)
returns void
language sql security definer set search_path = public
as $$
  update public.schedule_slots
    set status = 'FAILED'
    where id = p_slot_id and status <> 'PLAYED';
$$;

alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.schedule_slots enable row level security;
alter table public.emissions_log enable row level security;
alter table public.system_settings enable row level security;

revoke all on public.orders, public.payments, public.schedule_slots, public.emissions_log, public.system_settings
  from anon, authenticated;
revoke all on sequence public.order_code_seq from anon, authenticated;
revoke execute on function public.record_emission(uuid, text) from anon, authenticated;
revoke execute on function public.mark_slot_downloaded(uuid) from anon, authenticated;
revoke execute on function public.mark_slot_failed(uuid) from anon, authenticated;

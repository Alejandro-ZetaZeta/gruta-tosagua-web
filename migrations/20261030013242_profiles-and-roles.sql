-- Perfiles y roles. Todo usuario nuevo queda como CLIENT; solo ADMIN entra al panel.
create type public.user_role as enum ('ADMIN', 'CLIENT');

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role public.user_role not null default 'CLIENT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function system.update_updated_at();

-- Cada cuenta nueva nace como CLIENT, nunca como ADMIN.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
    values (new.id, coalesce(new.profile->>'name', new.email))
    on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Cuentas que ya existían (por ejemplo, creadas a mano en InsForge).
insert into public.profiles (user_id, display_name)
  select id, coalesce(profile->>'name', email) from auth.users
  on conflict (user_id) do nothing;

-- Cambio de rol para los scripts de administración. Solo el servidor lo llama.
create function public.set_user_role_by_email(p_email text, p_role public.user_role)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_id is null then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.profiles (user_id, role)
    values (v_id, p_role)
    on conflict (user_id) do update set role = excluded.role;

  return v_id;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_user_role_by_email(text, public.user_role) from public, anon, authenticated;

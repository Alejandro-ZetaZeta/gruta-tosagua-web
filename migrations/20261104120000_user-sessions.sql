-- Sesiones del servidor. La cookie solo lleva un token aleatorio; la fila se revoca al cerrar sesión.
create table public.user_sessions (
  token_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index user_sessions_user_idx on public.user_sessions (user_id);
create index user_sessions_expires_idx on public.user_sessions (expires_at);

alter table public.user_sessions enable row level security;
revoke all on public.user_sessions from anon, authenticated;

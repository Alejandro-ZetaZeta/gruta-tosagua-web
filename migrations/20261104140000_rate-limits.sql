-- Límites de intentos persistentes (sobreviven reinicios y varias instancias).
create table public.rate_limits (
  key text primary key,
  count integer not null check (count > 0),
  reset_at timestamptz not null
);

create index rate_limits_reset_idx on public.rate_limits (reset_at);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Devuelve true si el intento cabe en la ventana; false si ya se agotó.
create function public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits (key, count, reset_at)
    values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update
    set count = case
          when public.rate_limits.reset_at <= now() then 1
          else public.rate_limits.count + 1
        end,
        reset_at = case
          when public.rate_limits.reset_at <= now() then now() + make_interval(secs => p_window_seconds)
          else public.rate_limits.reset_at
        end
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke execute on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;

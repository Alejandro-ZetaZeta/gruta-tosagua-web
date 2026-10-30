-- Datos básicos del cliente y vínculo de sus pedidos.
alter table public.profiles add column phone text;
alter table public.orders add column user_id uuid references auth.users (id) on delete set null;

create index orders_user_idx on public.orders (user_id, created_at desc);

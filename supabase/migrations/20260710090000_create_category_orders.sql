create table if not exists public.category_orders (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  direction text not null check (direction in ('expense', 'income')),
  categories text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, direction)
);

create index if not exists category_orders_user_direction_idx
  on public.category_orders (user_id, direction);

alter table public.category_orders enable row level security;

grant select, insert, update, delete on table public.category_orders to authenticated;

drop policy if exists "Users can read own category orders" on public.category_orders;
create policy "Users can read own category orders"
  on public.category_orders
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can insert own category orders" on public.category_orders;
create policy "Users can insert own category orders"
  on public.category_orders
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update own category orders" on public.category_orders;
create policy "Users can update own category orders"
  on public.category_orders
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own category orders" on public.category_orders;
create policy "Users can delete own category orders"
  on public.category_orders
  for delete
  to authenticated
  using (user_id = auth.uid());

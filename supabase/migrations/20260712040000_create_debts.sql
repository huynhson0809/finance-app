-- Debt tracking: who owes whom, payment history

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  direction text not null check (direction in ('lent', 'borrowed')),
  person_name text not null check (char_length(trim(person_name)) > 0),
  total_amount integer not null check (total_amount > 0),
  currency text not null default 'VND' check (currency = 'VND'),
  note text not null default '',
  settled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists debts_user_idx
  on public.debts (user_id, settled, created_at desc);

alter table public.debts enable row level security;
grant select, insert, update, delete on table public.debts to authenticated;

create policy "Users can read own debts"
  on public.debts for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own debts"
  on public.debts for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own debts"
  on public.debts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Users can delete own debts"
  on public.debts for delete to authenticated
  using (user_id = auth.uid());

-- Payment records for each debt
create table if not exists public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  debt_id uuid not null references public.debts(id) on delete cascade,
  amount integer not null check (amount > 0),
  note text not null default '',
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists debt_payments_debt_idx
  on public.debt_payments (debt_id, paid_at desc);

alter table public.debt_payments enable row level security;
grant select, insert, update, delete on table public.debt_payments to authenticated;

create policy "Users can read own debt payments"
  on public.debt_payments for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own debt payments"
  on public.debt_payments for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.debts where id = debt_id and user_id = auth.uid())
  );

create policy "Users can update own debt payments"
  on public.debt_payments for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Users can delete own debt payments"
  on public.debt_payments for delete to authenticated
  using (user_id = auth.uid());

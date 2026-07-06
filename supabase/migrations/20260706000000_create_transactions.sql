create extension if not exists pgcrypto;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank text not null check (bank in ('MB', 'ACB')),
  type text not null check (type in ('transfer', 'card', 'balance_alert')),
  amount integer not null check (amount > 0),
  currency text not null default 'VND' check (currency = 'VND'),
  transaction_time timestamptz not null,
  content text not null,
  raw_source text not null default 'email' check (raw_source = 'email'),
  external_hash text not null,
  created_at timestamptz not null default now(),
  unique (user_id, external_hash)
);

create index if not exists transactions_user_time_idx
  on public.transactions (user_id, transaction_time desc);

alter table public.transactions enable row level security;

drop policy if exists "Users can read own transactions" on public.transactions;
create policy "Users can read own transactions"
  on public.transactions
  for select
  to authenticated
  using (user_id = auth.uid());

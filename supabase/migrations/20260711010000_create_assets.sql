create table if not exists public.asset_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('cash', 'bank', 'credit_card', 'savings', 'gold', 'foreign_currency')),
  name text not null check (length(trim(name)) > 0),
  currency text not null check (currency in ('VND', 'USD')),
  balance numeric not null default 0,
  quantity numeric,
  gold_unit text check (gold_unit is null or gold_unit in ('gram', 'chi', 'luong')),
  bank text,
  account_identifier text,
  card_identifier text,
  include_in_total boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asset_accounts_identifier_bank_check
    check (
      (account_identifier is null or bank is not null) and
      (card_identifier is null or bank is not null)
    )
);

create table if not exists public.asset_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null references public.asset_accounts(id) on delete cascade,
  counterparty_account_id uuid references public.asset_accounts(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  type text not null check (
    type in (
      'opening_balance',
      'manual_adjustment',
      'expense',
      'income',
      'transfer_in',
      'transfer_out',
      'card_refund',
      'card_payment',
      'bank_email_sync'
    )
  ),
  amount numeric not null,
  currency text not null check (currency in ('VND', 'USD')),
  balance_after numeric,
  note text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.asset_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  pair text not null check (pair in ('USD_VND', 'GOLD_GRAM_VND')),
  value numeric not null,
  source text not null check (source in ('auto', 'manual')),
  fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists asset_events_user_occurred_at_idx
  on public.asset_events (user_id, occurred_at desc);

create index if not exists asset_accounts_user_sort_created_idx
  on public.asset_accounts (user_id, sort_order, created_at);

create unique index if not exists asset_accounts_user_bank_account_identifier_idx
  on public.asset_accounts (user_id, bank, account_identifier)
  where account_identifier is not null;

create unique index if not exists asset_accounts_user_bank_card_identifier_idx
  on public.asset_accounts (user_id, bank, card_identifier)
  where card_identifier is not null;

alter table public.asset_accounts enable row level security;
alter table public.asset_events enable row level security;
alter table public.asset_rates enable row level security;

grant select, insert, update, delete on table public.asset_accounts to authenticated;
grant select, insert, update, delete on table public.asset_events to authenticated;
grant select, insert, update, delete on table public.asset_rates to authenticated;

drop policy if exists "Users can read own asset accounts" on public.asset_accounts;
create policy "Users can read own asset accounts"
  on public.asset_accounts
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can insert own asset accounts" on public.asset_accounts;
create policy "Users can insert own asset accounts"
  on public.asset_accounts
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update own asset accounts" on public.asset_accounts;
create policy "Users can update own asset accounts"
  on public.asset_accounts
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own asset accounts" on public.asset_accounts;
create policy "Users can delete own asset accounts"
  on public.asset_accounts
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can read own asset events" on public.asset_events;
create policy "Users can read own asset events"
  on public.asset_events
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can insert own asset events" on public.asset_events;
create policy "Users can insert own asset events"
  on public.asset_events
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.asset_accounts account_ref
      where account_ref.id = account_id
        and account_ref.user_id = auth.uid()
    )
    and (
      counterparty_account_id is null
      or exists (
        select 1
        from public.asset_accounts counterparty_ref
        where counterparty_ref.id = counterparty_account_id
          and counterparty_ref.user_id = auth.uid()
      )
    )
    and (
      transaction_id is null
      or exists (
        select 1
        from public.transactions transaction_ref
        where transaction_ref.id = transaction_id
          and transaction_ref.user_id = auth.uid()
      )
    )
  );

drop policy if exists "Users can update own asset events" on public.asset_events;
create policy "Users can update own asset events"
  on public.asset_events
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.asset_accounts account_ref
      where account_ref.id = account_id
        and account_ref.user_id = auth.uid()
    )
    and (
      counterparty_account_id is null
      or exists (
        select 1
        from public.asset_accounts counterparty_ref
        where counterparty_ref.id = counterparty_account_id
          and counterparty_ref.user_id = auth.uid()
      )
    )
    and (
      transaction_id is null
      or exists (
        select 1
        from public.transactions transaction_ref
        where transaction_ref.id = transaction_id
          and transaction_ref.user_id = auth.uid()
      )
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.asset_accounts account_ref
      where account_ref.id = account_id
        and account_ref.user_id = auth.uid()
    )
    and (
      counterparty_account_id is null
      or exists (
        select 1
        from public.asset_accounts counterparty_ref
        where counterparty_ref.id = counterparty_account_id
          and counterparty_ref.user_id = auth.uid()
      )
    )
    and (
      transaction_id is null
      or exists (
        select 1
        from public.transactions transaction_ref
        where transaction_ref.id = transaction_id
          and transaction_ref.user_id = auth.uid()
      )
    )
  );

drop policy if exists "Users can delete own asset events" on public.asset_events;
create policy "Users can delete own asset events"
  on public.asset_events
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can read asset rates" on public.asset_rates;
create policy "Users can read asset rates"
  on public.asset_rates
  for select
  to authenticated
  using (user_id = auth.uid() or user_id is null);

drop policy if exists "Users can insert own asset rates" on public.asset_rates;
create policy "Users can insert own asset rates"
  on public.asset_rates
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update own asset rates" on public.asset_rates;
create policy "Users can update own asset rates"
  on public.asset_rates
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own asset rates" on public.asset_rates;
create policy "Users can delete own asset rates"
  on public.asset_rates
  for delete
  to authenticated
  using (user_id = auth.uid());

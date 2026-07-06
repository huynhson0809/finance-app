alter table public.transactions
  alter column user_id set default auth.uid();

alter table public.transactions
  alter column bank drop not null;

alter table public.transactions
  drop constraint if exists transactions_bank_check;

alter table public.transactions
  add constraint transactions_bank_check
  check (bank is null or bank in ('MB', 'ACB'));

alter table public.transactions
  drop constraint if exists transactions_type_check;

alter table public.transactions
  add constraint transactions_type_check
  check (type in ('transfer', 'card', 'balance_alert', 'manual', 'receipt', 'bank_screenshot'));

alter table public.transactions
  drop constraint if exists transactions_raw_source_check;

alter table public.transactions
  add constraint transactions_raw_source_check
  check (raw_source in ('email', 'manual', 'receipt', 'bank-screenshot'));

alter table public.transactions
  add column if not exists merchant text,
  add column if not exists category text,
  add column if not exists note text,
  add column if not exists bank_hint text;

alter table public.transactions
  drop constraint if exists transactions_category_check;

alter table public.transactions
  add constraint transactions_category_check
  check (
    category is null or category in (
      'food-drinks',
      'coffee-bubble-tea',
      'transportation',
      'shopping',
      'bills-utilities',
      'healthcare',
      'entertainment',
      'transfers-debt',
      'others'
    )
  );

alter table public.transactions
  drop constraint if exists transactions_bank_hint_check;

alter table public.transactions
  add constraint transactions_bank_hint_check
  check (
    bank_hint is null or bank_hint in (
      'vietcombank',
      'techcombank',
      'momo',
      'zalopay',
      'mb',
      'acb'
    )
  );

drop policy if exists "Users can insert own transactions" on public.transactions;
create policy "Users can insert own transactions"
  on public.transactions
  for insert
  to authenticated
  with check (user_id = auth.uid());

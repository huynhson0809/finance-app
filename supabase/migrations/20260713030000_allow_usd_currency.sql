-- Allow USD currency in transactions and debts

alter table public.transactions
  drop constraint if exists transactions_currency_check;

alter table public.transactions
  add constraint transactions_currency_check
  check (currency in ('VND', 'USD'));

alter table public.debts
  drop constraint if exists debts_currency_check;

alter table public.debts
  add constraint debts_currency_check
  check (currency in ('VND', 'USD'));

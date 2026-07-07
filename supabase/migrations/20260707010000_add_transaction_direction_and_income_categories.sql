alter table public.transactions
  add column if not exists direction text not null default 'expense';

alter table public.transactions
  drop constraint if exists transactions_direction_check;

alter table public.transactions
  add constraint transactions_direction_check
  check (direction in ('expense', 'income'));

alter table public.transactions
  drop constraint if exists transactions_category_check;

alter table public.transactions
  add constraint transactions_category_check
  check (
    category is null or (
      direction = 'expense' and category in (
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
    ) or (
      direction = 'income' and category in (
        'salary',
        'allowance',
        'bonus',
        'side-income',
        'investment',
        'temporary-income'
      )
    )
  );

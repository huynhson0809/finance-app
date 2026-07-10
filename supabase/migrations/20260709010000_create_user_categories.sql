create table if not exists public.user_categories (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  direction text not null check (direction in ('expense', 'income')),
  name text not null check (length(trim(name)) > 0),
  icon_key text check (
    icon_key is null or icon_key in (
      'utensils',
      'coffee',
      'transportation',
      'shopping',
      'bills',
      'health',
      'entertainment',
      'transfer',
      'wallet',
      'piggy',
      'gift',
      'coins',
      'bank',
      'other'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (direction = 'expense' and id like 'custom-expense-%') or
    (direction = 'income' and id like 'custom-income-%')
  ),
  primary key (user_id, id)
);

create index if not exists user_categories_user_direction_idx
  on public.user_categories (user_id, direction, created_at);

alter table public.user_categories enable row level security;

grant select, insert, update, delete on table public.user_categories to authenticated;

drop policy if exists "Users can read own categories" on public.user_categories;
create policy "Users can read own categories"
  on public.user_categories
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can insert own categories" on public.user_categories;
create policy "Users can insert own categories"
  on public.user_categories
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update own categories" on public.user_categories;
create policy "Users can update own categories"
  on public.user_categories
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own categories" on public.user_categories;
create policy "Users can delete own categories"
  on public.user_categories
  for delete
  to authenticated
  using (user_id = auth.uid());

create table if not exists public.category_overrides (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null check (
    category in (
      'food-drinks',
      'coffee-bubble-tea',
      'transportation',
      'shopping',
      'bills-utilities',
      'healthcare',
      'entertainment',
      'transfers-debt',
      'others',
      'salary',
      'allowance',
      'bonus',
      'side-income',
      'investment',
      'temporary-income'
    )
  ),
  name text check (name is null or length(trim(name)) > 0),
  icon_key text check (
    icon_key is null or icon_key in (
      'utensils',
      'coffee',
      'transportation',
      'shopping',
      'bills',
      'health',
      'entertainment',
      'transfer',
      'wallet',
      'piggy',
      'gift',
      'coins',
      'bank',
      'other'
    )
  ),
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

alter table public.category_overrides enable row level security;

grant select, insert, update, delete on table public.category_overrides to authenticated;

drop policy if exists "Users can read own category overrides" on public.category_overrides;
create policy "Users can read own category overrides"
  on public.category_overrides
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can insert own category overrides" on public.category_overrides;
create policy "Users can insert own category overrides"
  on public.category_overrides
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update own category overrides" on public.category_overrides;
create policy "Users can update own category overrides"
  on public.category_overrides
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own category overrides" on public.category_overrides;
create policy "Users can delete own category overrides"
  on public.category_overrides
  for delete
  to authenticated
  using (user_id = auth.uid());

alter table public.transactions
  drop constraint if exists transactions_category_check;

alter table public.transactions
  add constraint transactions_category_check
  check (
    category is null or (
      direction = 'expense' and (
        category in (
          'food-drinks',
          'coffee-bubble-tea',
          'transportation',
          'shopping',
          'bills-utilities',
          'healthcare',
          'entertainment',
          'transfers-debt',
          'others'
        ) or category like 'custom-expense-%'
      )
    ) or (
      direction = 'income' and (
        category in (
          'salary',
          'allowance',
          'bonus',
          'side-income',
          'investment',
          'temporary-income'
        ) or category like 'custom-income-%'
      )
    )
  );

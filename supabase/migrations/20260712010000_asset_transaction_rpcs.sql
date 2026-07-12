-- Each RPC runs inside the caller's PostgreSQL transaction. Any exception rolls
-- back the transaction row, asset events, and every balance change together.

alter table public.transactions
  add column if not exists operation_id uuid;

create unique index if not exists transactions_user_operation_id_idx
  on public.transactions (user_id, operation_id)
  where operation_id is not null;

comment on column public.transactions.operation_id
  is 'Indexed copy of the transaction-save operation key; asset_transaction_operations is authoritative.';

-- Mutable effects are reversed and reapplied, so a historical balance snapshot
-- would become stale. The current account balance and signed event amounts are
-- authoritative for these events.
update public.asset_events
set balance_after = null
where balance_after is not null
  and (
    transaction_id is not null
    or type in ('transfer_in', 'transfer_out', 'card_payment')
  );

comment on column public.asset_events.balance_after
  is 'Optional immutable snapshot. Mutable transaction, transfer, and card-payment events leave this NULL; asset_accounts.balance and signed asset_events.amount are authoritative.';

create table if not exists public.asset_transaction_operations (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  operation_id uuid not null,
  transaction_id uuid unique references public.transactions(id) on delete set null,
  amount integer not null check (amount > 0),
  currency text not null check (currency = 'VND'),
  occurred_at timestamptz not null,
  direction text not null check (direction in ('expense', 'income')),
  category text not null,
  source text not null check (source in ('manual', 'receipt', 'bank-screenshot')),
  asset_account_id uuid,
  merchant text,
  note text,
  bank_hint text,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

comment on table public.asset_transaction_operations
  is 'Immutable user-scoped idempotency ledger for transaction saves. transaction_id becomes NULL after deletion so an operation UUID cannot recreate the transaction.';

insert into public.asset_transaction_operations (
  user_id,
  operation_id,
  transaction_id,
  amount,
  currency,
  occurred_at,
  direction,
  category,
  source,
  asset_account_id,
  merchant,
  note,
  bank_hint,
  created_at
)
select
  transaction_ref.user_id,
  transaction_ref.operation_id,
  transaction_ref.id,
  transaction_ref.amount,
  transaction_ref.currency,
  transaction_ref.transaction_time,
  transaction_ref.direction,
  transaction_ref.category,
  transaction_ref.raw_source,
  transaction_ref.asset_account_id,
  transaction_ref.merchant,
  transaction_ref.note,
  transaction_ref.bank_hint,
  transaction_ref.created_at
from public.transactions as transaction_ref
where transaction_ref.operation_id is not null
on conflict do nothing;

alter table public.asset_transaction_operations enable row level security;

revoke all privileges on table public.asset_transaction_operations
  from public, anon, authenticated;
grant select, insert on table public.asset_transaction_operations
  to authenticated;

drop policy if exists "Users can read own asset transaction operations"
  on public.asset_transaction_operations;
create policy "Users can read own asset transaction operations"
  on public.asset_transaction_operations
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can insert own asset transaction operations"
  on public.asset_transaction_operations;
create policy "Users can insert own asset transaction operations"
  on public.asset_transaction_operations
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and transaction_id is not null
    and exists (
      select 1
      from public.transactions as transaction_ref
      where transaction_ref.id = transaction_id
        and transaction_ref.user_id = auth.uid()
    )
  );

create table if not exists public.asset_transfer_operations (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  operation_id uuid not null,
  from_account_id uuid not null,
  to_account_id uuid not null,
  amount numeric not null check (
    amount > 0 and amount::text not in ('NaN', 'Infinity', '-Infinity')
  ),
  currency text not null check (currency in ('VND', 'USD')),
  occurred_at timestamptz not null,
  note text,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id),
  check (from_account_id <> to_account_id)
);

comment on table public.asset_transfer_operations
  is 'Immutable user-scoped idempotency ledger for save_asset_transfer. Account UUIDs intentionally remain after account deletion.';

alter table public.asset_transfer_operations enable row level security;

revoke all privileges on table public.asset_transfer_operations
  from public, anon, authenticated;
grant select, insert on table public.asset_transfer_operations
  to authenticated;

drop policy if exists "Users can read own asset transfer operations"
  on public.asset_transfer_operations;
create policy "Users can read own asset transfer operations"
  on public.asset_transfer_operations
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can insert own asset transfer operations"
  on public.asset_transfer_operations;
create policy "Users can insert own asset transfer operations"
  on public.asset_transfer_operations
  for insert
  to authenticated
  with check (user_id = auth.uid());

create or replace function public.save_transaction_with_asset_effect(
  p_amount integer,
  p_currency text,
  p_occurred_at timestamptz,
  p_direction text,
  p_category text,
  p_source text,
  p_operation_id uuid,
  p_asset_account_id uuid default null,
  p_merchant text default null,
  p_note text default null,
  p_bank_hint text default null
)
returns public.transactions
language plpgsql
security invoker
set search_path = public, pg_temp
set row_security = on
as $function$
declare
  v_user_id uuid := auth.uid();
  v_transaction public.transactions%rowtype;
  v_account public.asset_accounts%rowtype;
  v_operation public.asset_transaction_operations%rowtype;
  v_existing_event public.asset_events%rowtype;
  v_has_operation boolean := false;
  v_event_id uuid;
  v_delta numeric;
  v_event_type text;
  v_bank text;
  v_transaction_type text;
  v_content text;
  v_merchant text := nullif(btrim(p_merchant), '');
  v_note text := nullif(btrim(p_note), '');
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  if p_operation_id is null then
    raise exception using
      errcode = '22023',
      message = 'Operation id is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception using
      errcode = '22023',
      message = 'Amount must be greater than zero';
  end if;

  if p_currency is null or p_currency <> 'VND' then
    raise exception using
      errcode = '22023',
      message = 'Transaction currency must be VND';
  end if;

  if p_occurred_at is null then
    raise exception using
      errcode = '22023',
      message = 'Transaction time is required';
  end if;

  if p_direction = 'expense' then
    if p_category is null or not (
      p_category in (
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
      or p_category like 'custom-expense-%'
    ) then
      raise exception using
        errcode = '22023',
        message = 'Category does not belong to expense transactions';
    end if;
  elsif p_direction = 'income' then
    if p_category is null or not (
      p_category in (
        'salary',
        'allowance',
        'bonus',
        'side-income',
        'investment',
        'temporary-income'
      )
      or p_category like 'custom-income-%'
    ) then
      raise exception using
        errcode = '22023',
        message = 'Category does not belong to income transactions';
    end if;
  else
    raise exception using
      errcode = '22023',
      message = 'Direction must be expense or income';
  end if;

  if p_source is null or p_source not in ('manual', 'receipt', 'bank-screenshot') then
    raise exception using
      errcode = '22023',
      message = 'Source must be manual, receipt, or bank-screenshot';
  end if;

  if p_bank_hint is not null and p_bank_hint not in (
    'vietcombank',
    'techcombank',
    'momo',
    'zalopay',
    'mb',
    'acb'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid bank hint';
  end if;

  v_bank := case p_bank_hint
    when 'mb' then 'MB'
    when 'acb' then 'ACB'
    else null
  end;
  v_transaction_type := case p_source
    when 'bank-screenshot' then 'bank_screenshot'
    else p_source
  end;
  v_content := coalesce(v_merchant, v_note, p_category);

  -- Serialize this user's operation key before consulting the immutable ledger.
  -- Hash collisions only serialize unrelated operations; they cannot mix data.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_user_id::text || ':' || p_operation_id::text,
      0
    )
  );

  select operation_ref.*
    into v_operation
  from public.asset_transaction_operations as operation_ref
  where operation_ref.user_id = v_user_id
    and operation_ref.operation_id = p_operation_id;
  v_has_operation := found;

  if v_has_operation then
    if v_operation.amount is distinct from p_amount
       or v_operation.currency is distinct from p_currency
       or v_operation.occurred_at is distinct from p_occurred_at
       or v_operation.direction is distinct from p_direction
       or v_operation.category is distinct from p_category
       or v_operation.source is distinct from p_source
       or v_operation.asset_account_id is distinct from p_asset_account_id
       or v_operation.merchant is distinct from v_merchant
       or v_operation.note is distinct from v_note
       or v_operation.bank_hint is distinct from p_bank_hint then
      raise exception using
        errcode = '22023',
        message = 'Operation id was already used with a different transaction payload';
    end if;

    if v_operation.transaction_id is null then
      raise exception using
        errcode = '55000',
        message = 'Transaction save operation was already completed and deleted; replay is not allowed';
    end if;
  end if;

  if p_asset_account_id is not null then
    select account_ref.*
      into v_account
    from public.asset_accounts as account_ref
    where account_ref.id = p_asset_account_id
      and account_ref.user_id = v_user_id
    for update;

    if not found then
      raise exception using
        errcode = '42501',
        message = 'Asset account not found or not owned by the authenticated user';
    end if;

    if v_account.kind not in ('cash', 'bank', 'credit_card', 'savings') then
      raise exception using
        errcode = '22023',
        message = 'This asset account kind cannot be linked to a transaction';
    end if;

    if v_account.currency <> p_currency then
      raise exception using
        errcode = '22023',
        message = 'Asset account currency does not match transaction currency';
    end if;

    -- Signed transaction delta convention:
    --   regular expense -amount; regular income +amount;
    --   credit-card expense +amount (more debt); card refund -amount.
    if v_account.kind = 'credit_card' then
      if p_direction = 'expense' then
        v_delta := p_amount;
        v_event_type := 'expense';
      else
        v_delta := -p_amount;
        v_event_type := 'card_refund';
      end if;
    elsif p_direction = 'expense' then
      v_delta := -p_amount;
      v_event_type := 'expense';
    else
      v_delta := p_amount;
      v_event_type := 'income';
    end if;
  end if;

  if not v_has_operation then
    insert into public.transactions (
      user_id,
      bank,
      type,
      amount,
      currency,
      transaction_time,
      content,
      direction,
      raw_source,
      merchant,
      category,
      note,
      bank_hint,
      asset_account_id,
      counterparty_asset_account_id,
      asset_event_id,
      operation_id,
      external_hash
    )
    values (
      v_user_id,
      v_bank,
      v_transaction_type,
      p_amount,
      p_currency,
      p_occurred_at,
      v_content,
      p_direction,
      p_source,
      v_merchant,
      p_category,
      v_note,
      p_bank_hint,
      p_asset_account_id,
      null,
      null,
      p_operation_id,
      p_source || ':' || p_operation_id::text
    )
    on conflict (user_id, operation_id)
      where operation_id is not null
      do nothing
    returning * into v_transaction;

    if not found then
      raise exception 'Transaction operation exists without an authoritative ledger row';
    end if;
  end if;

  if v_has_operation then
    select transaction_ref.*
      into v_transaction
    from public.transactions as transaction_ref
    where transaction_ref.id = v_operation.transaction_id
      and transaction_ref.user_id = v_user_id
      and transaction_ref.operation_id = p_operation_id
    for update;

    if not found then
      raise exception 'Transaction operation ledger points to an invalid transaction';
    end if;

    if v_transaction.bank is distinct from v_bank
       or v_transaction.type is distinct from v_transaction_type
       or v_transaction.amount is distinct from p_amount
       or v_transaction.currency is distinct from p_currency
       or v_transaction.transaction_time is distinct from p_occurred_at
       or v_transaction.content is distinct from v_content
       or v_transaction.direction is distinct from p_direction
       or v_transaction.raw_source is distinct from p_source
       or v_transaction.merchant is distinct from v_merchant
       or v_transaction.category is distinct from p_category
       or v_transaction.note is distinct from v_note
       or v_transaction.bank_hint is distinct from p_bank_hint
       or v_transaction.asset_account_id is distinct from p_asset_account_id
       or v_transaction.counterparty_asset_account_id is not null then
      raise exception using
        errcode = '22023',
        message = 'Operation id was already used with a different transaction payload';
    end if;

    if p_asset_account_id is null then
      if v_transaction.asset_event_id is not null then
        raise exception 'Existing transaction operation has an unexpected asset event';
      end if;

      perform event_ref.id
      from public.asset_events as event_ref
      where event_ref.user_id = v_user_id
        and event_ref.transaction_id = v_transaction.id
      order by event_ref.id
      for update;

      if found then
        raise exception 'Existing transaction operation has an unlinked asset event';
      end if;

      return v_transaction;
    end if;

    if v_transaction.asset_event_id is null then
      raise exception 'Existing linked transaction operation is incomplete';
    end if;

    select event_ref.*
      into v_existing_event
    from public.asset_events as event_ref
    where event_ref.id = v_transaction.asset_event_id
      and event_ref.user_id = v_user_id
      and event_ref.transaction_id = v_transaction.id
      and event_ref.account_id = p_asset_account_id
      and event_ref.counterparty_account_id is null
    for update;

    if not found then
      raise exception 'Existing transaction operation has an invalid event association';
    end if;

    if v_existing_event.type is distinct from v_event_type
       or v_existing_event.amount is distinct from v_delta
       or v_existing_event.currency is distinct from p_currency
       or v_existing_event.balance_after is not null
       or v_existing_event.note is distinct from coalesce(v_note, v_merchant)
       or v_existing_event.occurred_at is distinct from p_occurred_at then
      raise exception 'Existing transaction operation has a mismatched asset event';
    end if;

    perform event_ref.id
    from public.asset_events as event_ref
    where event_ref.user_id = v_user_id
      and event_ref.transaction_id = v_transaction.id
      and event_ref.id <> v_existing_event.id
    order by event_ref.id
    for update;

    if found then
      raise exception 'Existing transaction operation has more than one asset event';
    end if;

    return v_transaction;
  end if;

  -- INSERT already owns a row lock; the explicit lock documents and enforces the
  -- same lock discipline used by update/delete before linking the event.
  select transaction_ref.*
    into v_transaction
  from public.transactions as transaction_ref
  where transaction_ref.id = v_transaction.id
    and transaction_ref.user_id = v_user_id
  for update;

  if not found then
    raise exception 'Inserted transaction could not be locked';
  end if;

  insert into public.asset_transaction_operations (
    user_id,
    operation_id,
    transaction_id,
    amount,
    currency,
    occurred_at,
    direction,
    category,
    source,
    asset_account_id,
    merchant,
    note,
    bank_hint
  )
  values (
    v_user_id,
    p_operation_id,
    v_transaction.id,
    p_amount,
    p_currency,
    p_occurred_at,
    p_direction,
    p_category,
    p_source,
    p_asset_account_id,
    v_merchant,
    v_note,
    p_bank_hint
  );

  if p_asset_account_id is not null then
    update public.asset_accounts as account_ref
    set balance = account_ref.balance + v_delta,
        updated_at = now()
    where account_ref.id = v_account.id
      and account_ref.user_id = v_user_id;

    if not found then
      raise exception 'Locked asset account disappeared during transaction save';
    end if;

    insert into public.asset_events (
      user_id,
      account_id,
      counterparty_account_id,
      transaction_id,
      type,
      amount,
      currency,
      balance_after,
      note,
      occurred_at
    )
    values (
      v_user_id,
      v_account.id,
      null,
      v_transaction.id,
      v_event_type,
      v_delta,
      p_currency,
      null,
      coalesce(v_note, v_merchant),
      p_occurred_at
    )
    returning id into v_event_id;

    update public.transactions as transaction_ref
    set asset_event_id = v_event_id
    where transaction_ref.id = v_transaction.id
      and transaction_ref.user_id = v_user_id
      and transaction_ref.asset_account_id = v_account.id
      and transaction_ref.counterparty_asset_account_id is null
    returning transaction_ref.* into v_transaction;

    if not found then
      raise exception 'Transaction/event/account association changed during save';
    end if;
  end if;

  return v_transaction;
end;
$function$;

comment on function public.save_transaction_with_asset_effect(
  integer,
  text,
  timestamptz,
  text,
  text,
  text,
  uuid,
  uuid,
  text,
  text,
  text
) is 'Idempotently and atomically saves a user transaction and optional asset effect. Current account balances and signed event amounts are authoritative; mutable events omit balance_after.';


create or replace function public.update_transaction_with_asset_effect(
  p_id uuid,
  p_amount integer,
  p_occurred_at timestamptz,
  p_content text,
  p_category text,
  p_asset_account_id uuid,
  p_keep_asset_account boolean default false,
  p_merchant text default null,
  p_note text default null
)
returns public.transactions
language plpgsql
security invoker
set search_path = public, pg_temp
set row_security = on
as $function$
declare
  v_user_id uuid := auth.uid();
  v_transaction public.transactions%rowtype;
  v_old_event public.asset_events%rowtype;
  v_old_account public.asset_accounts%rowtype;
  v_new_account public.asset_accounts%rowtype;
  v_event_id uuid;
  v_delta numeric;
  v_event_type text;
  v_target_asset_account_id uuid;
  v_merchant text := nullif(btrim(p_merchant), '');
  v_note text := nullif(btrim(p_note), '');
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  if p_id is null then
    raise exception using
      errcode = '22023',
      message = 'Transaction id is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception using
      errcode = '22023',
      message = 'Amount must be greater than zero';
  end if;

  if p_occurred_at is null then
    raise exception using
      errcode = '22023',
      message = 'Transaction time is required';
  end if;

  if p_content is null then
    raise exception using
      errcode = '22023',
      message = 'Transaction content is required';
  end if;

  select transaction_ref.*
    into v_transaction
  from public.transactions as transaction_ref
  where transaction_ref.id = p_id
    and transaction_ref.user_id = v_user_id
  for update;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Transaction not found or not owned by the authenticated user';
  end if;

  if v_transaction.currency <> 'VND' then
    raise exception using
      errcode = '22023',
      message = 'Transaction currency must be VND';
  end if;

  v_target_asset_account_id := case
    when p_keep_asset_account then v_transaction.asset_account_id
    else p_asset_account_id
  end;

  if v_transaction.direction = 'expense' then
    if p_category is null or not (
      p_category in (
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
      or p_category like 'custom-expense-%'
    ) then
      raise exception using
        errcode = '22023',
        message = 'Category does not belong to expense transactions';
    end if;
  elsif v_transaction.direction = 'income' then
    if p_category is null or not (
      p_category in (
        'salary',
        'allowance',
        'bonus',
        'side-income',
        'investment',
        'temporary-income'
      )
      or p_category like 'custom-income-%'
    ) then
      raise exception using
        errcode = '22023',
        message = 'Category does not belong to income transactions';
    end if;
  else
    raise exception 'Stored transaction has an invalid direction';
  end if;

  if (v_transaction.asset_account_id is null) <>
     (v_transaction.asset_event_id is null) then
    raise exception 'Transaction has an incomplete asset association';
  end if;

  if v_transaction.counterparty_asset_account_id is not null then
    raise exception 'Transaction has an unexpected counterparty asset association';
  end if;

  if v_transaction.asset_event_id is not null then
    select event_ref.*
      into v_old_event
    from public.asset_events as event_ref
    where event_ref.id = v_transaction.asset_event_id
      and event_ref.user_id = v_user_id
      and event_ref.transaction_id = v_transaction.id
      and event_ref.account_id = v_transaction.asset_account_id
      and event_ref.counterparty_account_id is null
    for update;

    if not found then
      raise exception 'Transaction/event/account association is invalid';
    end if;

    perform event_ref.id
    from public.asset_events as event_ref
    where event_ref.user_id = v_user_id
      and event_ref.transaction_id = v_transaction.id
      and event_ref.id <> v_old_event.id
    order by event_ref.id
    for update;

    if found then
      raise exception 'Transaction has more than one associated asset event';
    end if;
  else
    perform event_ref.id
    from public.asset_events as event_ref
    where event_ref.user_id = v_user_id
      and event_ref.transaction_id = v_transaction.id
    order by event_ref.id
    for update;

    if found then
      raise exception 'Transaction has an unlinked asset event';
    end if;
  end if;

  -- Lock old and new accounts in UUID order so concurrent wallet moves use the
  -- same lock order even when they move transactions in opposite directions.
  perform account_ref.id
  from public.asset_accounts as account_ref
  where account_ref.user_id = v_user_id
    and (
      account_ref.id = v_transaction.asset_account_id
      or account_ref.id = v_target_asset_account_id
    )
  order by account_ref.id
  for update;

  if v_transaction.asset_account_id is not null then
    select account_ref.*
      into v_old_account
    from public.asset_accounts as account_ref
    where account_ref.id = v_transaction.asset_account_id
      and account_ref.user_id = v_user_id;

    if not found then
      raise exception using
        errcode = '42501',
        message = 'Associated asset account not found or not owned by the authenticated user';
    end if;

    if v_old_account.kind not in ('cash', 'bank', 'credit_card', 'savings') then
      raise exception 'Associated asset account kind is invalid for a transaction';
    end if;

    if v_old_event.currency <> v_transaction.currency
       or v_old_account.currency <> v_transaction.currency then
      raise exception 'Transaction/event/account currencies do not match';
    end if;
  end if;

  if v_target_asset_account_id is not null then
    select account_ref.*
      into v_new_account
    from public.asset_accounts as account_ref
    where account_ref.id = v_target_asset_account_id
      and account_ref.user_id = v_user_id;

    if not found then
      raise exception using
        errcode = '42501',
        message = 'New asset account not found or not owned by the authenticated user';
    end if;

    if v_new_account.kind not in ('cash', 'bank', 'credit_card', 'savings') then
      raise exception using
        errcode = '22023',
        message = 'This asset account kind cannot be linked to a transaction';
    end if;

    if v_new_account.currency <> v_transaction.currency then
      raise exception using
        errcode = '22023',
        message = 'Asset account currency does not match transaction currency';
    end if;
  end if;

  if v_transaction.asset_event_id is not null then
    -- Reversal is also a signed delta: add the exact negation of the stored
    -- event amount only after transaction/event/account association is proven.
    v_delta := -v_old_event.amount;

    update public.asset_accounts as account_ref
    set balance = account_ref.balance + v_delta,
        updated_at = now()
    where account_ref.id = v_old_account.id
      and account_ref.user_id = v_user_id;

    if not found then
      raise exception 'Associated asset account disappeared during reversal';
    end if;

    delete from public.asset_events as event_ref
    where event_ref.id = v_old_event.id
      and event_ref.user_id = v_user_id
      and event_ref.transaction_id = v_transaction.id
      and event_ref.account_id = v_old_account.id;

    if not found then
      raise exception 'Associated asset event disappeared during reversal';
    end if;
  end if;

  update public.transactions as transaction_ref
  set amount = p_amount,
      transaction_time = p_occurred_at,
      content = p_content,
      merchant = v_merchant,
      note = v_note,
      category = p_category,
      asset_account_id = v_target_asset_account_id,
      counterparty_asset_account_id = null,
      asset_event_id = null
  where transaction_ref.id = v_transaction.id
    and transaction_ref.user_id = v_user_id
  returning transaction_ref.* into v_transaction;

  if not found then
    raise exception 'Locked transaction disappeared during update';
  end if;

  if v_target_asset_account_id is null then
    return v_transaction;
  end if;

  -- The new event amount is exactly the signed delta applied below.
  if v_new_account.kind = 'credit_card' then
    if v_transaction.direction = 'expense' then
      v_delta := p_amount;
      v_event_type := 'expense';
    else
      v_delta := -p_amount;
      v_event_type := 'card_refund';
    end if;
  elsif v_transaction.direction = 'expense' then
    v_delta := -p_amount;
    v_event_type := 'expense';
  else
    v_delta := p_amount;
    v_event_type := 'income';
  end if;

  update public.asset_accounts as account_ref
  set balance = account_ref.balance + v_delta,
      updated_at = now()
  where account_ref.id = v_new_account.id
    and account_ref.user_id = v_user_id;

  if not found then
    raise exception 'New asset account disappeared during transaction update';
  end if;

  insert into public.asset_events (
    user_id,
    account_id,
    counterparty_account_id,
    transaction_id,
    type,
    amount,
    currency,
    balance_after,
    note,
    occurred_at
  )
  values (
    v_user_id,
    v_new_account.id,
    null,
    v_transaction.id,
    v_event_type,
    v_delta,
    v_transaction.currency,
    null,
    coalesce(v_note, v_merchant),
    p_occurred_at
  )
  returning id into v_event_id;

  update public.transactions as transaction_ref
  set asset_event_id = v_event_id
  where transaction_ref.id = v_transaction.id
    and transaction_ref.user_id = v_user_id
    and transaction_ref.asset_account_id = v_new_account.id
    and transaction_ref.counterparty_asset_account_id is null
    and transaction_ref.asset_event_id is null
  returning transaction_ref.* into v_transaction;

  if not found then
    raise exception 'Transaction/event/account association changed during update';
  end if;

  return v_transaction;
end;
$function$;

comment on function public.update_transaction_with_asset_effect(
  uuid,
  integer,
  timestamptz,
  text,
  text,
  uuid,
  boolean,
  text,
  text
) is 'Atomically reverses a transaction asset event and applies its replacement. Current account balances and signed event amounts are authoritative; mutable events omit balance_after.';


create or replace function public.delete_transaction_with_asset_effect(
  p_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
set row_security = on
as $function$
declare
  v_user_id uuid := auth.uid();
  v_transaction public.transactions%rowtype;
  v_event public.asset_events%rowtype;
  v_account public.asset_accounts%rowtype;
  v_delta numeric;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  if p_id is null then
    raise exception using
      errcode = '22023',
      message = 'Transaction id is required';
  end if;

  select transaction_ref.*
    into v_transaction
  from public.transactions as transaction_ref
  where transaction_ref.id = p_id
    and transaction_ref.user_id = v_user_id
  for update;

  if not found then
    -- Missing and not-owned rows are intentionally indistinguishable so a lost
    -- delete response can be retried without exposing another user's row.
    return;
  end if;

  if (v_transaction.asset_account_id is null) <>
     (v_transaction.asset_event_id is null) then
    raise exception 'Transaction has an incomplete asset association';
  end if;

  if v_transaction.counterparty_asset_account_id is not null then
    raise exception 'Transaction has an unexpected counterparty asset association';
  end if;

  if v_transaction.asset_event_id is not null then
    select event_ref.*
      into v_event
    from public.asset_events as event_ref
    where event_ref.id = v_transaction.asset_event_id
      and event_ref.user_id = v_user_id
      and event_ref.transaction_id = v_transaction.id
      and event_ref.account_id = v_transaction.asset_account_id
      and event_ref.counterparty_account_id is null
    for update;

    if not found then
      raise exception 'Transaction/event/account association is invalid';
    end if;

    perform event_ref.id
    from public.asset_events as event_ref
    where event_ref.user_id = v_user_id
      and event_ref.transaction_id = v_transaction.id
      and event_ref.id <> v_event.id
    order by event_ref.id
    for update;

    if found then
      raise exception 'Transaction has more than one associated asset event';
    end if;

    select account_ref.*
      into v_account
    from public.asset_accounts as account_ref
    where account_ref.id = v_transaction.asset_account_id
      and account_ref.user_id = v_user_id
    for update;

    if not found then
      raise exception using
        errcode = '42501',
        message = 'Associated asset account not found or not owned by the authenticated user';
    end if;

    if v_account.kind not in ('cash', 'bank', 'credit_card', 'savings') then
      raise exception 'Associated asset account kind is invalid for a transaction';
    end if;

    if v_event.currency <> v_transaction.currency
       or v_account.currency <> v_transaction.currency then
      raise exception 'Transaction/event/account currencies do not match';
    end if;

    -- A reversal adds the negated signed event amount to the locked account.
    v_delta := -v_event.amount;

    update public.asset_accounts as account_ref
    set balance = account_ref.balance + v_delta,
        updated_at = now()
    where account_ref.id = v_account.id
      and account_ref.user_id = v_user_id;

    if not found then
      raise exception 'Associated asset account disappeared during reversal';
    end if;

    delete from public.asset_events as event_ref
    where event_ref.id = v_event.id
      and event_ref.user_id = v_user_id
      and event_ref.transaction_id = v_transaction.id
      and event_ref.account_id = v_account.id;

    if not found then
      raise exception 'Associated asset event disappeared during reversal';
    end if;
  else
    perform event_ref.id
    from public.asset_events as event_ref
    where event_ref.user_id = v_user_id
      and event_ref.transaction_id = v_transaction.id
    order by event_ref.id
    for update;

    if found then
      raise exception 'Transaction has an unlinked asset event';
    end if;
  end if;

  delete from public.transactions as transaction_ref
  where transaction_ref.id = v_transaction.id
    and transaction_ref.user_id = v_user_id;

  if not found then
    raise exception 'Locked transaction disappeared during delete';
  end if;
end;
$function$;

comment on function public.delete_transaction_with_asset_effect(uuid)
  is 'Idempotently deletes a visible transaction, atomically reversing its associated signed asset delta. Missing or not-owned rows are indistinguishable no-ops.';


create or replace function public.save_asset_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_currency text,
  p_occurred_at timestamptz,
  p_operation_id uuid,
  p_note text default null
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
set row_security = on
as $function$
declare
  v_user_id uuid := auth.uid();
  v_from_account public.asset_accounts%rowtype;
  v_to_account public.asset_accounts%rowtype;
  v_existing_operation public.asset_transfer_operations%rowtype;
  v_inserted_operation_id uuid;
  v_from_delta numeric;
  v_to_delta numeric;
  v_to_event_type text;
  v_note text := nullif(btrim(p_note), '');
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  if p_operation_id is null then
    raise exception using
      errcode = '22023',
      message = 'Operation id is required';
  end if;

  if p_from_account_id is null or p_to_account_id is null then
    raise exception using
      errcode = '22023',
      message = 'Source and target accounts are required';
  end if;

  if p_from_account_id = p_to_account_id then
    raise exception using
      errcode = '22023',
      message = 'Transfer accounts must be different';
  end if;

  if p_amount is null
     or p_amount <= 0
     or p_amount::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception using
      errcode = '22023',
      message = 'Amount must be a finite number greater than zero';
  end if;

  if p_currency is null or p_currency not in ('VND', 'USD') then
    raise exception using
      errcode = '22023',
      message = 'Transfer currency must be VND or USD';
  end if;

  if p_occurred_at is null then
    raise exception using
      errcode = '22023',
      message = 'Transfer time is required';
  end if;

  insert into public.asset_transfer_operations (
    user_id,
    operation_id,
    from_account_id,
    to_account_id,
    amount,
    currency,
    occurred_at,
    note
  )
  values (
    v_user_id,
    p_operation_id,
    p_from_account_id,
    p_to_account_id,
    p_amount,
    p_currency,
    p_occurred_at,
    v_note
  )
  on conflict (user_id, operation_id) do nothing
  returning operation_id into v_inserted_operation_id;

  if not found then
    select operation_ref.*
      into v_existing_operation
    from public.asset_transfer_operations as operation_ref
    where operation_ref.user_id = v_user_id
      and operation_ref.operation_id = p_operation_id;

    if not found then
      raise exception 'Transfer operation conflict could not be resolved';
    end if;

    if v_existing_operation.from_account_id is distinct from p_from_account_id
       or v_existing_operation.to_account_id is distinct from p_to_account_id
       or v_existing_operation.amount is distinct from p_amount
       or v_existing_operation.currency is distinct from p_currency
       or v_existing_operation.occurred_at is distinct from p_occurred_at
       or v_existing_operation.note is distinct from v_note then
      raise exception using
        errcode = '22023',
        message = 'Operation id was already used with a different transfer payload';
    end if;

    return;
  end if;

  -- Lock both accounts in UUID order to prevent opposite-direction transfers
  -- from acquiring their source/target locks in opposite orders.
  perform account_ref.id
  from public.asset_accounts as account_ref
  where account_ref.user_id = v_user_id
    and account_ref.id in (p_from_account_id, p_to_account_id)
  order by account_ref.id
  for update;

  select account_ref.*
    into v_from_account
  from public.asset_accounts as account_ref
  where account_ref.id = p_from_account_id
    and account_ref.user_id = v_user_id;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Source account not found or not owned by the authenticated user';
  end if;

  select account_ref.*
    into v_to_account
  from public.asset_accounts as account_ref
  where account_ref.id = p_to_account_id
    and account_ref.user_id = v_user_id;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Target account not found or not owned by the authenticated user';
  end if;

  if v_from_account.kind not in ('cash', 'bank', 'savings', 'foreign_currency') then
    raise exception using
      errcode = '22023',
      message = 'Source account must not be a credit-card or gold account';
  end if;

  if v_to_account.kind not in (
    'cash',
    'bank',
    'credit_card',
    'savings',
    'foreign_currency'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Target account kind cannot receive a transfer';
  end if;

  if v_from_account.currency <> p_currency
     or v_to_account.currency <> p_currency then
    raise exception using
      errcode = '22023',
      message = 'Source and target account currencies must match the transfer currency';
  end if;

  -- Signed transfer delta convention:
  --   source transfer_out = -amount;
  --   normal target transfer_in = +amount;
  --   credit-card target card_payment = -amount (less debt).
  v_from_delta := -p_amount;
  if v_to_account.kind = 'credit_card' then
    v_to_delta := -p_amount;
    v_to_event_type := 'card_payment';
  else
    v_to_delta := p_amount;
    v_to_event_type := 'transfer_in';
  end if;

  update public.asset_accounts as account_ref
  set balance = account_ref.balance + v_from_delta,
      updated_at = now()
  where account_ref.id = v_from_account.id
    and account_ref.user_id = v_user_id;

  if not found then
    raise exception 'Locked source account disappeared during transfer';
  end if;

  update public.asset_accounts as account_ref
  set balance = account_ref.balance + v_to_delta,
      updated_at = now()
  where account_ref.id = v_to_account.id
    and account_ref.user_id = v_user_id;

  if not found then
    raise exception 'Locked target account disappeared during transfer';
  end if;

  insert into public.asset_events (
    user_id,
    account_id,
    counterparty_account_id,
    transaction_id,
    type,
    amount,
    currency,
    balance_after,
    note,
    occurred_at
  )
  values (
    v_user_id,
    v_from_account.id,
    v_to_account.id,
    null,
    'transfer_out',
    v_from_delta,
    p_currency,
    null,
    v_note,
    p_occurred_at
  );

  insert into public.asset_events (
    user_id,
    account_id,
    counterparty_account_id,
    transaction_id,
    type,
    amount,
    currency,
    balance_after,
    note,
    occurred_at
  )
  values (
    v_user_id,
    v_to_account.id,
    v_from_account.id,
    null,
    v_to_event_type,
    v_to_delta,
    p_currency,
    null,
    v_note,
    p_occurred_at
  );
end;
$function$;

comment on function public.save_asset_transfer(
  uuid,
  uuid,
  numeric,
  text,
  timestamptz,
  uuid,
  text
) is 'Idempotently and atomically transfers between owned accounts using signed event deltas. Mutable transfer/card-payment events omit balance_after.';


revoke all privileges on function public.save_transaction_with_asset_effect(
  integer,
  text,
  timestamptz,
  text,
  text,
  text,
  uuid,
  uuid,
  text,
  text,
  text
) from public;
revoke all privileges on function public.save_transaction_with_asset_effect(
  integer,
  text,
  timestamptz,
  text,
  text,
  text,
  uuid,
  uuid,
  text,
  text,
  text
) from anon;
grant execute on function public.save_transaction_with_asset_effect(
  integer,
  text,
  timestamptz,
  text,
  text,
  text,
  uuid,
  uuid,
  text,
  text,
  text
) to authenticated;

revoke all privileges on function public.update_transaction_with_asset_effect(
  uuid,
  integer,
  timestamptz,
  text,
  text,
  uuid,
  boolean,
  text,
  text
) from public;
revoke all privileges on function public.update_transaction_with_asset_effect(
  uuid,
  integer,
  timestamptz,
  text,
  text,
  uuid,
  boolean,
  text,
  text
) from anon;
grant execute on function public.update_transaction_with_asset_effect(
  uuid,
  integer,
  timestamptz,
  text,
  text,
  uuid,
  boolean,
  text,
  text
) to authenticated;

revoke all privileges on function public.delete_transaction_with_asset_effect(uuid)
  from public;
revoke all privileges on function public.delete_transaction_with_asset_effect(uuid)
  from anon;
grant execute on function public.delete_transaction_with_asset_effect(uuid)
  to authenticated;

revoke all privileges on function public.save_asset_transfer(
  uuid,
  uuid,
  numeric,
  text,
  timestamptz,
  uuid,
  text
) from public;
revoke all privileges on function public.save_asset_transfer(
  uuid,
  uuid,
  numeric,
  text,
  timestamptz,
  uuid,
  text
) from anon;
grant execute on function public.save_asset_transfer(
  uuid,
  uuid,
  numeric,
  text,
  timestamptz,
  uuid,
  text
) to authenticated;

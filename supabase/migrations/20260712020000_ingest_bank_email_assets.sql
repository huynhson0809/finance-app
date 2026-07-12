-- Bank-email ingestion is a single database transaction: the email row wins
-- idempotency first, then any asset account, event, and balance effects follow.

create index if not exists asset_events_account_bank_email_sync_chronology_idx
  on public.asset_events (
    account_id,
    occurred_at desc,
    created_at,
    id
  )
  where type = 'bank_email_sync';

create or replace function public.ingest_bank_email_transaction(
  p_user_id uuid,
  p_bank text,
  p_type text,
  p_amount integer,
  p_transaction_time timestamptz,
  p_content text,
  p_category text,
  p_direction text,
  p_external_hash text,
  p_account_identifier text default null,
  p_card_identifier text default null,
  p_balance_vnd numeric default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
set row_security = on
as $function$
declare
  v_bank text;
  v_type text;
  v_content text;
  v_category text;
  v_direction text;
  v_external_hash text;
  v_effective_external_hash text;
  v_account_identifier text;
  v_card_identifier text;
  v_transaction public.transactions%rowtype;
  v_account public.asset_accounts%rowtype;
  v_event_id uuid;
  v_delta numeric;
  v_event_type text;
  v_latest_snapshot_time timestamptz;
  v_post_snapshot_delta numeric;
  v_identifier_match_count integer;
  v_hash_attempt integer;
begin
  if p_user_id is null then
    raise exception using
      errcode = '22023',
      message = 'User id is required';
  end if;

  v_bank := pg_catalog.upper(nullif(pg_catalog.btrim(p_bank), ''));
  if v_bank is null or v_bank not in ('MB', 'ACB') then
    raise exception using
      errcode = '22023',
      message = 'Bank must be MB or ACB';
  end if;

  v_type := pg_catalog.lower(nullif(pg_catalog.btrim(p_type), ''));
  if v_type is null or v_type not in ('transfer', 'card', 'balance_alert') then
    raise exception using
      errcode = '22023',
      message = 'Type must be transfer, card, or balance_alert';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception using
      errcode = '22023',
      message = 'Amount must be greater than zero';
  end if;

  if p_transaction_time is null then
    raise exception using
      errcode = '22023',
      message = 'Transaction time is required';
  end if;

  v_content := nullif(pg_catalog.btrim(p_content), '');
  if v_content is null then
    raise exception using
      errcode = '22023',
      message = 'Transaction content is required';
  end if;

  v_direction := pg_catalog.lower(
    nullif(pg_catalog.btrim(p_direction), '')
  );
  if v_direction is null or v_direction not in ('expense', 'income') then
    raise exception using
      errcode = '22023',
      message = 'Direction must be expense or income';
  end if;

  v_category := pg_catalog.lower(
    nullif(pg_catalog.btrim(p_category), '')
  );
  if v_direction = 'expense' then
    if v_category is null or not (
      v_category in (
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
      or v_category like 'custom-expense-%'
    ) then
      raise exception using
        errcode = '22023',
        message = 'Category does not belong to expense transactions';
    end if;
  else
    if v_category is null or not (
      v_category in (
        'salary',
        'allowance',
        'bonus',
        'side-income',
        'investment',
        'temporary-income'
      )
      or v_category like 'custom-income-%'
    ) then
      raise exception using
        errcode = '22023',
        message = 'Category does not belong to income transactions';
    end if;
  end if;

  v_external_hash := nullif(
    pg_catalog.btrim(p_external_hash),
    ''
  );
  if v_external_hash is null then
    raise exception using
      errcode = '22023',
      message = 'External hash is required';
  end if;

  -- Account tokens remain case-insensitive alphanumerics. Card identity is the
  -- final four digits, regardless of masks, separators, or a full card number.
  v_account_identifier := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.upper(pg_catalog.btrim(p_account_identifier)),
      '[^A-Z0-9]',
      '',
      'g'
    ),
    ''
  );
  v_card_identifier := null;

  if p_card_identifier is not null then
    v_card_identifier := pg_catalog.regexp_replace(
      pg_catalog.btrim(p_card_identifier),
      '[^0-9]',
      '',
      'g'
    );

    if pg_catalog.length(v_card_identifier) < 4 then
      raise exception using
        errcode = '22023',
        message = 'Card identifier must contain at least four digits';
    end if;

    v_card_identifier := pg_catalog.right(v_card_identifier, 4);
  end if;

  if p_account_identifier is not null and v_account_identifier is null then
    raise exception using
      errcode = '22023',
      message = 'Account identifier must contain at least one letter or digit';
  end if;

  if v_account_identifier is not null and v_card_identifier is not null then
    raise exception using
      errcode = '22023',
      message = 'Provide either an account identifier or a card identifier, not both';
  end if;

  if v_type = 'card' and v_account_identifier is not null then
    raise exception using
      errcode = '22023',
      message = 'Card transactions require a card identifier, not an account identifier';
  end if;

  if v_type <> 'card' and v_card_identifier is not null then
    raise exception using
      errcode = '22023',
      message = 'Only card transactions may use a card identifier';
  end if;

  if p_balance_vnd is not null then
    if p_balance_vnd::text in ('NaN', 'Infinity', '-Infinity') then
      raise exception using
        errcode = '22023',
        message = 'Balance snapshot must be a finite nonnegative integer';
    end if;

    if p_balance_vnd < 0 or p_balance_vnd <> pg_catalog.trunc(p_balance_vnd) then
      raise exception using
        errcode = '22023',
        message = 'Balance snapshot must be a finite nonnegative integer';
    end if;

    if v_account_identifier is null then
      raise exception using
        errcode = '22023',
        message = 'Balance snapshot requires a valid account identifier';
    end if;

    if v_bank <> 'ACB' or v_type <> 'balance_alert' then
      raise exception using
        errcode = '22023',
        message = 'Balance snapshot is only valid for an ACB bank balance alert';
    end if;
  end if;

  -- The first direction keeps the legacy hash. If the same user later receives
  -- the opposite direction with that hash, its deterministic alternate keeps
  -- both rows idempotent without changing the legacy hash generator.
  v_effective_external_hash := v_external_hash;
  for v_hash_attempt in 1..2 loop
    insert into public.transactions as transaction_ref (
      user_id,
      bank,
      type,
      amount,
      currency,
      transaction_time,
      content,
      raw_source,
      external_hash,
      category,
      direction,
      asset_account_id,
      counterparty_asset_account_id,
      asset_event_id
    )
    values (
      p_user_id,
      v_bank,
      v_type,
      p_amount,
      'VND',
      p_transaction_time,
      v_content,
      'email',
      v_effective_external_hash,
      v_category,
      v_direction,
      null,
      null,
      null
    )
    on conflict (user_id, external_hash) do nothing
    returning transaction_ref.* into v_transaction;

    if found then
      exit;
    end if;

    select transaction_ref.*
      into v_transaction
    from public.transactions as transaction_ref
    where transaction_ref.user_id = p_user_id
      and transaction_ref.external_hash = v_effective_external_hash
    for share;

    if not found then
      raise exception using
        errcode = '40001',
        message = 'Duplicate bank-email transaction could not be resolved';
    end if;

    if v_transaction.direction is not distinct from v_direction then
      return pg_catalog.jsonb_build_object(
        'status', 'duplicate',
        'transaction_id', v_transaction.id,
        'asset_account_id', v_transaction.asset_account_id,
        'asset_event_id', v_transaction.asset_event_id
      );
    end if;

    if v_hash_attempt = 2 then
      raise exception using
        errcode = '23505',
        message = 'Direction-specific bank-email hash is already used by the opposite direction';
    end if;

    v_effective_external_hash :=
      v_external_hash || ':direction:' || v_direction;
  end loop;

  if v_account_identifier is null and v_card_identifier is null then
    return pg_catalog.jsonb_build_object(
      'status', 'inserted',
      'transaction_id', v_transaction.id,
      'asset_account_id', null,
      'asset_event_id', null
    );
  end if;

  if v_account_identifier is not null then
    perform account_ref.id
    from public.asset_accounts as account_ref
    where account_ref.user_id = p_user_id
      and pg_catalog.upper(pg_catalog.btrim(account_ref.bank)) = v_bank
      and pg_catalog.regexp_replace(
        pg_catalog.upper(pg_catalog.btrim(account_ref.account_identifier)),
        '[^A-Z0-9]',
        '',
        'g'
      ) = v_account_identifier
    for update;
    get diagnostics v_identifier_match_count = row_count;

    if v_identifier_match_count > 1 then
      raise exception using
        errcode = '23000',
        message = 'Ambiguous canonical bank account identifier for user and bank';
    end if;

    if v_identifier_match_count = 0 then
      insert into public.asset_accounts (
        user_id,
        kind,
        name,
        currency,
        balance,
        bank,
        account_identifier,
        card_identifier
      )
      values (
        p_user_id,
        'bank',
        v_bank || ' ' || pg_catalog.right(v_account_identifier, 4),
        'VND',
        0,
        v_bank,
        v_account_identifier,
        null
      )
      on conflict (user_id, bank, account_identifier)
        where account_identifier is not null
        do nothing;

      perform account_ref.id
      from public.asset_accounts as account_ref
      where account_ref.user_id = p_user_id
        and pg_catalog.upper(pg_catalog.btrim(account_ref.bank)) = v_bank
        and pg_catalog.regexp_replace(
          pg_catalog.upper(pg_catalog.btrim(account_ref.account_identifier)),
          '[^A-Z0-9]',
          '',
          'g'
        ) = v_account_identifier
      for update;
      get diagnostics v_identifier_match_count = row_count;

      if v_identifier_match_count > 1 then
        raise exception using
          errcode = '23000',
          message = 'Ambiguous canonical bank account identifier for user and bank';
      elsif v_identifier_match_count = 0 then
        raise exception 'Bank account conflict could not be resolved';
      end if;
    end if;

    begin
      select account_ref.*
        into strict v_account
      from public.asset_accounts as account_ref
      where account_ref.user_id = p_user_id
        and pg_catalog.upper(pg_catalog.btrim(account_ref.bank)) = v_bank
        and pg_catalog.regexp_replace(
          pg_catalog.upper(pg_catalog.btrim(account_ref.account_identifier)),
          '[^A-Z0-9]',
          '',
          'g'
        ) = v_account_identifier
      for update;
    exception
      when too_many_rows then
        raise exception using
          errcode = '23000',
          message = 'Ambiguous canonical bank account identifier for user and bank';
    end;

    if v_account.user_id is distinct from p_user_id
       or v_account.kind is distinct from 'bank'
       or v_account.currency is distinct from 'VND'
       or pg_catalog.upper(pg_catalog.btrim(v_account.bank)) is distinct from v_bank then
      raise exception using
        errcode = '22023',
        message = 'Matched asset account is not a valid owned VND bank account';
    end if;
  else
    perform account_ref.id
    from public.asset_accounts as account_ref
    where account_ref.user_id = p_user_id
      and pg_catalog.upper(pg_catalog.btrim(account_ref.bank)) = v_bank
      and pg_catalog.right(pg_catalog.regexp_replace(
        pg_catalog.btrim(account_ref.card_identifier),
        '[^0-9]',
        '',
        'g'
      ), 4) = v_card_identifier
    for update;
    get diagnostics v_identifier_match_count = row_count;

    if v_identifier_match_count > 1 then
      raise exception using
        errcode = '23000',
        message = 'Ambiguous canonical credit-card identifier for user and bank';
    end if;

    if v_identifier_match_count = 0 then
      insert into public.asset_accounts (
        user_id,
        kind,
        name,
        currency,
        balance,
        bank,
        account_identifier,
        card_identifier
      )
      values (
        p_user_id,
        'credit_card',
        v_bank || ' Card ' || pg_catalog.right(v_card_identifier, 4),
        'VND',
        0,
        v_bank,
        null,
        v_card_identifier
      )
      on conflict (user_id, bank, card_identifier)
        where card_identifier is not null
        do nothing;

      perform account_ref.id
      from public.asset_accounts as account_ref
      where account_ref.user_id = p_user_id
        and pg_catalog.upper(pg_catalog.btrim(account_ref.bank)) = v_bank
        and pg_catalog.right(pg_catalog.regexp_replace(
          pg_catalog.btrim(account_ref.card_identifier),
          '[^0-9]',
          '',
          'g'
        ), 4) = v_card_identifier
      for update;
      get diagnostics v_identifier_match_count = row_count;

      if v_identifier_match_count > 1 then
        raise exception using
          errcode = '23000',
          message = 'Ambiguous canonical credit-card identifier for user and bank';
      elsif v_identifier_match_count = 0 then
        raise exception 'Credit-card account conflict could not be resolved';
      end if;
    end if;

    begin
      select account_ref.*
        into strict v_account
      from public.asset_accounts as account_ref
      where account_ref.user_id = p_user_id
        and pg_catalog.upper(pg_catalog.btrim(account_ref.bank)) = v_bank
        and pg_catalog.right(pg_catalog.regexp_replace(
          pg_catalog.btrim(account_ref.card_identifier),
          '[^0-9]',
          '',
          'g'
        ), 4) = v_card_identifier
      for update;
    exception
      when too_many_rows then
        raise exception using
          errcode = '23000',
          message = 'Ambiguous canonical credit-card identifier for user and bank';
    end;

    if v_account.user_id is distinct from p_user_id
       or v_account.kind is distinct from 'credit_card'
       or v_account.currency is distinct from 'VND'
       or pg_catalog.upper(pg_catalog.btrim(v_account.bank)) is distinct from v_bank then
      raise exception using
        errcode = '22023',
        message = 'Matched asset account is not a valid owned VND credit card';
    end if;
  end if;

  if v_direction = 'expense' then
    v_delta := -p_amount;
  else
    v_delta := p_amount;
  end if;

  if v_account.kind = 'credit_card' then
    if v_direction = 'expense' then
      v_delta := p_amount;
      v_event_type := 'expense';
    else
      v_delta := -p_amount;
      v_event_type := 'card_refund';
    end if;

    update public.asset_accounts as account_ref
    set balance = account_ref.balance + v_delta,
        updated_at = pg_catalog.now()
    where account_ref.id = v_account.id
      and account_ref.user_id = p_user_id;

    if not found then
      raise exception 'Locked credit-card account disappeared during bank-email ingestion';
    end if;
  elsif p_balance_vnd is not null then
    v_event_type := 'bank_email_sync';

    select event_ref.occurred_at
      into v_latest_snapshot_time
    from public.asset_events as event_ref
    where event_ref.account_id = v_account.id
      and event_ref.user_id = p_user_id
      and event_ref.type = 'bank_email_sync'
    order by event_ref.occurred_at desc, event_ref.created_at, event_ref.id
    limit 1;

    -- An exact snapshot only becomes authoritative when it is strictly newer.
    -- Rebase it with mutable deltas already recorded after the snapshot time.
    if v_latest_snapshot_time is null
       or p_transaction_time > v_latest_snapshot_time then
      select coalesce(pg_catalog.sum(event_ref.amount), 0)
        into v_post_snapshot_delta
      from public.asset_events as event_ref
      where event_ref.account_id = v_account.id
        and event_ref.user_id = p_user_id
        and event_ref.type in (
          'expense',
          'income',
          'transfer_in',
          'transfer_out',
          'card_refund',
          'card_payment'
        )
        and event_ref.occurred_at > p_transaction_time;

      update public.asset_accounts as account_ref
      set balance = p_balance_vnd + v_post_snapshot_delta,
          updated_at = pg_catalog.now()
      where account_ref.id = v_account.id
        and account_ref.user_id = p_user_id;

      if not found then
        raise exception 'Locked snapshot account disappeared during bank-email ingestion';
      end if;
    end if;
  else
    v_event_type := case v_direction
      when 'expense' then 'expense'
      else 'income'
    end;

    update public.asset_accounts as account_ref
    set balance = account_ref.balance + v_delta,
        updated_at = pg_catalog.now()
    where account_ref.id = v_account.id
      and account_ref.user_id = p_user_id;

    if not found then
      raise exception 'Locked bank account disappeared during bank-email ingestion';
    end if;
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
    occurred_at,
    created_at
  )
  values (
    p_user_id,
    v_account.id,
    null,
    v_transaction.id,
    v_event_type,
    v_delta,
    'VND',
    case when v_event_type = 'bank_email_sync' then p_balance_vnd else null end,
    v_content,
    p_transaction_time,
    pg_catalog.clock_timestamp()
  )
  returning id into v_event_id;

  update public.transactions as transaction_ref
  set asset_account_id = v_account.id,
      counterparty_asset_account_id = null,
      asset_event_id = v_event_id
  where transaction_ref.id = v_transaction.id
    and transaction_ref.user_id = p_user_id
    and transaction_ref.asset_account_id is null
    and transaction_ref.counterparty_asset_account_id is null
    and transaction_ref.asset_event_id is null
  returning transaction_ref.* into v_transaction;

  if not found then
    raise exception 'Transaction/account/event association changed during bank-email ingestion';
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'inserted',
    'transaction_id', v_transaction.id,
    'asset_account_id', v_transaction.asset_account_id,
    'asset_event_id', v_transaction.asset_event_id
  );
end;
$function$;

comment on function public.ingest_bank_email_transaction(
  uuid,
  text,
  text,
  integer,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric
) is 'Idempotently and atomically ingests one bank-email transaction, optional asset account, signed event, and balance effect.';

revoke all privileges on function public.ingest_bank_email_transaction(
  uuid,
  text,
  text,
  integer,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric
) from public, anon, authenticated, service_role;
grant execute on function public.ingest_bank_email_transaction(
  uuid,
  text,
  text,
  integer,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric
) to service_role;

revoke all privileges on table
  public.transactions,
  public.asset_accounts,
  public.asset_events
from service_role;

grant select, insert, update on table public.transactions to service_role;
grant select, insert, update on table public.asset_accounts to service_role;
grant select, insert on table public.asset_events to service_role;


-- Every existing transaction/transfer RPC applies its signed delta before it
-- inserts the event. If that event belongs at or before the latest exact bank
-- snapshot, compensate immediately so arrival order cannot change the balance.
create or replace function public.reconcile_asset_event_with_bank_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = on
as $function$
declare
  v_latest_snapshot_time timestamptz;
begin
  if new.type not in (
    'expense',
    'income',
    'transfer_in',
    'transfer_out',
    'card_refund',
    'card_payment'
  ) then
    return new;
  end if;

  select event_ref.occurred_at
    into v_latest_snapshot_time
  from public.asset_events as event_ref
  where event_ref.account_id = new.account_id
    and event_ref.user_id = new.user_id
    and event_ref.type = 'bank_email_sync'
  order by event_ref.occurred_at desc, event_ref.created_at, event_ref.id
  limit 1;

  if v_latest_snapshot_time is not null
     and new.occurred_at <= v_latest_snapshot_time then
    update public.asset_accounts as account_ref
    set balance = account_ref.balance - new.amount,
        updated_at = pg_catalog.now()
    where account_ref.id = new.account_id
      and account_ref.user_id = new.user_id;

    if not found then
      raise exception 'Snapshot reconciliation account disappeared during event insert';
    end if;
  end if;

  return new;
end;
$function$;

revoke all privileges on function public.reconcile_asset_event_with_bank_snapshot()
  from public, anon, authenticated, service_role;

drop trigger if exists reconcile_asset_event_with_bank_snapshot
  on public.asset_events;
create trigger reconcile_asset_event_with_bank_snapshot
after insert on public.asset_events
for each row
execute function public.reconcile_asset_event_with_bank_snapshot();


-- The general asset-aware edit path predates immutable bank-email snapshots.
-- Preserve its existing behavior for mutable events, but short-circuit snapshot
-- rows to a category/note-only update before any reversal is attempted.
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
  v_latest_snapshot_time timestamptz;
  v_snapshot_note text;
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

  if v_transaction.asset_event_id is not null
     and v_old_event.type = 'bank_email_sync' then
    v_delta := case v_transaction.direction
      when 'expense' then -v_transaction.amount
      else v_transaction.amount
    end;

    if v_transaction.bank is distinct from 'ACB'
       or v_transaction.type is distinct from 'balance_alert'
       or v_transaction.raw_source is distinct from 'email'
       or v_transaction.currency is distinct from 'VND'
       or v_old_account.kind is distinct from 'bank'
       or upper(btrim(v_old_account.bank)) is distinct from 'ACB'
       or v_old_account.currency is distinct from 'VND'
       or v_old_event.amount is distinct from v_delta
       or v_old_event.currency is distinct from 'VND'
       or v_old_event.balance_after is null then
      raise exception 'Snapshot-linked transaction association is invalid';
    end if;

    if p_amount is distinct from v_transaction.amount
       or p_occurred_at is distinct from v_transaction.transaction_time
       or v_target_asset_account_id is distinct from v_transaction.asset_account_id then
      raise exception using
        errcode = '55000',
        message = 'Snapshot-linked transactions only allow category and note edits';
    end if;

    -- The edit screen sends its visible text through merchant for expenses and
    -- note for income. Preserve immutable bank content/merchant fields and map
    -- that descriptive value into note instead.
    v_snapshot_note := coalesce(
      v_note,
      v_merchant,
      nullif(btrim(p_content), '')
    );

    update public.transactions as transaction_ref
    set category = p_category,
        note = v_snapshot_note
    where transaction_ref.id = v_transaction.id
      and transaction_ref.user_id = v_user_id
      and transaction_ref.asset_account_id = v_old_account.id
      and transaction_ref.asset_event_id = v_old_event.id
    returning transaction_ref.* into v_transaction;

    if not found then
      raise exception 'Snapshot-linked transaction changed during descriptive update';
    end if;

    return v_transaction;
  end if;

  if v_transaction.asset_event_id is not null then
    v_latest_snapshot_time := null;
    select event_ref.occurred_at
      into v_latest_snapshot_time
    from public.asset_events as event_ref
    where event_ref.account_id = v_old_account.id
      and event_ref.user_id = v_user_id
      and event_ref.type = 'bank_email_sync'
    order by event_ref.occurred_at desc, event_ref.created_at, event_ref.id
    limit 1;

    -- Only events after the authoritative snapshot contribute to current
    -- balance and therefore need reversal.
    if v_latest_snapshot_time is null
       or v_old_event.occurred_at > v_latest_snapshot_time then
      v_delta := -v_old_event.amount;

      update public.asset_accounts as account_ref
      set balance = account_ref.balance + v_delta,
          updated_at = now()
      where account_ref.id = v_old_account.id
        and account_ref.user_id = v_user_id;

      if not found then
        raise exception 'Associated asset account disappeared during reversal';
      end if;
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
) is 'Atomically edits mutable asset effects; immutable bank-email snapshots permit category and note edits only.';


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
  v_latest_snapshot_time timestamptz;
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

    if v_event.type = 'bank_email_sync' then
      raise exception using
        errcode = '55000',
        message = 'Snapshot-linked transactions cannot be deleted';
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

    select event_ref.occurred_at
      into v_latest_snapshot_time
    from public.asset_events as event_ref
    where event_ref.account_id = v_account.id
      and event_ref.user_id = v_user_id
      and event_ref.type = 'bank_email_sync'
    order by event_ref.occurred_at desc, event_ref.created_at, event_ref.id
    limit 1;

    if v_latest_snapshot_time is null
       or v_event.occurred_at > v_latest_snapshot_time then
      v_delta := -v_event.amount;

      update public.asset_accounts as account_ref
      set balance = account_ref.balance + v_delta,
          updated_at = now()
      where account_ref.id = v_account.id
        and account_ref.user_id = v_user_id;

      if not found then
        raise exception 'Associated asset account disappeared during reversal';
      end if;
    end if;

    delete from public.asset_events as event_ref
    where event_ref.id = v_event.id
      and event_ref.user_id = v_user_id
      and event_ref.transaction_id = v_transaction.id
      and event_ref.account_id = v_account.id;

    if not found then
      raise exception 'Associated asset event disappeared during delete';
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
  is 'Deletes mutable transaction effects chronologically; exact bank snapshot transactions are immutable and rejected.';


-- These RPCs validate auth.uid() and account/transaction ownership internally.
-- Run them as the function owner after removing direct mutation privileges.
alter function public.save_transaction_with_asset_effect(
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
) security definer;
alter function public.save_transaction_with_asset_effect(
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
) set search_path = public, pg_temp;

alter function public.update_transaction_with_asset_effect(
  uuid,
  integer,
  timestamptz,
  text,
  text,
  uuid,
  boolean,
  text,
  text
) security definer;
alter function public.update_transaction_with_asset_effect(
  uuid,
  integer,
  timestamptz,
  text,
  text,
  uuid,
  boolean,
  text,
  text
) set search_path = public, pg_temp;

alter function public.delete_transaction_with_asset_effect(uuid)
  security definer;
alter function public.delete_transaction_with_asset_effect(uuid)
  set search_path = public, pg_temp;

alter function public.save_asset_transfer(
  uuid,
  uuid,
  numeric,
  text,
  timestamptz,
  uuid,
  text
) security definer;
alter function public.save_asset_transfer(
  uuid,
  uuid,
  numeric,
  text,
  timestamptz,
  uuid,
  text
) set search_path = public, pg_temp;

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
) from public, anon;
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
) from public, anon;
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
  from public, anon;
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
) from public, anon;
grant execute on function public.save_asset_transfer(
  uuid,
  uuid,
  numeric,
  text,
  timestamptz,
  uuid,
  text
) to authenticated;


-- Transaction financial/link edits and all event mutations go through the
-- security-definer RPCs. Legacy receipt/OCR inserts retain only safe columns.
revoke insert, update, delete on table public.transactions
  from anon, authenticated;
revoke update (
  id,
  user_id,
  bank,
  type,
  amount,
  currency,
  transaction_time,
  content,
  raw_source,
  external_hash,
  created_at,
  merchant,
  category,
  note,
  bank_hint,
  direction,
  asset_account_id,
  counterparty_asset_account_id,
  asset_event_id,
  operation_id
) on public.transactions from anon, authenticated;

grant insert (
  id,
  user_id,
  bank,
  type,
  amount,
  currency,
  transaction_time,
  content,
  raw_source,
  external_hash,
  created_at,
  merchant,
  category,
  note,
  bank_hint,
  direction
) on public.transactions to authenticated;

revoke insert, update, delete on table public.asset_events
  from anon, authenticated;

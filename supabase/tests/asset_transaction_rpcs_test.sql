begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(21);

insert into auth.users (
  id,
  aud,
  role,
  email,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000101',
  'authenticated',
  'authenticated',
  'asset-rpc-test@example.com',
  now(),
  now()
);

insert into public.asset_accounts (
  id,
  user_id,
  kind,
  name,
  currency,
  balance
)
values
  (
    '10000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101',
    'bank',
    'Test bank',
    'VND',
    1000
  ),
  (
    '10000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000101',
    'savings',
    'Test savings',
    'VND',
    200
  );

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000101';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;

select lives_ok(
  $test$
    select public.save_transaction_with_asset_effect(
      100,
      'VND',
      '2026-07-12T01:00:00Z'::timestamptz,
      'expense',
      'food-drinks',
      'manual',
      '30000000-0000-0000-0000-000000000101',
      '10000000-0000-0000-0000-000000000101',
      'Lunch',
      null,
      null
    )
  $test$,
  'linked transaction save succeeds'
);

select lives_ok(
  $test$
    select public.save_transaction_with_asset_effect(
      100,
      'VND',
      '2026-07-12T01:00:00Z'::timestamptz,
      'expense',
      'food-drinks',
      'manual',
      '30000000-0000-0000-0000-000000000101',
      '10000000-0000-0000-0000-000000000101',
      'Lunch',
      null,
      null
    )
  $test$,
  'matching transaction retry succeeds'
);

select is(
  (
    select count(*)
    from public.transactions
    where operation_id = '30000000-0000-0000-0000-000000000101'
  ),
  1::bigint,
  'transaction retry reuses one row'
);

select is(
  (
    select balance
    from public.asset_accounts
    where id = '10000000-0000-0000-0000-000000000101'
  ),
  900::numeric,
  'transaction retry applies one balance delta'
);

select is(
  (
    select count(*)
    from public.asset_events
    where transaction_id = (
      select id
      from public.transactions
      where operation_id = '30000000-0000-0000-0000-000000000101'
    )
  ),
  1::bigint,
  'transaction retry creates one event'
);

select ok(
  (
    select balance_after is null
    from public.asset_events
    where transaction_id = (
      select id
      from public.transactions
      where operation_id = '30000000-0000-0000-0000-000000000101'
    )
  ),
  'mutable transaction event omits balance_after'
);

select throws_ok(
  $test$
    select public.save_transaction_with_asset_effect(
      101,
      'VND',
      '2026-07-12T01:00:00Z'::timestamptz,
      'expense',
      'food-drinks',
      'manual',
      '30000000-0000-0000-0000-000000000101',
      '10000000-0000-0000-0000-000000000101',
      'Lunch',
      null,
      null
    )
  $test$,
  '22023',
  'Operation id was already used with a different transaction payload',
  'transaction operation id rejects payload drift'
);

select lives_ok(
  $test$
    select public.save_asset_transfer(
      '10000000-0000-0000-0000-000000000101',
      '10000000-0000-0000-0000-000000000102',
      100,
      'VND',
      '2026-07-12T01:00:00Z'::timestamptz,
      '30000000-0000-0000-0000-000000000102',
      'Save'
    )
  $test$,
  'asset transfer succeeds'
);

select lives_ok(
  $test$
    select public.save_asset_transfer(
      '10000000-0000-0000-0000-000000000101',
      '10000000-0000-0000-0000-000000000102',
      100,
      'VND',
      '2026-07-12T01:00:00Z'::timestamptz,
      '30000000-0000-0000-0000-000000000102',
      'Save'
    )
  $test$,
  'matching transfer retry succeeds'
);

select is(
  (
    select balance
    from public.asset_accounts
    where id = '10000000-0000-0000-0000-000000000101'
  ),
  800::numeric,
  'transfer retry debits source once'
);

select is(
  (
    select balance
    from public.asset_accounts
    where id = '10000000-0000-0000-0000-000000000102'
  ),
  300::numeric,
  'transfer retry credits target once'
);

select is(
  (
    select count(*)
    from public.asset_transfer_operations
    where operation_id = '30000000-0000-0000-0000-000000000102'
  ),
  1::bigint,
  'transfer retry has one ledger row'
);

select is(
  (
    select count(*)
    from public.asset_events
    where transaction_id is null
      and account_id in (
        '10000000-0000-0000-0000-000000000101',
        '10000000-0000-0000-0000-000000000102'
      )
  ),
  2::bigint,
  'transfer retry creates two events once'
);

select ok(
  (
    select bool_and(balance_after is null)
    from public.asset_events
    where transaction_id is null
      and account_id in (
        '10000000-0000-0000-0000-000000000101',
        '10000000-0000-0000-0000-000000000102'
      )
  ),
  'mutable transfer events omit balance_after'
);

select throws_ok(
  $test$
    select public.save_asset_transfer(
      '10000000-0000-0000-0000-000000000101',
      '10000000-0000-0000-0000-000000000102',
      101,
      'VND',
      '2026-07-12T01:00:00Z'::timestamptz,
      '30000000-0000-0000-0000-000000000102',
      'Save'
    )
  $test$,
  '22023',
  'Operation id was already used with a different transfer payload',
  'transfer operation id rejects payload drift'
);

select lives_ok(
  $test$
    select public.delete_transaction_with_asset_effect(
      (
        select id
        from public.transactions
        where operation_id = '30000000-0000-0000-0000-000000000101'
      )
    )
  $test$,
  'linked transaction delete succeeds'
);

select lives_ok(
  $test$
    select public.delete_transaction_with_asset_effect(
      'ffffffff-ffff-ffff-ffff-ffffffffffff'
    )
  $test$,
  'missing transaction delete retry is a no-op'
);

select ok(
  (
    select transaction_id is null
    from public.asset_transaction_operations
    where operation_id = '30000000-0000-0000-0000-000000000101'
  ),
  'transaction-save ledger survives deletion as a tombstone'
);

select throws_ok(
  $test$
    select public.save_transaction_with_asset_effect(
      100,
      'VND',
      '2026-07-12T01:00:00Z'::timestamptz,
      'expense',
      'food-drinks',
      'manual',
      '30000000-0000-0000-0000-000000000101',
      '10000000-0000-0000-0000-000000000101',
      'Lunch',
      null,
      null
    )
  $test$,
  '55000',
  'Transaction save operation was already completed and deleted; replay is not allowed',
  'delayed matching save replay cannot recreate a deleted transaction'
);

select is(
  (
    select count(*)
    from public.transactions
    where operation_id = '30000000-0000-0000-0000-000000000101'
  ),
  0::bigint,
  'delete removes the transaction'
);

select is(
  (
    select balance
    from public.asset_accounts
    where id = '10000000-0000-0000-0000-000000000101'
  ),
  900::numeric,
  'delete reverses the transaction delta once'
);

select * from finish();
rollback;

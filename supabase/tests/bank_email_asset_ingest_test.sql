begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(132);

select is(
  (
    select count(*)
    from pg_catalog.pg_proc as procedure_ref
    where procedure_ref.oid = pg_catalog.to_regprocedure(
      'public.ingest_bank_email_transaction(uuid,text,text,integer,timestamp with time zone,text,text,text,text,text,text,numeric)'
    )
      and procedure_ref.prorettype = 'jsonb'::pg_catalog.regtype
  ),
  1::bigint,
  'ingest RPC has the exact input types and jsonb return type'
);

select ok(
  (
    select procedure_ref.proargnames = array[
      'p_user_id',
      'p_bank',
      'p_type',
      'p_amount',
      'p_transaction_time',
      'p_content',
      'p_category',
      'p_direction',
      'p_external_hash',
      'p_account_identifier',
      'p_card_identifier',
      'p_balance_vnd'
    ]::text[]
      and procedure_ref.pronargdefaults = 3
      and not procedure_ref.prosecdef
    from pg_catalog.pg_proc as procedure_ref
    where procedure_ref.oid = pg_catalog.to_regprocedure(
      'public.ingest_bank_email_transaction(uuid,text,text,integer,timestamp with time zone,text,text,text,text,text,text,numeric)'
    )
  ),
  'ingest RPC preserves names/defaults and remains security invoker'
);

select ok(
  (
    select procedure_ref.proconfig @> array[
      'search_path=pg_catalog, public, pg_temp',
      'row_security=on'
    ]
    from pg_catalog.pg_proc as procedure_ref
    where procedure_ref.oid = pg_catalog.to_regprocedure(
      'public.ingest_bank_email_transaction(uuid,text,text,integer,timestamp with time zone,text,text,text,text,text,text,numeric)'
    )
  )
  and pg_catalog.has_function_privilege(
    'service_role',
    'public.ingest_bank_email_transaction(uuid,text,text,integer,timestamp with time zone,text,text,text,text,text,text,numeric)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'public.ingest_bank_email_transaction(uuid,text,text,integer,timestamp with time zone,text,text,text,text,text,text,numeric)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.ingest_bank_email_transaction(uuid,text,text,integer,timestamp with time zone,text,text,text,text,text,text,numeric)',
    'EXECUTE'
  ),
  'ingest RPC has a fixed path and service-role-only execution'
);

select ok(
  pg_catalog.has_table_privilege(
    'service_role',
    'public.transactions',
    'SELECT'
  )
  and pg_catalog.has_table_privilege(
    'service_role',
    'public.transactions',
    'INSERT'
  )
  and pg_catalog.has_table_privilege(
    'service_role',
    'public.transactions',
    'UPDATE'
  )
  and not pg_catalog.has_table_privilege(
    'service_role',
    'public.transactions',
    'DELETE'
  )
  and pg_catalog.has_table_privilege(
    'service_role',
    'public.asset_accounts',
    'SELECT'
  )
  and pg_catalog.has_table_privilege(
    'service_role',
    'public.asset_accounts',
    'INSERT'
  )
  and pg_catalog.has_table_privilege(
    'service_role',
    'public.asset_accounts',
    'UPDATE'
  )
  and not pg_catalog.has_table_privilege(
    'service_role',
    'public.asset_accounts',
    'DELETE'
  )
  and pg_catalog.has_table_privilege(
    'service_role',
    'public.asset_events',
    'SELECT'
  )
  and pg_catalog.has_table_privilege(
    'service_role',
    'public.asset_events',
    'INSERT'
  )
  and not pg_catalog.has_table_privilege(
    'service_role',
    'public.asset_events',
    'UPDATE'
  )
  and not pg_catalog.has_table_privilege(
    'service_role',
    'public.asset_events',
    'DELETE'
  ),
  'service role has exactly the table DML needed by security-invoker ingest'
);

select ok(
  (
    select index_ref.indisvalid
      and pg_catalog.pg_get_indexdef(index_ref.indexrelid)
        like '%(account_id, occurred_at DESC, created_at, id)%'
      and pg_catalog.pg_get_expr(index_ref.indpred, index_ref.indrelid)
        = '(type = ''bank_email_sync''::text)'
    from pg_catalog.pg_index as index_ref
    where index_ref.indexrelid = pg_catalog.to_regclass(
      'public.asset_events_account_bank_email_sync_chronology_idx'
    )
  ),
  'latest bank-email snapshot lookup has a matching partial chronology index'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_proc as procedure_ref
    join pg_catalog.pg_namespace as namespace_ref
      on namespace_ref.oid = procedure_ref.pronamespace
    where namespace_ref.nspname = 'public'
      and procedure_ref.proname in (
        'save_transaction_with_asset_effect',
        'update_transaction_with_asset_effect',
        'delete_transaction_with_asset_effect',
        'save_asset_transfer'
      )
      and procedure_ref.prosecdef
      and procedure_ref.proconfig @> array[
        'search_path=public, pg_temp',
        'row_security=on'
      ]
      and pg_catalog.has_function_privilege(
        'authenticated',
        procedure_ref.oid,
        'EXECUTE'
      )
  ),
  4::bigint,
  'all four authenticated asset RPCs are fixed-path security definers'
);

select ok(
  not pg_catalog.has_table_privilege(
    'authenticated',
    'public.transactions',
    'DELETE'
  )
  and not pg_catalog.has_column_privilege(
    'authenticated',
    'public.transactions',
    'amount',
    'UPDATE'
  )
  and not pg_catalog.has_column_privilege(
    'authenticated',
    'public.transactions',
    'category',
    'UPDATE'
  )
  and not pg_catalog.has_column_privilege(
    'authenticated',
    'public.transactions',
    'asset_event_id',
    'UPDATE'
  ),
  'authenticated cannot directly update or delete transactions'
);

select ok(
  not pg_catalog.has_table_privilege(
    'authenticated',
    'public.asset_events',
    'INSERT'
  )
  and not pg_catalog.has_table_privilege(
    'authenticated',
    'public.asset_events',
    'UPDATE'
  )
  and not pg_catalog.has_table_privilege(
    'authenticated',
    'public.asset_events',
    'DELETE'
  ),
  'authenticated cannot directly mutate asset events'
);

select ok(
  not pg_catalog.has_table_privilege(
    'authenticated',
    'public.transactions',
    'INSERT'
  )
  and pg_catalog.has_column_privilege(
    'authenticated',
    'public.transactions',
    'amount',
    'INSERT'
  )
  and pg_catalog.has_column_privilege(
    'authenticated',
    'public.transactions',
    'external_hash',
    'INSERT'
  )
  and pg_catalog.has_column_privilege(
    'authenticated',
    'public.transactions',
    'user_id',
    'INSERT'
  )
  and not pg_catalog.has_column_privilege(
    'authenticated',
    'public.transactions',
    'operation_id',
    'INSERT'
  )
  and not pg_catalog.has_column_privilege(
    'authenticated',
    'public.transactions',
    'asset_account_id',
    'INSERT'
  )
  and not pg_catalog.has_column_privilege(
    'authenticated',
    'public.transactions',
    'asset_event_id',
    'INSERT'
  ),
  'legacy inserts have safe columns but no operation or link columns'
);

select ok(
  pg_catalog.has_table_privilege(
    'authenticated',
    'public.asset_accounts',
    'UPDATE'
  )
  and pg_catalog.has_table_privilege(
    'authenticated',
    'public.asset_accounts',
    'DELETE'
  ),
  'manual account edits and account deletion remain available'
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000201',
    'authenticated',
    'authenticated',
    'bank-ingest-one@example.com',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000202',
    'authenticated',
    'authenticated',
    'bank-ingest-two@example.com',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000203',
    'authenticated',
    'authenticated',
    'bank-ingest-cascade@example.com',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000204',
    'authenticated',
    'authenticated',
    'bank-ingest-user-cascade@example.com',
    now(),
    now()
  );

insert into public.asset_accounts (
  id,
  user_id,
  kind,
  name,
  currency,
  balance,
  bank,
  account_identifier,
  card_identifier
)
values
  (
    '10000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000201',
    'bank',
    'Existing masked ACB account',
    'VND',
    500,
    'ACB',
    '**** 2222',
    null
  ),
  (
    '10000000-0000-0000-0000-000000000202',
    '00000000-0000-0000-0000-000000000201',
    'credit_card',
    'Existing masked MB card',
    'VND',
    0,
    'MB',
    null,
    '**** 4444'
  ),
  (
    '10000000-0000-0000-0000-000000000203',
    '00000000-0000-0000-0000-000000000201',
    'savings',
    'Invalid ingest target',
    'VND',
    500,
    'MB',
    'BAD-ASSET',
    null
  ),
  (
    '10000000-0000-0000-0000-000000000204',
    '00000000-0000-0000-0000-000000000202',
    'bank',
    'Other user account',
    'VND',
    999,
    'MB',
    'CROSS-1234',
    null
  ),
  (
    '10000000-0000-0000-0000-000000000205',
    '00000000-0000-0000-0000-000000000201',
    'bank',
    'Ambiguous identifier one',
    'VND',
    111,
    'MB',
    'AMB-1234',
    null
  ),
  (
    '10000000-0000-0000-0000-000000000206',
    '00000000-0000-0000-0000-000000000201',
    'bank',
    'Ambiguous identifier two',
    'VND',
    222,
    'MB',
    'AMB 1234',
    null
  ),
  (
    '10000000-0000-0000-0000-000000000207',
    '00000000-0000-0000-0000-000000000201',
    'credit_card',
    'Ambiguous card one',
    'VND',
    11,
    'ACB',
    null,
    '9704.05XX.XXXX.7777'
  ),
  (
    '10000000-0000-0000-0000-000000000208',
    '00000000-0000-0000-0000-000000000201',
    'credit_card',
    'Ambiguous card two',
    'VND',
    22,
    'ACB',
    null,
    '**** 7777'
  ),
  (
    '10000000-0000-0000-0000-000000000209',
    '00000000-0000-0000-0000-000000000201',
    'credit_card',
    'Formatted MB card',
    'VND',
    0,
    'MB',
    null,
    '9704.05XX.XXXX.1234'
  ),
  (
    '10000000-0000-0000-0000-000000000210',
    '00000000-0000-0000-0000-000000000201',
    'bank',
    'Hash collision account',
    'VND',
    1000,
    'MB',
    'HASH-5555',
    null
  ),
  (
    '10000000-0000-0000-0000-000000000211',
    '00000000-0000-0000-0000-000000000201',
    'bank',
    'Chronology primary',
    'VND',
    0,
    'ACB',
    'CHRONO-UPD-9001',
    null
  ),
  (
    '10000000-0000-0000-0000-000000000212',
    '00000000-0000-0000-0000-000000000201',
    'bank',
    'Chronology transfer peer',
    'VND',
    0,
    'ACB',
    'CHRONO-XFER-9002',
    null
  );

set local role service_role;

select throws_ok(
  $test$
    select public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'MB',
      'transfer',
      9,
      '2026-07-01T00:06:00Z'::timestamptz,
      'Ambiguous canonical account',
      'others',
      'expense',
      'ambiguous-canonical-account',
      'amb1234'
    )
  $test$,
  '23000',
  'Ambiguous canonical bank account identifier for user and bank',
  'ambiguous canonical account match raises an integrity error'
);

select is(
  (
    select count(*)
    from public.transactions
    where external_hash = 'ambiguous-canonical-account'
  ),
  0::bigint,
  'ambiguous canonical match rolls back the transaction insert'
);

select is(
  (
    select pg_catalog.array_agg(account_ref.balance order by account_ref.id)
    from public.asset_accounts as account_ref
    where account_ref.id in (
      '10000000-0000-0000-0000-000000000205',
      '10000000-0000-0000-0000-000000000206'
    )
  ),
  array[111::numeric, 222::numeric],
  'ambiguous canonical match leaves every candidate balance unchanged'
);

select throws_ok(
  $test$
    select public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'ACB',
      'card',
      9,
      '2026-07-01T00:07:00Z'::timestamptz,
      'Ambiguous last-four card',
      'others',
      'expense',
      'ambiguous-canonical-card',
      null,
      '4111 1111 1111 7777'
    )
  $test$,
  '23000',
  'Ambiguous canonical credit-card identifier for user and bank',
  'ambiguous bank and card last-four match raises an integrity error'
);

select is(
  (
    select count(*)
    from public.transactions
    where external_hash = 'ambiguous-canonical-card'
  ),
  0::bigint,
  'ambiguous last-four card match rolls back the transaction insert'
);

select is(
  (
    select pg_catalog.array_agg(account_ref.balance order by account_ref.id)
    from public.asset_accounts as account_ref
    where account_ref.id in (
      '10000000-0000-0000-0000-000000000207',
      '10000000-0000-0000-0000-000000000208'
    )
  ),
  array[11::numeric, 22::numeric],
  'ambiguous last-four card match leaves candidate balances unchanged'
);

select throws_ok(
  $test$
    select public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'MB',
      'transfer',
      1,
      '2026-07-01T00:00:00Z'::timestamptz,
      'Canonical-empty account',
      'others',
      'expense',
      'invalid-empty-account',
      '****'
    )
  $test$,
  '22023',
  'Account identifier must contain at least one letter or digit',
  'canonical-empty account identifier is rejected before insert'
);

select throws_ok(
  $test$
    select public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'MB',
      'card',
      1,
      '2026-07-01T00:01:00Z'::timestamptz,
      'Canonical-empty card',
      'others',
      'expense',
      'invalid-empty-card',
      null,
      '---- ****'
    )
  $test$,
  '22023',
  'Card identifier must contain at least four digits',
  'canonical-empty card identifier is rejected before insert'
);

select throws_ok(
  $test$
    select public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'MB',
      'card',
      1,
      '2026-07-01T00:01:30Z'::timestamptz,
      'Short card identifier',
      'others',
      'expense',
      'invalid-short-card',
      null,
      '123'
    )
  $test$,
  '22023',
  'Card identifier must contain at least four digits',
  'card identifiers with fewer than four digits are rejected before insert'
);

select throws_ok(
  $test$
    select public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'ACB',
      'balance_alert',
      1,
      '2026-07-01T00:02:00Z'::timestamptz,
      'Snapshot without account',
      'others',
      'expense',
      'invalid-balance-no-account',
      null,
      null,
      100
    )
  $test$,
  '22023',
  'Balance snapshot requires a valid account identifier',
  'balance snapshot requires a canonical account identifier before insert'
);

select throws_ok(
  $test$
    select public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'ACB',
      'balance_alert',
      1,
      '2026-07-01T00:03:00Z'::timestamptz,
      'Negative snapshot',
      'others',
      'expense',
      'invalid-balance-negative',
      'neg-1',
      null,
      -1
    )
  $test$,
  '22023',
  'Balance snapshot must be a finite nonnegative integer',
  'negative balance snapshot is rejected'
);

select throws_ok(
  $test$
    select public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'ACB',
      'balance_alert',
      1,
      '2026-07-01T00:04:00Z'::timestamptz,
      'Fractional snapshot',
      'others',
      'expense',
      'invalid-balance-fraction',
      'fraction-1',
      null,
      1.5
    )
  $test$,
  '22023',
  'Balance snapshot must be a finite nonnegative integer',
  'fractional balance snapshot is rejected'
);

select throws_ok(
  $test$
    select public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'ACB',
      'balance_alert',
      1,
      '2026-07-01T00:05:00Z'::timestamptz,
      'Infinite snapshot',
      'others',
      'expense',
      'invalid-balance-infinity',
      'infinity-1',
      null,
      'Infinity'::numeric
    )
  $test$,
  '22023',
  'Balance snapshot must be a finite nonnegative integer',
  'infinite balance snapshot is rejected'
);

select is(
  (
    select count(*)
    from public.transactions
    where external_hash like 'invalid-%'
  ),
  0::bigint,
  'all identifier and balance validation errors occur before transaction insert'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'ACB',
      'balance_alert',
      1,
      '2026-07-01T01:00:00Z'::timestamptz,
      'Huge valid snapshot',
      'others',
      'expense',
      'huge-valid-snapshot',
      'huge-9999',
      null,
      999999999999999999999999::numeric
    )
  )->>'status',
  'inserted',
  'finite nonnegative integer snapshot is not int4 capped'
);

select ok(
  (
    select account_ref.balance = 999999999999999999999999::numeric
      and event_ref.type = 'bank_email_sync'
      and event_ref.balance_after = 999999999999999999999999::numeric
    from public.transactions as transaction_ref
    join public.asset_accounts as account_ref
      on account_ref.id = transaction_ref.asset_account_id
    join public.asset_events as event_ref
      on event_ref.id = transaction_ref.asset_event_id
    where transaction_ref.external_hash = 'huge-valid-snapshot'
  ),
  'large numeric snapshot persists exactly'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'MB',
      'transfer',
      1000,
      '2026-07-02T00:00:00Z'::timestamptz,
      'Legacy transaction only',
      'others',
      'expense',
      'legacy-no-identifier'
    )
  )->>'status',
  'inserted',
  'legacy payload without identifiers inserts successfully'
);

select ok(
  (
    select transaction_ref.asset_account_id is null
      and transaction_ref.asset_event_id is null
      and not exists (
        select 1
        from public.asset_events as event_ref
        where event_ref.transaction_id = transaction_ref.id
      )
    from public.transactions as transaction_ref
    where transaction_ref.external_hash = 'legacy-no-identifier'
  ),
  'legacy payload remains transaction-only'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'MB',
      'transfer',
      10,
      '2026-07-02T00:01:00Z'::timestamptz,
      'Custom expense category',
      'custom-expense-review-test',
      'expense',
      'custom-expense-ingest'
    )
  )->>'status',
  'inserted',
  'custom expense category is accepted by ingestion RPC'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'ACB',
      'transfer',
      10,
      '2026-07-02T00:02:00Z'::timestamptz,
      'Custom income category',
      'custom-income-review-test',
      'income',
      'custom-income-ingest'
    )
  )->>'status',
  'inserted',
  'custom income category is accepted by ingestion RPC'
);

select ok(
  (
    select pg_catalog.bool_and(
      transaction_ref.category = case transaction_ref.external_hash
        when 'custom-expense-ingest' then 'custom-expense-review-test'
        else 'custom-income-review-test'
      end
    )
    from public.transactions as transaction_ref
    where transaction_ref.external_hash in (
      'custom-expense-ingest',
      'custom-income-ingest'
    )
  ),
  'custom expense and income categories persist unchanged'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      ' acb ',
      'balance_alert',
      10,
      '2026-07-10T10:00:00Z'::timestamptz,
      'Chronology initial snapshot',
      'others',
      'expense',
      'chrono-initial-snapshot',
      ' 22-22 ',
      null,
      1000
    )
  )->>'status',
  'inserted',
  'initial ACB snapshot ingests successfully'
);

select ok(
  (
    select account_ref.id = '10000000-0000-0000-0000-000000000201'
      and account_ref.balance = 1000
      and (
        select count(*)
        from public.asset_accounts as duplicate_ref
        where duplicate_ref.user_id = account_ref.user_id
          and pg_catalog.upper(pg_catalog.btrim(duplicate_ref.bank)) = 'ACB'
          and pg_catalog.regexp_replace(
            pg_catalog.upper(pg_catalog.btrim(duplicate_ref.account_identifier)),
            '[^A-Z0-9]',
            '',
            'g'
          ) = '2222'
      ) = 1
    from public.transactions as transaction_ref
    join public.asset_accounts as account_ref
      on account_ref.id = transaction_ref.asset_account_id
    where transaction_ref.external_hash = 'chrono-initial-snapshot'
  ),
  'masked existing bank account is matched without creating a duplicate'
);

select ok(
  (
    select event_ref.type = 'bank_email_sync'
      and event_ref.amount = -10
      and event_ref.balance_after = 1000
    from public.transactions as transaction_ref
    join public.asset_events as event_ref
      on event_ref.id = transaction_ref.asset_event_id
    where transaction_ref.external_hash = 'chrono-initial-snapshot'
  ),
  'initial snapshot stores signed transaction amount and exact balance_after'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'ACB',
      'balance_alert',
      100,
      '2026-07-10T12:00:00Z'::timestamptz,
      'Chronology post-snapshot debit',
      'others',
      'expense',
      'chrono-post-debit',
      '2222'
    )
  )->>'status',
  'inserted',
  'mutable event after latest snapshot ingests successfully'
);

select ok(
  (
    select account_ref.balance = 900
      and event_ref.type = 'expense'
      and event_ref.amount = -100
    from public.transactions as transaction_ref
    join public.asset_accounts as account_ref
      on account_ref.id = transaction_ref.asset_account_id
    join public.asset_events as event_ref
      on event_ref.id = transaction_ref.asset_event_id
    where transaction_ref.external_hash = 'chrono-post-debit'
  ),
  'mutable event after latest snapshot changes current balance'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'ACB',
      'balance_alert',
      50,
      '2026-07-10T09:00:00Z'::timestamptz,
      'Chronology delayed debit',
      'others',
      'expense',
      'chrono-delayed-debit',
      '2222'
    )
  )->>'status',
  'inserted',
  'delayed mutable event before latest snapshot is still recorded'
);

select ok(
  (
    select account_ref.balance = 900
      and event_ref.amount = -50
      and event_ref.occurred_at = '2026-07-10T09:00:00Z'::timestamptz
    from public.transactions as transaction_ref
    join public.asset_accounts as account_ref
      on account_ref.id = transaction_ref.asset_account_id
    join public.asset_events as event_ref
      on event_ref.id = transaction_ref.asset_event_id
    where transaction_ref.external_hash = 'chrono-delayed-debit'
  ),
  'delayed mutable event before latest snapshot does not alter balance'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'ACB',
      'balance_alert',
      25,
      '2026-07-10T10:00:00Z'::timestamptz,
      'Chronology equal-time credit',
      'temporary-income',
      'income',
      'chrono-equal-credit',
      '2222'
    )
  )->>'status',
  'inserted',
  'mutable event equal to latest snapshot time is recorded'
);

select is(
  (
    select balance
    from public.asset_accounts
    where id = '10000000-0000-0000-0000-000000000201'
  ),
  900::numeric,
  'mutable event equal to latest snapshot time does not alter balance'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'ACB',
      'balance_alert',
      5,
      '2026-07-10T08:00:00Z'::timestamptz,
      'Chronology older snapshot',
      'others',
      'expense',
      'chrono-older-snapshot',
      '2222',
      null,
      700
    )
  )->>'status',
  'inserted',
  'older snapshot is retained as history'
);

select is(
  (
    select balance
    from public.asset_accounts
    where id = '10000000-0000-0000-0000-000000000201'
  ),
  900::numeric,
  'older snapshot does not overwrite newer snapshot-derived balance'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'ACB',
      'balance_alert',
      5,
      '2026-07-10T10:00:00Z'::timestamptz,
      'Chronology equal snapshot',
      'others',
      'expense',
      'chrono-equal-snapshot',
      '2222',
      null,
      5000
    )
  )->>'status',
  'inserted',
  'equal-time snapshot is retained as history'
);

select is(
  (
    select balance
    from public.asset_accounts
    where id = '10000000-0000-0000-0000-000000000201'
  ),
  900::numeric,
  'equal-time snapshot does not overwrite the authoritative snapshot'
);

reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000201';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;

select lives_ok(
  $test$
    update public.asset_accounts
    set balance = 950
    where id = '10000000-0000-0000-0000-000000000201'
  $test$,
  'manual account balance edit remains available'
);

reset role;

select is(
  (
    select balance
    from public.asset_accounts
    where id = '10000000-0000-0000-0000-000000000201'
  ),
  950::numeric,
  'manual account balance edit is persisted'
);

set local role service_role;

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'ACB',
      'balance_alert',
      5,
      '2026-07-10T09:30:00Z'::timestamptz,
      'Chronology stale snapshot after manual edit',
      'others',
      'expense',
      'chrono-stale-after-manual',
      '2222',
      null,
      1
    )
  )->>'status',
  'inserted',
  'stale snapshot after manual edit is recorded'
);

select is(
  (
    select balance
    from public.asset_accounts
    where id = '10000000-0000-0000-0000-000000000201'
  ),
  950::numeric,
  'stale snapshot preserves a later manual balance edit'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'ACB',
      'balance_alert',
      20,
      '2026-07-10T13:00:00Z'::timestamptz,
      'Chronology post-snapshot income',
      'temporary-income',
      'income',
      'chrono-post-income',
      '2222'
    )
  )->>'status',
  'inserted',
  'post-snapshot income after manual edit is recorded'
);

select is(
  (
    select balance
    from public.asset_accounts
    where id = '10000000-0000-0000-0000-000000000201'
  ),
  970::numeric,
  'post-snapshot mutable delta preserves and builds on manual balance edit'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'ACB',
      'balance_alert',
      5,
      '2026-07-10T11:00:42Z'::timestamptz,
      'Chronology newer snapshot',
      'others',
      'expense',
      'chrono-newer-snapshot',
      '2222',
      null,
      2000
    )
  )->>'status',
  'inserted',
  'strictly newer snapshot becomes authoritative'
);

select is(
  (
    select balance
    from public.asset_accounts
    where id = '10000000-0000-0000-0000-000000000201'
  ),
  1920::numeric,
  'newer snapshot rebases to exact balance plus only recorded later deltas'
);

select ok(
  (
    select event_ref.type = 'bank_email_sync'
      and event_ref.balance_after = 2000
      and event_ref.amount = -5
      and account_ref.balance = 1920
    from public.transactions as transaction_ref
    join public.asset_events as event_ref
      on event_ref.id = transaction_ref.asset_event_id
    join public.asset_accounts as account_ref
      on account_ref.id = transaction_ref.asset_account_id
    where transaction_ref.external_hash = 'chrono-newer-snapshot'
  ),
  'newer snapshot keeps its exact balance_after while account includes later deltas'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'ACB',
      'balance_alert',
      5,
      '2026-07-10T10:30:00Z'::timestamptz,
      'Chronology delayed snapshot',
      'others',
      'expense',
      'chrono-delayed-snapshot',
      '2222',
      null,
      9999
    )
  )->>'status',
  'inserted',
  'delayed snapshot after a newer snapshot is recorded'
);

select is(
  (
    select balance
    from public.asset_accounts
    where id = '10000000-0000-0000-0000-000000000201'
  ),
  1920::numeric,
  'delayed snapshot cannot overwrite current balance'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'ACB',
      'balance_alert',
      30,
      '2026-07-10T10:45:00Z'::timestamptz,
      'Chronology delayed delta',
      'others',
      'expense',
      'chrono-delayed-delta',
      '2222'
    )
  )->>'status',
  'inserted',
  'delayed delta before latest snapshot is recorded'
);

select is(
  (
    select balance
    from public.asset_accounts
    where id = '10000000-0000-0000-0000-000000000201'
  ),
  1920::numeric,
  'delayed delta before latest snapshot does not alter balance'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'ACB',
      'balance_alert',
      20,
      '2026-07-10T14:00:00Z'::timestamptz,
      'Chronology latest debit',
      'others',
      'expense',
      'chrono-latest-debit',
      '2222'
    )
  )->>'status',
  'inserted',
  'delta after latest snapshot is recorded'
);

select ok(
  (
    select account_ref.balance = 1900
      and event_ref.amount = -20
    from public.transactions as transaction_ref
    join public.asset_accounts as account_ref
      on account_ref.id = transaction_ref.asset_account_id
    join public.asset_events as event_ref
      on event_ref.id = transaction_ref.asset_event_id
    where transaction_ref.external_hash = 'chrono-latest-debit'
  ),
  'delta after latest snapshot alters current balance'
);

reset role;

create temporary table snapshot_edit_baseline (
  transaction_id uuid not null,
  event_id uuid not null,
  account_id uuid not null,
  balance numeric not null,
  event_amount numeric not null,
  balance_after numeric not null,
  content text not null,
  merchant text
) on commit drop;

insert into snapshot_edit_baseline (
  transaction_id,
  event_id,
  account_id,
  balance,
  event_amount,
  balance_after,
  content,
  merchant
)
select
  transaction_ref.id,
  transaction_ref.asset_event_id,
  transaction_ref.asset_account_id,
  account_ref.balance,
  event_ref.amount,
  event_ref.balance_after,
  transaction_ref.content,
  transaction_ref.merchant
from public.transactions as transaction_ref
join public.asset_accounts as account_ref
  on account_ref.id = transaction_ref.asset_account_id
join public.asset_events as event_ref
  on event_ref.id = transaction_ref.asset_event_id
where transaction_ref.external_hash = 'chrono-newer-snapshot';

set local role authenticated;

select lives_ok(
  $test$
    select public.update_transaction_with_asset_effect(
      (
        select id
        from public.transactions
        where external_hash = 'chrono-newer-snapshot'
      ),
      5,
      '2026-07-10T11:00:42Z'::timestamptz,
      'Visible edited bank text',
      'shopping',
      null,
      true,
      'Visible edited bank text',
      null
    )
  $test$,
  'snapshot edit accepts the current expense UI payload'
);

reset role;

select ok(
  (
    select transaction_ref.category = 'shopping'
      and transaction_ref.note = 'Visible edited bank text'
      and transaction_ref.content = baseline.content
      and transaction_ref.merchant is not distinct from baseline.merchant
      and transaction_ref.asset_event_id = baseline.event_id
    from snapshot_edit_baseline as baseline
    join public.transactions as transaction_ref
      on transaction_ref.id = baseline.transaction_id
  ),
  'UI descriptive text maps to note while bank content and links stay immutable'
);

select ok(
  (
    select account_ref.balance = baseline.balance
      and event_ref.id = baseline.event_id
      and event_ref.type = 'bank_email_sync'
      and event_ref.amount = baseline.event_amount
      and event_ref.balance_after = baseline.balance_after
    from snapshot_edit_baseline as baseline
    join public.asset_accounts as account_ref
      on account_ref.id = baseline.account_id
    join public.asset_events as event_ref
      on event_ref.id = baseline.event_id
  ),
  'realistic snapshot edit does not replace event or change balance'
);

set local role authenticated;

select throws_ok(
  $test$
    select public.update_transaction_with_asset_effect(
      (
        select id
        from public.transactions
        where external_hash = 'chrono-newer-snapshot'
      ),
      5,
      '2026-07-10T11:00:00Z'::timestamptz,
      'Visible edited bank text',
      'shopping',
      null,
      true,
      'Visible edited bank text',
      null
    )
  $test$,
  '55000',
  'Snapshot-linked transactions only allow category and note edits',
  'snapshot edit requires an exact timestamp including seconds'
);

select throws_ok(
  $test$
    select public.update_transaction_with_asset_effect(
      (
        select id
        from public.transactions
        where external_hash = 'chrono-newer-snapshot'
      ),
      6,
      '2026-07-10T11:00:42Z'::timestamptz,
      'Visible edited bank text',
      'shopping',
      null,
      true,
      'Visible edited bank text',
      null
    )
  $test$,
  '55000',
  'Snapshot-linked transactions only allow category and note edits',
  'snapshot financial edit is rejected before any reversal'
);

select throws_ok(
  $test$
    select public.delete_transaction_with_asset_effect(
      (
        select id
        from public.transactions
        where external_hash = 'chrono-newer-snapshot'
      )
    )
  $test$,
  '55000',
  'Snapshot-linked transactions cannot be deleted',
  'snapshot-linked transaction deletion is rejected safely'
);

reset role;

select ok(
  (
    select transaction_ref.amount = 5
      and transaction_ref.asset_event_id = baseline.event_id
      and account_ref.balance = baseline.balance
      and event_ref.amount = baseline.event_amount
      and event_ref.balance_after = baseline.balance_after
    from snapshot_edit_baseline as baseline
    join public.transactions as transaction_ref
      on transaction_ref.id = baseline.transaction_id
    join public.asset_accounts as account_ref
      on account_ref.id = baseline.account_id
    join public.asset_events as event_ref
      on event_ref.id = baseline.event_id
  ),
  'rejected snapshot mutations leave transaction, event, and balance unchanged'
);

set local role authenticated;

select lives_ok(
  $test$
    insert into public.transactions (
      user_id,
      bank,
      type,
      amount,
      currency,
      transaction_time,
      content,
      raw_source,
      external_hash,
      merchant,
      category,
      note,
      bank_hint,
      direction
    )
    values (
      '00000000-0000-0000-0000-000000000201',
      null,
      'receipt',
      123,
      'VND',
      '2026-07-11T00:00:00Z'::timestamptz,
      'Receipt OCR insert',
      'receipt',
      'safe-receipt-insert',
      null,
      'others',
      'Receipt OCR insert',
      null,
      'expense'
    )
  $test$,
  'legacy receipt/OCR insert works through safe column grants'
);

reset role;

select ok(
  (
    select transaction_ref.user_id = '00000000-0000-0000-0000-000000000201'
      and transaction_ref.operation_id is null
      and transaction_ref.asset_account_id is null
      and transaction_ref.asset_event_id is null
    from public.transactions as transaction_ref
    where transaction_ref.external_hash = 'safe-receipt-insert'
  ),
  'safe direct insert defaults ownership and cannot set operation/link fields'
);

set local role authenticated;

select lives_ok(
  $test$
    select public.save_transaction_with_asset_effect(
      10,
      'VND',
      '2026-07-10T10:30:00Z'::timestamptz,
      'expense',
      'others',
      'manual',
      '30000000-0000-0000-0000-000000000201',
      '10000000-0000-0000-0000-000000000201',
      null,
      'Historical manual transaction',
      null
    )
  $test$,
  'security-definer save RPC works after direct event writes are revoked'
);

reset role;

select is(
  (
    select balance
    from public.asset_accounts
    where id = '10000000-0000-0000-0000-000000000201'
  ),
  1900::numeric,
  'security-definer RPC event before latest snapshot is neutralized'
);

set local role authenticated;

select lives_ok(
  $test$
    select public.save_transaction_with_asset_effect(
      10,
      'VND',
      '2026-07-10T15:00:00Z'::timestamptz,
      'expense',
      'others',
      'manual',
      '30000000-0000-0000-0000-000000000202',
      '10000000-0000-0000-0000-000000000201',
      null,
      'Current manual transaction',
      null
    )
  $test$,
  'security-definer save RPC records event after latest snapshot'
);

reset role;

select is(
  (
    select balance
    from public.asset_accounts
    where id = '10000000-0000-0000-0000-000000000201'
  ),
  1890::numeric,
  'security-definer RPC event after latest snapshot changes balance'
);

set local role service_role;

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'MB',
      'transfer',
      200,
      '2026-07-12T00:00:00Z'::timestamptz,
      'MB bank debit',
      'others',
      'expense',
      'mb-bank-debit',
      '98-76'
    )
  )->>'status',
  'inserted',
  'MB bank debit auto-creates an account'
);

select ok(
  (
    select account_ref.kind = 'bank'
      and account_ref.name = 'MB 9876'
      and account_ref.account_identifier = '9876'
      and account_ref.balance = -200
      and event_ref.amount = -200
    from public.transactions as transaction_ref
    join public.asset_accounts as account_ref
      on account_ref.id = transaction_ref.asset_account_id
    join public.asset_events as event_ref
      on event_ref.id = transaction_ref.asset_event_id
    where transaction_ref.external_hash = 'mb-bank-debit'
  ),
  'auto-created MB bank account stores canonical identifier and signed debit'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'MB',
      'card',
      300,
      '2026-07-12T00:10:00Z'::timestamptz,
      'MB card expense',
      'shopping',
      'expense',
      'mb-card-expense',
      null,
      '44-44'
    )
  )->>'status',
  'inserted',
  'MB card expense matches masked existing card'
);

select ok(
  (
    select account_ref.id = '10000000-0000-0000-0000-000000000202'
      and account_ref.balance = 300
      and event_ref.type = 'expense'
      and event_ref.amount = 300
      and (
        select count(*)
        from public.asset_accounts as duplicate_ref
        where duplicate_ref.user_id = account_ref.user_id
          and pg_catalog.upper(pg_catalog.btrim(duplicate_ref.bank)) = 'MB'
          and pg_catalog.regexp_replace(
            pg_catalog.upper(pg_catalog.btrim(duplicate_ref.card_identifier)),
            '[^A-Z0-9]',
            '',
            'g'
          ) = '4444'
      ) = 1
    from public.transactions as transaction_ref
    join public.asset_accounts as account_ref
      on account_ref.id = transaction_ref.asset_account_id
    join public.asset_events as event_ref
      on event_ref.id = transaction_ref.asset_event_id
    where transaction_ref.external_hash = 'mb-card-expense'
  ),
  'masked existing card is reused without creating a duplicate'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'MB',
      'card',
      400,
      '2026-07-12T00:20:00Z'::timestamptz,
      'MB card refund',
      'temporary-income',
      'income',
      'mb-card-refund',
      null,
      '**** 4444'
    )
  )->>'status',
  'inserted',
  'MB card refund reuses masked existing card'
);

select ok(
  (
    select account_ref.balance = -100
      and event_ref.type = 'card_refund'
      and event_ref.amount = -400
    from public.transactions as transaction_ref
    join public.asset_accounts as account_ref
      on account_ref.id = transaction_ref.asset_account_id
    join public.asset_events as event_ref
      on event_ref.id = transaction_ref.asset_event_id
    where transaction_ref.external_hash = 'mb-card-refund'
  ),
  'card refund decreases debt and permits negative overpayment'
);

select ok(
  (
    select result->>'status' = 'duplicate'
      and (result->>'transaction_id')::uuid = transaction_ref.id
      and (result->>'asset_account_id')::uuid = transaction_ref.asset_account_id
      and (result->>'asset_event_id')::uuid = transaction_ref.asset_event_id
    from (
      select public.ingest_bank_email_transaction(
        '00000000-0000-0000-0000-000000000201',
        'MB',
        'card',
        999,
        '2026-07-12T00:30:00Z'::timestamptz,
        'Duplicate payload drift',
        'shopping',
        'expense',
        'mb-card-expense',
        null,
        '9999'
      ) as result
    ) as ingest_call
    cross join public.transactions as transaction_ref
    where transaction_ref.external_hash = 'mb-card-expense'
  ),
  'duplicate returns original transaction, account, and event ids'
);

select ok(
  (
    select account_ref.balance = -100
      and transaction_ref.amount = 300
      and not exists (
        select 1
        from public.asset_accounts
        where user_id = transaction_ref.user_id
          and card_identifier = '9999'
      )
      and (
        select count(*)
        from public.asset_events
        where account_id = account_ref.id
      ) = 2
    from public.transactions as transaction_ref
    join public.asset_accounts as account_ref
      on account_ref.id = transaction_ref.asset_account_id
    where transaction_ref.external_hash = 'mb-card-expense'
  ),
  'duplicate has no account, balance, event, or payload side effect'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'MB',
      'card',
      10,
      '2026-07-12T00:31:00Z'::timestamptz,
      'Formatted card token',
      'shopping',
      'expense',
      'card-last4-formatted',
      null,
      '9704.05XX.XXXX.1234'
    )
  )->>'status',
  'inserted',
  'formatted masked card resolves by its final four digits'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'MB',
      'card',
      10,
      '2026-07-12T00:32:00Z'::timestamptz,
      'Masked card token',
      'shopping',
      'expense',
      'card-last4-masked',
      null,
      '**** 1234'
    )
  )->>'status',
  'inserted',
  'masked card resolves to the same final-four account'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'MB',
      'card',
      10,
      '2026-07-12T00:33:00Z'::timestamptz,
      'Full card token',
      'shopping',
      'expense',
      'card-last4-full-digits',
      null,
      '9704059999991234'
    )
  )->>'status',
  'inserted',
  'full card digits resolve to the same final-four account'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'MB',
      'card',
      10,
      '2026-07-12T00:34:00Z'::timestamptz,
      'Last-four card token',
      'shopping',
      'expense',
      'card-last4-short',
      null,
      '1234'
    )
  )->>'status',
  'inserted',
  'four card digits resolve to the same final-four account'
);

select ok(
  (
    select account_ref.balance = 40
      and (
        select count(*) = 4
          and pg_catalog.bool_and(
            transaction_ref.asset_account_id = account_ref.id
          )
        from public.transactions as transaction_ref
        where transaction_ref.external_hash like 'card-last4-%'
      )
      and (
        select count(*) = 4
          and pg_catalog.bool_and(
            event_ref.type = 'expense' and event_ref.amount = 10
          )
        from public.asset_events as event_ref
        where event_ref.account_id = account_ref.id
      )
      and (
        select count(*)
        from public.asset_accounts as duplicate_ref
        where duplicate_ref.user_id = account_ref.user_id
          and pg_catalog.upper(pg_catalog.btrim(duplicate_ref.bank)) = 'MB'
          and pg_catalog.right(pg_catalog.regexp_replace(
            pg_catalog.btrim(duplicate_ref.card_identifier),
            '[^0-9]',
            '',
            'g'
          ), 4) = '1234'
      ) = 1
    from public.asset_accounts as account_ref
    where account_ref.id = '10000000-0000-0000-0000-000000000209'
  ),
  'all card representations share one account with exact debt and events'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'MB',
      'transfer',
      100,
      '2026-07-12T01:00:00Z'::timestamptz,
      'Direction collision expense first',
      'others',
      'expense',
      'direction-collision-expense-first',
      'hash5555'
    )
  )->>'status',
  'inserted',
  'expense-first collision keeps the legacy external hash'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'MB',
      'transfer',
      100,
      '2026-07-12T01:00:00Z'::timestamptz,
      'Direction collision expense first',
      'temporary-income',
      'income',
      'direction-collision-expense-first',
      'hash5555'
    )
  )->>'status',
  'inserted',
  'income second uses a deterministic alternate external hash'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'MB',
      'transfer',
      100,
      '2026-07-12T01:00:00Z'::timestamptz,
      'Direction collision expense first',
      'others',
      'expense',
      'direction-collision-expense-first',
      'hash5555'
    )
  )->>'status',
  'duplicate',
  'expense-first legacy row remains idempotent on retry'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'MB',
      'transfer',
      100,
      '2026-07-12T01:00:00Z'::timestamptz,
      'Direction collision expense first',
      'temporary-income',
      'income',
      'direction-collision-expense-first',
      'hash5555'
    )
  )->>'status',
  'duplicate',
  'expense-first alternate row remains idempotent on retry'
);

select ok(
  (
    select account_ref.balance = 1000
      and (
        select count(*) = 2
          and pg_catalog.bool_and(
            (transaction_ref.direction = 'expense'
              and transaction_ref.external_hash = 'direction-collision-expense-first')
            or (transaction_ref.direction = 'income'
              and transaction_ref.external_hash = 'direction-collision-expense-first:direction:income')
          )
        from public.transactions as transaction_ref
        where transaction_ref.external_hash in (
          'direction-collision-expense-first',
          'direction-collision-expense-first:direction:income'
        )
      )
      and (
        select count(*) = 2
          and pg_catalog.sum(event_ref.amount) = 0
        from public.asset_events as event_ref
        join public.transactions as transaction_ref
          on transaction_ref.id = event_ref.transaction_id
        where transaction_ref.external_hash in (
          'direction-collision-expense-first',
          'direction-collision-expense-first:direction:income'
        )
      )
    from public.asset_accounts as account_ref
    where account_ref.id = '10000000-0000-0000-0000-000000000210'
  ),
  'expense-first collision stores both directions once with exact net balance'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'MB',
      'transfer',
      70,
      '2026-07-12T01:10:00Z'::timestamptz,
      'Direction collision income first',
      'temporary-income',
      'income',
      'direction-collision-income-first',
      'hash5555'
    )
  )->>'status',
  'inserted',
  'income-first collision keeps the legacy external hash'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'MB',
      'transfer',
      70,
      '2026-07-12T01:10:00Z'::timestamptz,
      'Direction collision income first',
      'others',
      'expense',
      'direction-collision-income-first',
      'hash5555'
    )
  )->>'status',
  'inserted',
  'expense second uses a deterministic alternate external hash'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'MB',
      'transfer',
      70,
      '2026-07-12T01:10:00Z'::timestamptz,
      'Direction collision income first',
      'temporary-income',
      'income',
      'direction-collision-income-first',
      'hash5555'
    )
  )->>'status',
  'duplicate',
  'income-first legacy row remains idempotent on retry'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'MB',
      'transfer',
      70,
      '2026-07-12T01:10:00Z'::timestamptz,
      'Direction collision income first',
      'others',
      'expense',
      'direction-collision-income-first',
      'hash5555'
    )
  )->>'status',
  'duplicate',
  'income-first alternate row remains idempotent on retry'
);

select ok(
  (
    select account_ref.balance = 1000
      and (
        select count(*) = 2
          and pg_catalog.bool_and(
            (transaction_ref.direction = 'income'
              and transaction_ref.external_hash = 'direction-collision-income-first')
            or (transaction_ref.direction = 'expense'
              and transaction_ref.external_hash = 'direction-collision-income-first:direction:expense')
          )
        from public.transactions as transaction_ref
        where transaction_ref.external_hash in (
          'direction-collision-income-first',
          'direction-collision-income-first:direction:expense'
        )
      )
      and (
        select count(*) = 4
          and pg_catalog.sum(event_ref.amount) = 0
        from public.asset_events as event_ref
        where event_ref.account_id = account_ref.id
      )
    from public.asset_accounts as account_ref
    where account_ref.id = '10000000-0000-0000-0000-000000000210'
  ),
  'income-first collision stores both directions once and retries have no effect'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'MB',
      'transfer',
      10,
      '2026-07-12T00:40:00Z'::timestamptz,
      'Cross-user account identifier',
      'others',
      'expense',
      'cross-user-account',
      'cross1234'
    )
  )->>'status',
  'inserted',
  'other user identifier does not block per-user auto-create'
);

select ok(
  (
    select count(*) = 2
      and pg_catalog.bool_and(
        case account_ref.user_id
          when '00000000-0000-0000-0000-000000000201' then account_ref.balance = -10
          when '00000000-0000-0000-0000-000000000202' then account_ref.balance = 999
          else false
        end
      )
    from public.asset_accounts as account_ref
    where pg_catalog.upper(pg_catalog.btrim(account_ref.bank)) = 'MB'
      and pg_catalog.regexp_replace(
        pg_catalog.upper(pg_catalog.btrim(account_ref.account_identifier)),
        '[^A-Z0-9]',
        '',
        'g'
      ) = 'CROSS1234'
  ),
  'canonical identifier matching and balances remain isolated per user'
);

select throws_ok(
  $test$
    select public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'MB',
      'transfer',
      7,
      '2026-07-12T00:50:00Z'::timestamptz,
      'Invalid account rollback',
      'others',
      'expense',
      'invalid-account-rollback',
      'bad asset'
    )
  $test$,
  '22023',
  'Matched asset account is not a valid owned VND bank account',
  'invalid canonical match rolls back the entire ingest'
);

select ok(
  (
    select account_ref.balance = 500
      and not exists (
        select 1
        from public.transactions
        where external_hash = 'invalid-account-rollback'
      )
      and not exists (
        select 1
        from public.asset_events
        where account_id = account_ref.id
      )
    from public.asset_accounts as account_ref
    where account_ref.id = '10000000-0000-0000-0000-000000000203'
  ),
  'invalid account error rolls back transaction, event, and balance effects'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'ACB',
      'balance_alert',
      1,
      '2026-07-20T12:00:00Z'::timestamptz,
      'Chronology primary snapshot',
      'others',
      'expense',
      'chronology-primary-snapshot',
      'chrono upd 9001',
      null,
      1000
    )
  )->>'status',
  'inserted',
  'chronology primary account receives an exact snapshot'
);

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000201',
      'ACB',
      'balance_alert',
      1,
      '2026-07-20T12:00:00Z'::timestamptz,
      'Chronology transfer peer snapshot',
      'others',
      'expense',
      'chronology-peer-snapshot',
      'chrono xfer 9002',
      null,
      2000
    )
  )->>'status',
  'inserted',
  'chronology transfer peer receives an exact snapshot'
);

select ok(
  (
    select pg_catalog.array_agg(account_ref.balance order by account_ref.id)
      = array[1000::numeric, 2000::numeric]
      and (
        select count(*) = 2
          and pg_catalog.array_agg(
            event_ref.balance_after order by event_ref.account_id
          ) = array[1000::numeric, 2000::numeric]
          and pg_catalog.bool_and(
            event_ref.type = 'bank_email_sync'
            and event_ref.occurred_at = '2026-07-20T12:00:00Z'::timestamptz
          )
        from public.asset_events as event_ref
        where event_ref.account_id in (
          '10000000-0000-0000-0000-000000000211',
          '10000000-0000-0000-0000-000000000212'
        )
      )
    from public.asset_accounts as account_ref
    where account_ref.id in (
      '10000000-0000-0000-0000-000000000211',
      '10000000-0000-0000-0000-000000000212'
    )
  ),
  'isolated chronology accounts begin at their exact snapshot balances'
);

reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000201';
set local role authenticated;

select lives_ok(
  $test$
    select public.save_transaction_with_asset_effect(
      100,
      'VND',
      '2026-07-20T11:00:00Z'::timestamptz,
      'expense',
      'others',
      'manual',
      '40000000-0000-0000-0000-000000000201',
      '10000000-0000-0000-0000-000000000211',
      null,
      'Mutable chronology transaction',
      null
    )
  $test$,
  'mutable event before the snapshot is recorded without affecting balance'
);

select ok(
  (
    select account_ref.balance = 1000
      and event_ref.type = 'expense'
      and event_ref.amount = -100
      and event_ref.occurred_at = '2026-07-20T11:00:00Z'::timestamptz
      and event_ref.balance_after is null
    from public.transactions as transaction_ref
    join public.asset_accounts as account_ref
      on account_ref.id = transaction_ref.asset_account_id
    join public.asset_events as event_ref
      on event_ref.id = transaction_ref.asset_event_id
    where transaction_ref.external_hash =
      'manual:40000000-0000-0000-0000-000000000201'
  ),
  'before-snapshot mutable event remains linked with an exact neutral balance'
);

select lives_ok(
  $test$
    select public.update_transaction_with_asset_effect(
      (
        select id
        from public.transactions
        where external_hash =
          'manual:40000000-0000-0000-0000-000000000201'
      ),
      100,
      '2026-07-20T13:00:00Z'::timestamptz,
      'Mutable chronology transaction',
      'others',
      null,
      true,
      null,
      'Moved after snapshot'
    )
  $test$,
  'mutable event can move from before to after the latest snapshot'
);

select ok(
  (
    select account_ref.balance = 900
      and transaction_ref.transaction_time =
        '2026-07-20T13:00:00Z'::timestamptz
      and event_ref.amount = -100
      and event_ref.occurred_at = '2026-07-20T13:00:00Z'::timestamptz
      and (
        select count(*)
        from public.asset_events as duplicate_ref
        where duplicate_ref.transaction_id = transaction_ref.id
      ) = 1
    from public.transactions as transaction_ref
    join public.asset_accounts as account_ref
      on account_ref.id = transaction_ref.asset_account_id
    join public.asset_events as event_ref
      on event_ref.id = transaction_ref.asset_event_id
    where transaction_ref.external_hash =
      'manual:40000000-0000-0000-0000-000000000201'
  ),
  'moving a mutable event after the snapshot applies exactly one delta'
);

select lives_ok(
  $test$
    select public.update_transaction_with_asset_effect(
      (
        select id
        from public.transactions
        where external_hash =
          'manual:40000000-0000-0000-0000-000000000201'
      ),
      100,
      '2026-07-20T11:30:00Z'::timestamptz,
      'Mutable chronology transaction',
      'others',
      null,
      true,
      null,
      'Moved before snapshot again'
    )
  $test$,
  'mutable event can move back from after to before the latest snapshot'
);

select ok(
  (
    select account_ref.balance = 1000
      and transaction_ref.transaction_time =
        '2026-07-20T11:30:00Z'::timestamptz
      and event_ref.amount = -100
      and event_ref.occurred_at = '2026-07-20T11:30:00Z'::timestamptz
      and (
        select count(*)
        from public.asset_events as duplicate_ref
        where duplicate_ref.transaction_id = transaction_ref.id
      ) = 1
    from public.transactions as transaction_ref
    join public.asset_accounts as account_ref
      on account_ref.id = transaction_ref.asset_account_id
    join public.asset_events as event_ref
      on event_ref.id = transaction_ref.asset_event_id
    where transaction_ref.external_hash =
      'manual:40000000-0000-0000-0000-000000000201'
  ),
  'moving a mutable event back before the snapshot removes its current delta'
);

select lives_ok(
  $test$
    select public.save_transaction_with_asset_effect(
      30,
      'VND',
      '2026-07-20T10:00:00Z'::timestamptz,
      'expense',
      'others',
      'manual',
      '40000000-0000-0000-0000-000000000202',
      '10000000-0000-0000-0000-000000000211',
      null,
      'Delete before snapshot',
      null
    )
  $test$,
  'delete-before fixture is recorded without changing current balance'
);

select ok(
  (
    select account_ref.balance = 1000
      and event_ref.amount = -30
      and event_ref.occurred_at = '2026-07-20T10:00:00Z'::timestamptz
    from public.transactions as transaction_ref
    join public.asset_accounts as account_ref
      on account_ref.id = transaction_ref.asset_account_id
    join public.asset_events as event_ref
      on event_ref.id = transaction_ref.asset_event_id
    where transaction_ref.external_hash =
      'manual:40000000-0000-0000-0000-000000000202'
  ),
  'delete-before fixture has an exact neutralized event'
);

select lives_ok(
  $test$
    select public.delete_transaction_with_asset_effect(
      (
        select id
        from public.transactions
        where external_hash =
          'manual:40000000-0000-0000-0000-000000000202'
      )
    )
  $test$,
  'deleting a mutable event before the snapshot succeeds'
);

select ok(
  (
    select account_ref.balance = 1000
      and not exists (
        select 1
        from public.transactions
        where external_hash =
          'manual:40000000-0000-0000-0000-000000000202'
      )
      and (
        select count(*)
        from public.asset_events as event_ref
        where event_ref.account_id = account_ref.id
          and event_ref.type <> 'bank_email_sync'
      ) = 1
    from public.asset_accounts as account_ref
    where account_ref.id = '10000000-0000-0000-0000-000000000211'
  ),
  'deleting a before-snapshot event removes it without reversing balance'
);

select lives_ok(
  $test$
    select public.save_transaction_with_asset_effect(
      40,
      'VND',
      '2026-07-20T14:00:00Z'::timestamptz,
      'expense',
      'others',
      'manual',
      '40000000-0000-0000-0000-000000000203',
      '10000000-0000-0000-0000-000000000211',
      null,
      'Delete after snapshot',
      null
    )
  $test$,
  'delete-after fixture applies its current delta'
);

select ok(
  (
    select account_ref.balance = 960
      and event_ref.amount = -40
      and event_ref.occurred_at = '2026-07-20T14:00:00Z'::timestamptz
    from public.transactions as transaction_ref
    join public.asset_accounts as account_ref
      on account_ref.id = transaction_ref.asset_account_id
    join public.asset_events as event_ref
      on event_ref.id = transaction_ref.asset_event_id
    where transaction_ref.external_hash =
      'manual:40000000-0000-0000-0000-000000000203'
  ),
  'delete-after fixture has an exact applied event'
);

select lives_ok(
  $test$
    select public.delete_transaction_with_asset_effect(
      (
        select id
        from public.transactions
        where external_hash =
          'manual:40000000-0000-0000-0000-000000000203'
      )
    )
  $test$,
  'deleting a mutable event after the snapshot succeeds'
);

select ok(
  (
    select account_ref.balance = 1000
      and not exists (
        select 1
        from public.transactions
        where external_hash =
          'manual:40000000-0000-0000-0000-000000000203'
      )
      and (
        select count(*)
        from public.asset_events as event_ref
        where event_ref.account_id = account_ref.id
          and event_ref.type <> 'bank_email_sync'
      ) = 1
    from public.asset_accounts as account_ref
    where account_ref.id = '10000000-0000-0000-0000-000000000211'
  ),
  'deleting an after-snapshot event reverses exactly its applied delta'
);

select lives_ok(
  $test$
    select public.save_asset_transfer(
      '10000000-0000-0000-0000-000000000211',
      '10000000-0000-0000-0000-000000000212',
      100,
      'VND',
      '2026-07-20T11:00:00Z'::timestamptz,
      '40000000-0000-0000-0000-000000000204',
      'Transfer before snapshots'
    )
  $test$,
  'transfer before both snapshots is recorded'
);

select ok(
  (
    select pg_catalog.array_agg(account_ref.balance order by account_ref.id)
      = array[1000::numeric, 2000::numeric]
      and (
        select count(*) = 2
          and pg_catalog.sum(event_ref.amount) = 0
          and pg_catalog.array_agg(
            event_ref.amount order by event_ref.account_id
          ) = array[-100::numeric, 100::numeric]
          and pg_catalog.bool_and(
            event_ref.occurred_at = '2026-07-20T11:00:00Z'::timestamptz
            and event_ref.type in ('transfer_out', 'transfer_in')
          )
        from public.asset_events as event_ref
        where event_ref.account_id in (
          '10000000-0000-0000-0000-000000000211',
          '10000000-0000-0000-0000-000000000212'
        )
          and event_ref.counterparty_account_id is not null
          and event_ref.occurred_at = '2026-07-20T11:00:00Z'::timestamptz
      )
    from public.asset_accounts as account_ref
    where account_ref.id in (
      '10000000-0000-0000-0000-000000000211',
      '10000000-0000-0000-0000-000000000212'
    )
  ),
  'before-snapshot transfer keeps balances exact while retaining both events'
);

select lives_ok(
  $test$
    select public.save_asset_transfer(
      '10000000-0000-0000-0000-000000000211',
      '10000000-0000-0000-0000-000000000212',
      150,
      'VND',
      '2026-07-20T13:00:00Z'::timestamptz,
      '40000000-0000-0000-0000-000000000205',
      'Transfer after snapshots'
    )
  $test$,
  'transfer after both snapshots is recorded'
);

select ok(
  (
    select pg_catalog.array_agg(account_ref.balance order by account_ref.id)
      = array[850::numeric, 2150::numeric]
      and (
        select count(*) = 2
          and pg_catalog.sum(event_ref.amount) = 0
          and pg_catalog.array_agg(
            event_ref.amount order by event_ref.account_id
          ) = array[-150::numeric, 150::numeric]
          and pg_catalog.bool_and(
            event_ref.occurred_at = '2026-07-20T13:00:00Z'::timestamptz
            and event_ref.type in ('transfer_out', 'transfer_in')
          )
        from public.asset_events as event_ref
        where event_ref.account_id in (
          '10000000-0000-0000-0000-000000000211',
          '10000000-0000-0000-0000-000000000212'
        )
          and event_ref.counterparty_account_id is not null
          and event_ref.occurred_at = '2026-07-20T13:00:00Z'::timestamptz
      )
      and (
        select count(*)
        from public.asset_events as event_ref
        where event_ref.account_id =
          '10000000-0000-0000-0000-000000000211'
      ) = 4
      and (
        select count(*)
        from public.asset_events as event_ref
        where event_ref.account_id =
          '10000000-0000-0000-0000-000000000212'
      ) = 3
    from public.asset_accounts as account_ref
    where account_ref.id in (
      '10000000-0000-0000-0000-000000000211',
      '10000000-0000-0000-0000-000000000212'
    )
  ),
  'after-snapshot transfer applies both deltas and preserves exact event counts'
);

reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000202';
set local role authenticated;

select lives_ok(
  $test$
    select public.save_transaction_with_asset_effect(
      40,
      'VND',
      '2026-07-21T10:00:00Z'::timestamptz,
      'expense',
      'others',
      'manual',
      '50000000-0000-0000-0000-000000000201',
      '10000000-0000-0000-0000-000000000204',
      null,
      'Foreign security fixture',
      null
    )
  $test$,
  'foreign transaction fixture is created through the authenticated save RPC'
);

reset role;

create temporary table cross_user_rpc_fixture (
  transaction_id uuid primary key
) on commit drop;

insert into cross_user_rpc_fixture (transaction_id)
select transaction_ref.id
from public.transactions as transaction_ref
where transaction_ref.external_hash =
  'manual:50000000-0000-0000-0000-000000000201';

grant select on table cross_user_rpc_fixture to authenticated;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000201';
set local role authenticated;

select throws_ok(
  $test$
    select public.update_transaction_with_asset_effect(
      (
        select transaction_id
        from cross_user_rpc_fixture
      ),
      41,
      '2026-07-21T11:00:00Z'::timestamptz,
      'Attempted foreign update',
      'others',
      null,
      true,
      null,
      'Attempted foreign update'
    )
  $test$,
  '42501',
  'Transaction not found or not owned by the authenticated user',
  'security-definer update cannot mutate another user transaction'
);

select lives_ok(
  $test$
    select public.delete_transaction_with_asset_effect(
      (
        select transaction_id
        from cross_user_rpc_fixture
      )
    )
  $test$,
  'security-definer delete treats another user transaction as a no-op'
);

select throws_ok(
  $test$
    select public.save_transaction_with_asset_effect(
      5,
      'VND',
      '2026-07-21T12:00:00Z'::timestamptz,
      'expense',
      'others',
      'manual',
      '50000000-0000-0000-0000-000000000202',
      '10000000-0000-0000-0000-000000000204',
      null,
      'Attempted foreign save',
      null
    )
  $test$,
  '42501',
  'Asset account not found or not owned by the authenticated user',
  'security-definer save cannot apply an effect to another user account'
);

select throws_ok(
  $test$
    select public.save_asset_transfer(
      '10000000-0000-0000-0000-000000000211',
      '10000000-0000-0000-0000-000000000204',
      5,
      'VND',
      '2026-07-21T13:00:00Z'::timestamptz,
      '50000000-0000-0000-0000-000000000203',
      'Attempted foreign transfer'
    )
  $test$,
  '42501',
  'Target account not found or not owned by the authenticated user',
  'security-definer transfer cannot target another user account'
);

reset role;

select ok(
  (
    select account_ref.balance = 959
      and transaction_ref.amount = 40
      and transaction_ref.transaction_time =
        '2026-07-21T10:00:00Z'::timestamptz
      and event_ref.amount = -40
      and event_ref.occurred_at = '2026-07-21T10:00:00Z'::timestamptz
      and (
        select count(*)
        from public.asset_events as duplicate_ref
        where duplicate_ref.account_id = account_ref.id
      ) = 1
      and (
        select balance
        from public.asset_accounts
        where id = '10000000-0000-0000-0000-000000000211'
      ) = 850
      and (
        select count(*)
        from public.asset_events
        where account_id = '10000000-0000-0000-0000-000000000211'
      ) = 4
      and not exists (
        select 1
        from public.transactions
        where operation_id =
          '50000000-0000-0000-0000-000000000202'
      )
      and not exists (
        select 1
        from public.asset_transaction_operations
        where user_id = '00000000-0000-0000-0000-000000000201'
          and operation_id =
            '50000000-0000-0000-0000-000000000202'
      )
      and not exists (
        select 1
        from public.asset_transfer_operations
        where user_id = '00000000-0000-0000-0000-000000000201'
          and operation_id =
            '50000000-0000-0000-0000-000000000203'
      )
    from public.transactions as transaction_ref
    join public.asset_accounts as account_ref
      on account_ref.id = transaction_ref.asset_account_id
    join public.asset_events as event_ref
      on event_ref.id = transaction_ref.asset_event_id
    where transaction_ref.external_hash =
      'manual:50000000-0000-0000-0000-000000000201'
  ),
  'cross-user RPC attempts leave foreign and caller transactions, events, and balances unchanged'
);

set local role service_role;

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000203',
      'ACB',
      'balance_alert',
      1,
      '2026-07-12T01:00:00Z'::timestamptz,
      'Account cascade snapshot',
      'others',
      'expense',
      'account-cascade-snapshot',
      'cascade-3333',
      null,
      100
    )
  )->>'status',
  'inserted',
  'snapshot fixture for account cascade is created'
);

reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000203';
set local role authenticated;

select lives_ok(
  $test$
    delete from public.asset_accounts
    where user_id = '00000000-0000-0000-0000-000000000203'
      and account_identifier = 'CASCADE3333'
  $test$,
  'deleting an account with a snapshot is not blocked by event triggers'
);

reset role;

select ok(
  (
    select transaction_ref.asset_account_id is null
      and transaction_ref.asset_event_id is null
      and not exists (
        select 1
        from public.asset_accounts
        where user_id = transaction_ref.user_id
      )
      and not exists (
        select 1
        from public.asset_events
        where user_id = transaction_ref.user_id
      )
    from public.transactions as transaction_ref
    where transaction_ref.external_hash = 'account-cascade-snapshot'
  ),
  'account cascade removes snapshot event and clears transaction links'
);

set local role service_role;

select is(
  (
    public.ingest_bank_email_transaction(
      '00000000-0000-0000-0000-000000000204',
      'ACB',
      'balance_alert',
      1,
      '2026-07-12T01:10:00Z'::timestamptz,
      'User cascade snapshot',
      'others',
      'expense',
      'user-cascade-snapshot',
      'cascade-4444',
      null,
      200
    )
  )->>'status',
  'inserted',
  'snapshot fixture for user cascade is created'
);

reset role;

select lives_ok(
  $test$
    delete from auth.users
    where id = '00000000-0000-0000-0000-000000000204'
  $test$,
  'deleting a user with snapshot assets is not blocked by event triggers'
);

select ok(
  not exists (
    select 1
    from auth.users
    where id = '00000000-0000-0000-0000-000000000204'
  )
  and not exists (
    select 1
    from public.transactions
    where user_id = '00000000-0000-0000-0000-000000000204'
  )
  and not exists (
    select 1
    from public.asset_accounts
    where user_id = '00000000-0000-0000-0000-000000000204'
  )
  and not exists (
    select 1
    from public.asset_events
    where user_id = '00000000-0000-0000-0000-000000000204'
  ),
  'user cascade removes transactions, accounts, and snapshot events'
);

select * from finish();
rollback;

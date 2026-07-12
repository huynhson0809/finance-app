begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(51);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint as constraint_ref
    join pg_catalog.pg_index as index_ref
      on index_ref.indexrelid = constraint_ref.conindid
    where constraint_ref.conrelid = 'public.asset_rates'::regclass
      and constraint_ref.conname = 'asset_rates_user_id_pair_key'
      and constraint_ref.contype = 'u'
      and index_ref.indnullsnotdistinct
  ),
  'rate scope uniqueness uses a named NULLS NOT DISTINCT constraint'
);

select ok(
  not exists (
    select 1
    from public.asset_rates as rate
    where rate.source is distinct from case
      when rate.user_id is null then 'auto'
      else 'manual'
    end
  ),
  'migration cleanup normalized rate source to its ownership scope'
);

select ok(
  not exists (
    select 1
    from public.asset_rates as rate
    where rate.value <= 0
      or rate.value in (
        'Infinity'::numeric,
        '-Infinity'::numeric,
        'NaN'::numeric
      )
  ),
  'migration cleanup removed non-positive and non-finite rates'
);

select ok(
  not exists (
    select 1
    from public.asset_rates as rate
    group by rate.user_id, rate.pair
    having count(*) > 1
  ),
  'migration cleanup removed duplicate rates in each ownership scope'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_class as table_ref
    where table_ref.oid in (
      'public.asset_rates'::regclass,
      'public.asset_rate_refresh_state'::regclass
    )
      and table_ref.relrowsecurity
  ),
  2::bigint,
  'rate cache and private refresh state both enforce RLS'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_proc as procedure_ref
    where procedure_ref.oid in (
      pg_catalog.to_regprocedure(
        'public.claim_asset_rate_refresh(text,integer,integer,timestamp with time zone)'
      ),
      pg_catalog.to_regprocedure(
        'public.complete_asset_rate_refresh(text,numeric,timestamp with time zone,uuid,integer,timestamp with time zone)'
      ),
      pg_catalog.to_regprocedure(
        'public.fail_asset_rate_refresh(text,uuid,integer,timestamp with time zone)'
      )
    )
      and procedure_ref.prosecdef
      and exists (
        select 1
        from unnest(procedure_ref.proconfig) as setting(value)
        where setting.value like 'search_path=%'
      )
  ),
  3::bigint,
  'all refresh RPCs are fixed-path security definers'
);

select is(
  (
    select count(*)
    from unnest(array[
      'public.claim_asset_rate_refresh(text,integer,integer,timestamp with time zone)',
      'public.complete_asset_rate_refresh(text,numeric,timestamp with time zone,uuid,integer,timestamp with time zone)',
      'public.fail_asset_rate_refresh(text,uuid,integer,timestamp with time zone)'
    ]) as function_ref(signature)
    where pg_catalog.has_function_privilege(
        'service_role',
        function_ref.signature,
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'authenticated',
        function_ref.signature,
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'anon',
        function_ref.signature,
        'EXECUTE'
      )
  ),
  3::bigint,
  'refresh RPC execution is restricted to the service role'
);

select ok(
  not pg_catalog.has_table_privilege(
    'service_role',
    'public.asset_rate_refresh_state',
    'SELECT'
  )
  and not pg_catalog.has_table_privilege(
    'service_role',
    'public.asset_rate_refresh_state',
    'INSERT'
  )
  and not pg_catalog.has_table_privilege(
    'service_role',
    'public.asset_rate_refresh_state',
    'UPDATE'
  )
  and not pg_catalog.has_table_privilege(
    'service_role',
    'public.asset_rate_refresh_state',
    'DELETE'
  )
  and not pg_catalog.has_table_privilege(
    'authenticated',
    'public.asset_rate_refresh_state',
    'SELECT'
  )
  and not pg_catalog.has_table_privilege(
    'anon',
    'public.asset_rate_refresh_state',
    'SELECT'
  ),
  'refresh lease state has no direct API role privileges'
);

select ok(
  pg_catalog.has_table_privilege(
    'service_role',
    'public.asset_rates',
    'SELECT'
  )
  and not pg_catalog.has_table_privilege(
    'service_role',
    'public.asset_rates',
    'INSERT'
  )
  and not pg_catalog.has_table_privilege(
    'service_role',
    'public.asset_rates',
    'UPDATE'
  )
  and not pg_catalog.has_table_privilege(
    'service_role',
    'public.asset_rates',
    'DELETE'
  ),
  'service role can read rates but must use the monotonic RPC to write them'
);

select ok(
  pg_catalog.has_table_privilege(
    'authenticated',
    'public.asset_rates',
    'SELECT'
  )
  and pg_catalog.has_table_privilege(
    'authenticated',
    'public.asset_rates',
    'INSERT'
  )
  and pg_catalog.has_table_privilege(
    'authenticated',
    'public.asset_rates',
    'UPDATE'
  )
  and pg_catalog.has_table_privilege(
    'authenticated',
    'public.asset_rates',
    'DELETE'
  ),
  'authenticated retains RLS-filtered manual rate DML'
);

delete from public.asset_rate_refresh_state;
delete from public.asset_rates;

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
    '00000000-0000-0000-0000-000000000301',
    'authenticated',
    'authenticated',
    'asset-rate-a@example.com',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000302',
    'authenticated',
    'authenticated',
    'asset-rate-b@example.com',
    now(),
    now()
  );

create temporary table asset_rate_test_tokens (
  label text primary key,
  token uuid
);
grant select, insert, update, delete on table asset_rate_test_tokens to service_role;

set local role service_role;

select throws_ok(
  $test$
    insert into public.asset_rates (user_id, pair, value, source, fetched_at)
    values (null, 'USD_VND', 25000, 'auto', now())
  $test$,
  '42501',
  'permission denied for table asset_rates',
  'service role cannot bypass the monotonic RPC with direct DML'
);

reset role;

select throws_ok(
  $test$
    insert into public.asset_rates (user_id, pair, value, source, fetched_at)
    values (null, 'GOLD_GRAM_VND', 2000000, 'manual', now())
  $test$,
  '23514',
  'new row for relation "asset_rates" violates check constraint "asset_rates_scope_source_check"',
  'global manual rates violate the scope and source check'
);

select throws_ok(
  $test$
    insert into public.asset_rates (user_id, pair, value, source, fetched_at)
    values (
      '00000000-0000-0000-0000-000000000301',
      'GOLD_GRAM_VND',
      2000000,
      'auto',
      now()
    )
  $test$,
  '23514',
  'new row for relation "asset_rates" violates check constraint "asset_rates_scope_source_check"',
  'per-user automatic rates violate the scope and source check'
);

select throws_ok(
  $test$
    insert into public.asset_rates (user_id, pair, value, source, fetched_at)
    values (null, 'GOLD_GRAM_VND', 0, 'auto', now())
  $test$,
  '23514',
  'new row for relation "asset_rates" violates check constraint "asset_rates_value_finite_positive_check"',
  'zero rates are rejected'
);

select throws_ok(
  $test$
    insert into public.asset_rates (user_id, pair, value, source, fetched_at)
    values (null, 'GOLD_GRAM_VND', -1, 'auto', now())
  $test$,
  '23514',
  'new row for relation "asset_rates" violates check constraint "asset_rates_value_finite_positive_check"',
  'negative rates are rejected'
);

select throws_ok(
  $test$
    insert into public.asset_rates (user_id, pair, value, source, fetched_at)
    values (null, 'GOLD_GRAM_VND', 'Infinity'::numeric, 'auto', now())
  $test$,
  '23514',
  'new row for relation "asset_rates" violates check constraint "asset_rates_value_finite_positive_check"',
  'positive infinity rates are rejected'
);

select throws_ok(
  $test$
    insert into public.asset_rates (user_id, pair, value, source, fetched_at)
    values (null, 'GOLD_GRAM_VND', '-Infinity'::numeric, 'auto', now())
  $test$,
  '23514',
  'new row for relation "asset_rates" violates check constraint "asset_rates_value_finite_positive_check"',
  'negative infinity rates are rejected'
);

select throws_ok(
  $test$
    insert into public.asset_rates (user_id, pair, value, source, fetched_at)
    values (null, 'GOLD_GRAM_VND', 'NaN'::numeric, 'auto', now())
  $test$,
  '23514',
  'new row for relation "asset_rates" violates check constraint "asset_rates_value_finite_positive_check"',
  'NaN rates are rejected'
);

set local role service_role;

insert into asset_rate_test_tokens (label, token)
values (
  'usd_initial',
  public.claim_asset_rate_refresh(
    'USD_VND',
    0,
    5,
    '2026-07-12T08:00:00Z'::timestamptz
  )
);

select ok(
  (select token is not null from asset_rate_test_tokens where label = 'usd_initial'),
  'the first stale caller claims a pair'
);

select is(
  public.claim_asset_rate_refresh(
    'USD_VND',
    0,
    5,
    '2026-07-12T08:00:00Z'::timestamptz
  ),
  null::uuid,
  'a second caller cannot claim an active lease'
);

insert into asset_rate_test_tokens (label, token)
values (
  'usd_after_expiry',
  public.claim_asset_rate_refresh(
    'USD_VND',
    0,
    5,
    '2026-07-12T08:00:06Z'::timestamptz
  )
);

select isnt(
  (select token from asset_rate_test_tokens where label = 'usd_after_expiry'),
  (select token from asset_rate_test_tokens where label = 'usd_initial'),
  'a caller obtains a new token after lease expiry'
);

select ok(
  (
    select completion.stored
    from public.complete_asset_rate_refresh(
      'USD_VND',
      26100,
      '2026-07-10T07:30:00Z'::timestamptz,
      (select token from asset_rate_test_tokens where label = 'usd_after_expiry'),
      10,
      '2026-07-12T08:00:07Z'::timestamptz
    ) as completion
  ),
  'the current lease token stores a provider result'
);

select ok(
  not (
    select completion.stored
    from public.complete_asset_rate_refresh(
      'USD_VND',
      25000,
      '2026-07-09T07:30:00Z'::timestamptz,
      (select token from asset_rate_test_tokens where label = 'usd_initial'),
      10,
      '2026-07-12T08:00:08Z'::timestamptz
    ) as completion
  ),
  'a late completion from an expired owner is reported as cached'
);

select is(
  (
    select rate.value
    from public.asset_rates as rate
    where rate.user_id is null and rate.pair = 'USD_VND'
  ),
  26100::numeric,
  'a late older completion cannot overwrite the newer value'
);

select is(
  (
    select rate.fetched_at
    from public.asset_rates as rate
    where rate.user_id is null and rate.pair = 'USD_VND'
  ),
  '2026-07-10T07:30:00Z'::timestamptz,
  'a late older completion cannot move fetched_at backward'
);

select is(
  (
    select rate.updated_at
    from public.asset_rates as rate
    where rate.user_id is null and rate.pair = 'USD_VND'
  ),
  '2026-07-12T08:00:07Z'::timestamptz,
  'a rejected late completion cannot refresh cache storage time'
);

select is(
  public.claim_asset_rate_refresh(
    'USD_VND',
    60,
    5,
    '2026-07-12T08:00:30Z'::timestamptz
  ),
  null::uuid,
  'claim freshness uses recent updated_at despite an old provider quote time'
);

insert into asset_rate_test_tokens (label, token)
values (
  'usd_at_ttl_boundary',
  public.claim_asset_rate_refresh(
    'USD_VND',
    60,
    5,
    '2026-07-12T08:01:07Z'::timestamptz
  )
);

select ok(
  (select token is not null from asset_rate_test_tokens where label = 'usd_at_ttl_boundary'),
  'a cache entry becomes claimable at the updated_at TTL boundary'
);

select ok(
  not (
    select completion.stored
    from public.complete_asset_rate_refresh(
      'USD_VND',
      25900,
      '2026-07-09T08:00:00Z'::timestamptz,
      (select token from asset_rate_test_tokens where label = 'usd_at_ttl_boundary'),
      10,
      '2026-07-12T08:01:08Z'::timestamptz
    ) as completion
  ),
  'a current owner cannot store a provider quote older than fetched_at'
);

select ok(
  (
    select rate.value = 26100
      and rate.fetched_at = '2026-07-10T07:30:00Z'::timestamptz
      and rate.updated_at = '2026-07-12T08:00:07Z'::timestamptz
    from public.asset_rates as rate
    where rate.user_id is null and rate.pair = 'USD_VND'
  ),
  'a rejected older quote preserves value, metadata, and storage freshness'
);

insert into asset_rate_test_tokens (label, token)
values (
  'usd_future_quote',
  public.claim_asset_rate_refresh(
    'USD_VND',
    0,
    5,
    '2026-07-12T08:02:00Z'::timestamptz
  )
);

select throws_ok(
  $test$
    select *
    from public.complete_asset_rate_refresh(
      'USD_VND',
      27000,
      '2026-07-12T08:07:01Z'::timestamptz,
      (select token from asset_rate_test_tokens where label = 'usd_future_quote'),
      10,
      '2026-07-12T08:02:00Z'::timestamptz
    )
  $test$,
  '22023',
  'asset rate provider timestamp too far in future',
  'completion rejects a provider timestamp beyond the maximum future skew'
);

insert into asset_rate_test_tokens (label, token)
values (
  'gold_initial',
  public.claim_asset_rate_refresh(
    'GOLD_GRAM_VND',
    0,
    5,
    '2026-07-12T09:00:00Z'::timestamptz
  )
);

select ok(
  (select token is not null from asset_rate_test_tokens where label = 'gold_initial'),
  'a different pair has an independent refresh claim'
);

select ok(
  public.fail_asset_rate_refresh(
    'GOLD_GRAM_VND',
    (select token from asset_rate_test_tokens where label = 'gold_initial'),
    10,
    '2026-07-12T09:00:01Z'::timestamptz
  ),
  'the current owner can release a failed refresh into backoff'
);

select is(
  public.claim_asset_rate_refresh(
    'GOLD_GRAM_VND',
    0,
    5,
    '2026-07-12T09:00:10Z'::timestamptz
  ),
  null::uuid,
  'retry backoff suppresses claims before retry_after'
);

insert into asset_rate_test_tokens (label, token)
values (
  'gold_after_backoff',
  public.claim_asset_rate_refresh(
    'GOLD_GRAM_VND',
    0,
    5,
    '2026-07-12T09:00:11Z'::timestamptz
  )
);

select ok(
  (select token is not null from asset_rate_test_tokens where label = 'gold_after_backoff'),
  'the pair is claimable when its short retry backoff expires'
);

select is(
  public.fail_asset_rate_refresh(
    'GOLD_GRAM_VND',
    (select token from asset_rate_test_tokens where label = 'gold_initial'),
    10,
    '2026-07-12T09:00:12Z'::timestamptz
  ),
  false,
  'a stale token cannot release a newer owner lease'
);

select is(
  (
    select count(*)
    from public.asset_rates as rate
    where rate.user_id is null
      and rate.pair = 'USD_VND'
      and rate.source = 'auto'
  ),
  1::bigint,
  'service role can read the global rate stored through the RPC'
);

reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000301';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;

select lives_ok(
  $test$
    insert into public.asset_rates (user_id, pair, value, source, fetched_at)
    values (
      '00000000-0000-0000-0000-000000000301',
      'USD_VND',
      25500,
      'manual',
      '2026-07-12T02:00:00Z'::timestamptz
    )
  $test$,
  'an authenticated user can insert an own manual rate'
);

select is(
  (
    select count(*)
    from public.asset_rates as rate
    where rate.user_id = '00000000-0000-0000-0000-000000000301'
  ),
  1::bigint,
  'an authenticated user can read an own manual rate'
);

select throws_ok(
  $test$
    insert into public.asset_rates (user_id, pair, value, source, fetched_at)
    values (
      '00000000-0000-0000-0000-000000000301',
      'USD_VND',
      25600,
      'manual',
      '2026-07-12T03:00:00Z'::timestamptz
    )
  $test$,
  '23505',
  'duplicate key value violates unique constraint "asset_rates_user_id_pair_key"',
  'per-user rates are unique per pair'
);

reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000302';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;

select lives_ok(
  $test$
    insert into public.asset_rates (user_id, pair, value, source, fetched_at)
    values (
      '00000000-0000-0000-0000-000000000302',
      'USD_VND',
      26000,
      'manual',
      '2026-07-12T02:00:00Z'::timestamptz
    )
  $test$,
  'different users can store the same manual rate pair'
);

select is(
  (
    select count(*)
    from public.asset_rates as rate
    where rate.user_id is null
      and rate.pair = 'USD_VND'
      and rate.source = 'auto'
  ),
  1::bigint,
  'authenticated users can read global automatic rates'
);

select is(
  (
    select count(*)
    from public.asset_rates as rate
    where rate.user_id = '00000000-0000-0000-0000-000000000301'
  ),
  0::bigint,
  'authenticated users cannot read another user manual rates'
);

select is(
  (
    with changed_rows as (
      update public.asset_rates
      set value = 99999
      where user_id = '00000000-0000-0000-0000-000000000301'
      returning id
    )
    select count(*) from changed_rows
  ),
  0::bigint,
  'authenticated users cannot update another user manual rates'
);

select is(
  (
    with changed_rows as (
      delete from public.asset_rates
      where user_id = '00000000-0000-0000-0000-000000000301'
      returning id
    )
    select count(*) from changed_rows
  ),
  0::bigint,
  'authenticated users cannot delete another user manual rates'
);

select throws_ok(
  $test$
    insert into public.asset_rates (user_id, pair, value, source, fetched_at)
    values (
      null,
      'GOLD_GRAM_VND',
      2100000,
      'auto',
      '2026-07-12T04:00:00Z'::timestamptz
    )
  $test$,
  '42501',
  'new row violates row-level security policy for table "asset_rates"',
  'authenticated users cannot insert global rates'
);

select is(
  (
    with changed_rows as (
      update public.asset_rates
      set value = 99999
      where user_id is null and pair = 'USD_VND'
      returning id
    )
    select count(*) from changed_rows
  ),
  0::bigint,
  'authenticated users cannot update global rates'
);

select is(
  (
    with changed_rows as (
      delete from public.asset_rates
      where user_id is null and pair = 'USD_VND'
      returning id
    )
    select count(*) from changed_rows
  ),
  0::bigint,
  'authenticated users cannot delete global rates'
);

select is(
  (
    with changed_rows as (
      update public.asset_rates
      set value = 26100,
          updated_at = now()
      where user_id = '00000000-0000-0000-0000-000000000302'
        and pair = 'USD_VND'
      returning id
    )
    select count(*) from changed_rows
  ),
  1::bigint,
  'authenticated users can update an own manual rate'
);

select is(
  (
    select value
    from public.asset_rates
    where user_id = '00000000-0000-0000-0000-000000000302'
      and pair = 'USD_VND'
  ),
  26100::numeric,
  'an own manual rate update is persisted'
);

select is(
  (
    with changed_rows as (
      delete from public.asset_rates
      where user_id = '00000000-0000-0000-0000-000000000302'
        and pair = 'USD_VND'
      returning id
    )
    select count(*) from changed_rows
  ),
  1::bigint,
  'authenticated users can delete an own manual rate'
);

select * from finish();
rollback;

update public.asset_rates
set source = case
  when user_id is null then 'auto'
  else 'manual'
end
where source is distinct from case
  when user_id is null then 'auto'
  else 'manual'
end;

delete from public.asset_rates
where value <= 0
  or value in (
    'Infinity'::numeric,
    '-Infinity'::numeric,
    'NaN'::numeric
  );

with ranked_rates as (
  select
    id,
    row_number() over (
      partition by user_id, pair
      order by
        fetched_at desc,
        updated_at desc,
        created_at desc,
        id desc
    ) as duplicate_rank
  from public.asset_rates
)
delete from public.asset_rates as asset_rate
using ranked_rates
where asset_rate.id = ranked_rates.id
  and ranked_rates.duplicate_rank > 1;

alter table public.asset_rates
  add constraint asset_rates_scope_source_check
  check (
    (user_id is null and source = 'auto')
    or (user_id is not null and source = 'manual')
  ),
  add constraint asset_rates_value_finite_positive_check
  check (
    value > 0
    and value not in (
      'Infinity'::numeric,
      '-Infinity'::numeric,
      'NaN'::numeric
    )
  ),
  add constraint asset_rates_user_id_pair_key
  unique nulls not distinct (user_id, pair);

create table public.asset_rate_refresh_state (
  pair text primary key check (pair in ('USD_VND', 'GOLD_GRAM_VND')),
  lease_token uuid,
  lease_expires_at timestamptz,
  retry_after timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  updated_at timestamptz not null default now(),
  constraint asset_rate_refresh_state_lease_check
    check ((lease_token is null) = (lease_expires_at is null))
);

alter table public.asset_rates enable row level security;
alter table public.asset_rate_refresh_state enable row level security;

grant select, insert, update, delete
  on table public.asset_rates
  to authenticated;

grant select
  on table public.asset_rates
  to service_role;

revoke insert, update, delete
  on table public.asset_rates
  from service_role;

revoke all
  on table public.asset_rate_refresh_state
  from public, anon, authenticated, service_role;

drop policy if exists "Users can read asset rates" on public.asset_rates;
create policy "Users can read asset rates"
  on public.asset_rates
  for select
  to authenticated
  using (
    (user_id is null and source = 'auto')
    or (user_id = auth.uid() and source = 'manual')
  );

drop policy if exists "Users can insert own asset rates" on public.asset_rates;
create policy "Users can insert own asset rates"
  on public.asset_rates
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and source = 'manual'
  );

drop policy if exists "Users can update own asset rates" on public.asset_rates;
create policy "Users can update own asset rates"
  on public.asset_rates
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and source = 'manual'
  )
  with check (
    user_id = auth.uid()
    and source = 'manual'
  );

drop policy if exists "Users can delete own asset rates" on public.asset_rates;
create policy "Users can delete own asset rates"
  on public.asset_rates
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    and source = 'manual'
  );

drop policy if exists "Service role can manage global asset rates" on public.asset_rates;

create or replace function public.claim_asset_rate_refresh(
  p_pair text,
  p_cache_ttl_seconds integer,
  p_lease_seconds integer,
  p_now timestamptz default clock_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  state_row public.asset_rate_refresh_state%rowtype;
  claim_token uuid;
begin
  if p_pair is null or p_pair not in ('USD_VND', 'GOLD_GRAM_VND') then
    raise exception 'invalid asset rate pair' using errcode = '22023';
  end if;
  if p_cache_ttl_seconds is null
      or p_cache_ttl_seconds < 0
      or p_cache_ttl_seconds > 604800 then
    raise exception 'invalid asset rate cache TTL' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 5 or p_lease_seconds > 120 then
    raise exception 'invalid asset rate lease duration' using errcode = '22023';
  end if;
  if p_now is null then
    raise exception 'invalid asset rate claim time' using errcode = '22023';
  end if;

  insert into public.asset_rate_refresh_state (pair)
  values (p_pair)
  on conflict (pair) do nothing;

  select refresh_state.*
  into strict state_row
  from public.asset_rate_refresh_state as refresh_state
  where refresh_state.pair = p_pair
  for update;

  if exists (
    select 1
    from public.asset_rates as rate
    where rate.user_id is null
      and rate.source = 'auto'
      and rate.pair = p_pair
      and rate.updated_at > p_now - make_interval(secs => p_cache_ttl_seconds)
  ) then
    return null;
  end if;

  if state_row.retry_after is not null and state_row.retry_after > p_now then
    return null;
  end if;

  if state_row.lease_token is not null
      and state_row.lease_expires_at > p_now then
    return null;
  end if;

  claim_token := gen_random_uuid();
  update public.asset_rate_refresh_state as refresh_state
  set lease_token = claim_token,
      lease_expires_at = p_now + make_interval(secs => p_lease_seconds),
      retry_after = null,
      updated_at = p_now
  where refresh_state.pair = p_pair;

  return claim_token;
end;
$$;

create or replace function public.complete_asset_rate_refresh(
  p_pair text,
  p_value numeric,
  p_fetched_at timestamptz,
  p_claim_token uuid,
  p_retry_backoff_seconds integer,
  p_now timestamptz default clock_timestamp()
)
returns table (
  id uuid,
  user_id uuid,
  pair text,
  value numeric,
  source text,
  fetched_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  stored boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  state_row public.asset_rate_refresh_state%rowtype;
  rate_row public.asset_rates%rowtype;
  did_store boolean := false;
begin
  if p_pair is null or p_pair not in ('USD_VND', 'GOLD_GRAM_VND') then
    raise exception 'invalid asset rate pair' using errcode = '22023';
  end if;
  if p_value is null
      or p_value <= 0
      or p_value in ('Infinity'::numeric, '-Infinity'::numeric, 'NaN'::numeric) then
    raise exception 'invalid asset rate value' using errcode = '22023';
  end if;
  if p_fetched_at is null or p_claim_token is null or p_now is null then
    raise exception 'invalid asset rate completion' using errcode = '22023';
  end if;
  if p_fetched_at > p_now + interval '5 minutes' then
    raise exception 'asset rate provider timestamp too far in future'
      using errcode = '22023';
  end if;
  if p_retry_backoff_seconds is null
      or p_retry_backoff_seconds < 1
      or p_retry_backoff_seconds > 300 then
    raise exception 'invalid asset rate retry backoff' using errcode = '22023';
  end if;

  select refresh_state.*
  into state_row
  from public.asset_rate_refresh_state as refresh_state
  where refresh_state.pair = p_pair
  for update;

  if not found or state_row.lease_token is distinct from p_claim_token then
    return query
      select
        rate.id,
        rate.user_id,
        rate.pair,
        rate.value,
        rate.source,
        rate.fetched_at,
        rate.created_at,
        rate.updated_at,
        false
      from public.asset_rates as rate
      where rate.user_id is null
        and rate.source = 'auto'
        and rate.pair = p_pair;
    return;
  end if;

  insert into public.asset_rates as current_rate (
    user_id,
    pair,
    value,
    source,
    fetched_at,
    created_at,
    updated_at
  )
  values (
    null,
    p_pair,
    p_value,
    'auto',
    p_fetched_at,
    p_now,
    p_now
  )
  on conflict on constraint asset_rates_user_id_pair_key do update
  set value = excluded.value,
      fetched_at = excluded.fetched_at,
      updated_at = p_now
  where current_rate.fetched_at <= excluded.fetched_at
  returning current_rate.* into rate_row;

  did_store := found;
  if not did_store then
    select rate.*
    into strict rate_row
    from public.asset_rates as rate
    where rate.user_id is null
      and rate.source = 'auto'
      and rate.pair = p_pair;
  end if;

  update public.asset_rate_refresh_state as refresh_state
  set lease_token = null,
      lease_expires_at = null,
      retry_after = case
        when did_store then null
        else p_now + make_interval(secs => p_retry_backoff_seconds)
      end,
      failure_count = case
        when did_store then 0
        else refresh_state.failure_count + 1
      end,
      updated_at = p_now
  where refresh_state.pair = p_pair
    and refresh_state.lease_token = p_claim_token;

  return query
    select
      rate_row.id,
      rate_row.user_id,
      rate_row.pair,
      rate_row.value,
      rate_row.source,
      rate_row.fetched_at,
      rate_row.created_at,
      rate_row.updated_at,
      did_store;
end;
$$;

create or replace function public.fail_asset_rate_refresh(
  p_pair text,
  p_claim_token uuid,
  p_retry_backoff_seconds integer,
  p_now timestamptz default clock_timestamp()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_pair is null or p_pair not in ('USD_VND', 'GOLD_GRAM_VND') then
    raise exception 'invalid asset rate pair' using errcode = '22023';
  end if;
  if p_claim_token is null or p_now is null then
    raise exception 'invalid asset rate failure completion' using errcode = '22023';
  end if;
  if p_retry_backoff_seconds is null
      or p_retry_backoff_seconds < 1
      or p_retry_backoff_seconds > 300 then
    raise exception 'invalid asset rate retry backoff' using errcode = '22023';
  end if;

  update public.asset_rate_refresh_state as refresh_state
  set lease_token = null,
      lease_expires_at = null,
      retry_after = p_now + make_interval(secs => p_retry_backoff_seconds),
      failure_count = refresh_state.failure_count + 1,
      updated_at = p_now
  where refresh_state.pair = p_pair
    and refresh_state.lease_token = p_claim_token;

  return found;
end;
$$;

revoke all on function public.claim_asset_rate_refresh(text, integer, integer, timestamptz)
  from public, anon, authenticated;
revoke all on function public.complete_asset_rate_refresh(text, numeric, timestamptz, uuid, integer, timestamptz)
  from public, anon, authenticated;
revoke all on function public.fail_asset_rate_refresh(text, uuid, integer, timestamptz)
  from public, anon, authenticated;

grant execute on function public.claim_asset_rate_refresh(text, integer, integer, timestamptz)
  to service_role;
grant execute on function public.complete_asset_rate_refresh(text, numeric, timestamptz, uuid, integer, timestamptz)
  to service_role;
grant execute on function public.fail_asset_rate_refresh(text, uuid, integer, timestamptz)
  to service_role;

comment on table public.asset_rate_refresh_state is
  'Private per-pair lease and retry state for global asset-rate refreshes.';
comment on function public.claim_asset_rate_refresh(text, integer, integer, timestamptz) is
  'Atomically claims a stale global rate pair unless a lease or retry backoff is active.';
comment on function public.complete_asset_rate_refresh(text, numeric, timestamptz, uuid, integer, timestamptz) is
  'Completes a claimed refresh without allowing an older provider quote to replace a newer one.';
comment on function public.fail_asset_rate_refresh(text, uuid, integer, timestamptz) is
  'Releases a claimed refresh after failure and applies a short retry backoff.';

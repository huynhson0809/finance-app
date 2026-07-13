-- Per-user API keys: Gold API key and Ingest secret
-- Replaces global GOLD_API_KEY and INGEST_SECRET env vars

create table if not exists public.user_api_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gold_api_key text,
  ingest_secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_api_keys enable row level security;
grant select, insert, update on table public.user_api_keys to authenticated;

create policy "Users can read own api keys"
  on public.user_api_keys for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own api keys"
  on public.user_api_keys for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own api keys"
  on public.user_api_keys for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Allow service_role to read keys (for edge functions)
grant select on table public.user_api_keys to service_role;

-- Function to look up user by ingest secret (used by ingest-transaction)
create or replace function public.lookup_user_by_ingest_secret(p_secret text)
returns uuid
language sql
stable
security definer
as $$
  select user_id from public.user_api_keys
  where ingest_secret = p_secret
  limit 1;
$$;

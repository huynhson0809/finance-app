-- Log every ingest attempt for debugging automation failures

create table if not exists public.ingest_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank text,
  type text,
  amount text,
  content text,
  status text not null check (status in ('success', 'duplicate', 'error')),
  error_code text,
  error_detail text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ingest_logs_user_created_idx
  on public.ingest_logs (user_id, created_at desc);

alter table public.ingest_logs enable row level security;
grant select, insert on table public.ingest_logs to authenticated;
grant insert on table public.ingest_logs to service_role;

create policy "Users can read own ingest logs"
  on public.ingest_logs for select to authenticated
  using (user_id = auth.uid());

create policy "Service role can insert ingest logs"
  on public.ingest_logs for insert to service_role
  with check (true);

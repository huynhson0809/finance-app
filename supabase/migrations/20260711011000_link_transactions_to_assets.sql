alter table public.transactions
  add column if not exists asset_account_id uuid references public.asset_accounts(id) on delete set null,
  add column if not exists counterparty_asset_account_id uuid references public.asset_accounts(id) on delete set null,
  add column if not exists asset_event_id uuid references public.asset_events(id) on delete set null;

create index if not exists transactions_asset_account_id_idx
  on public.transactions (asset_account_id);

create index if not exists transactions_counterparty_asset_account_id_idx
  on public.transactions (counterparty_asset_account_id);

revoke update on table public.transactions from anon, authenticated;
revoke update (
  amount,
  transaction_time,
  content,
  merchant,
  note,
  category,
  asset_account_id,
  counterparty_asset_account_id,
  asset_event_id
) on table public.transactions from anon, authenticated;

grant update (
  amount,
  transaction_time,
  content,
  merchant,
  note,
  category,
  asset_account_id,
  counterparty_asset_account_id,
  asset_event_id
) on table public.transactions to authenticated;

drop policy if exists "Users can update own transactions" on public.transactions;
create policy "Users can update own transactions"
  on public.transactions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      asset_account_id is null
      or exists (
        select 1
        from public.asset_accounts account_ref
        where account_ref.id = asset_account_id
          and account_ref.user_id = auth.uid()
      )
    )
    and (
      counterparty_asset_account_id is null
      or exists (
        select 1
        from public.asset_accounts counterparty_ref
        where counterparty_ref.id = counterparty_asset_account_id
          and counterparty_ref.user_id = auth.uid()
      )
    )
    and (
      asset_event_id is null
      or exists (
        select 1
        from public.asset_events event_ref
        where event_ref.id = asset_event_id
          and event_ref.user_id = auth.uid()
      )
    )
  );

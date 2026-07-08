revoke update on table public.transactions from anon, authenticated;
grant update (
  amount,
  transaction_time,
  content,
  merchant,
  note,
  category
) on table public.transactions to authenticated;

grant delete on table public.transactions to authenticated;

drop policy if exists "Users can update own transaction categories" on public.transactions;
drop policy if exists "Users can update own transactions" on public.transactions;
create policy "Users can update own transactions"
  on public.transactions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own transactions" on public.transactions;
create policy "Users can delete own transactions"
  on public.transactions
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can update own transaction categories" on public.transactions;

create policy "Users can update own transaction categories"
  on public.transactions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

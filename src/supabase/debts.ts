import type { AppSupabaseClient } from './client';
import type {
  Debt,
  DebtPayment,
  DebtInput,
  DebtPaymentInput,
} from '../debts/types';

interface CloudDebtRow {
  id: string;
  direction: string;
  person_name: string;
  total_amount: number;
  currency: string;
  note: string;
  settled: boolean;
  created_at: string;
  updated_at: string;
}

interface CloudDebtPaymentRow {
  id: string;
  debt_id: string;
  amount: number;
  note: string;
  paid_at: string;
  created_at: string;
}

const DEBT_COLUMNS = 'id,direction,person_name,total_amount,currency,note,settled,created_at,updated_at';
const PAYMENT_COLUMNS = 'id,debt_id,amount,note,paid_at,created_at';

function mapDebt(row: CloudDebtRow): Debt {
  return {
    id: row.id,
    direction: row.direction as Debt['direction'],
    personName: row.person_name,
    totalAmount: row.total_amount,
    currency: row.currency,
    note: row.note,
    settled: row.settled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPayment(row: CloudDebtPaymentRow): DebtPayment {
  return {
    id: row.id,
    debtId: row.debt_id,
    amount: row.amount,
    note: row.note,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

async function currentUserId(client: AppSupabaseClient): Promise<string> {
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error('Not authenticated');
  return data.user.id;
}

export async function listCloudDebts(client: AppSupabaseClient): Promise<Debt[]> {
  const result = await client
    .from('debts')
    .select(DEBT_COLUMNS)
    .order('settled', { ascending: true })
    .order('created_at', { ascending: false });
  throwIfError(result.error);
  return (result.data ?? []).map(mapDebt);
}

export async function listCloudDebtPayments(
  client: AppSupabaseClient,
  debtId: string,
): Promise<DebtPayment[]> {
  const result = await client
    .from('debt_payments')
    .select(PAYMENT_COLUMNS)
    .eq('debt_id', debtId)
    .order('paid_at', { ascending: false });
  throwIfError(result.error);
  return (result.data ?? []).map(mapPayment);
}

export async function insertCloudDebt(
  client: AppSupabaseClient,
  input: DebtInput,
): Promise<Debt> {
  const userId = await currentUserId(client);
  const result = await client
    .from('debts')
    .insert({
      user_id: userId,
      direction: input.direction,
      person_name: input.personName.trim(),
      total_amount: input.totalAmount,
      note: input.note?.trim() ?? '',
    })
    .select(DEBT_COLUMNS)
    .single();
  throwIfError(result.error);
  if (!result.data) throw new Error('Insert returned no data');
  return mapDebt(result.data);
}

export async function updateCloudDebt(
  client: AppSupabaseClient,
  id: string,
  updates: Partial<Pick<Debt, 'personName' | 'totalAmount' | 'note' | 'settled'>>,
): Promise<Debt> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.personName !== undefined) row.person_name = updates.personName.trim();
  if (updates.totalAmount !== undefined) row.total_amount = updates.totalAmount;
  if (updates.note !== undefined) row.note = updates.note.trim();
  if (updates.settled !== undefined) row.settled = updates.settled;
  const result = await client
    .from('debts')
    .update(row)
    .eq('id', id)
    .select(DEBT_COLUMNS)
    .single();
  throwIfError(result.error);
  if (!result.data) throw new Error('Update returned no data');
  return mapDebt(result.data);
}

export async function deleteCloudDebt(
  client: AppSupabaseClient,
  id: string,
): Promise<void> {
  const result = await client.from('debts').delete().eq('id', id);
  throwIfError(result.error);
}

export async function insertCloudDebtPayment(
  client: AppSupabaseClient,
  input: DebtPaymentInput,
): Promise<DebtPayment> {
  const userId = await currentUserId(client);
  const result = await client
    .from('debt_payments')
    .insert({
      user_id: userId,
      debt_id: input.debtId,
      amount: input.amount,
      note: input.note?.trim() ?? '',
    })
    .select(PAYMENT_COLUMNS)
    .single();
  throwIfError(result.error);
  if (!result.data) throw new Error('Insert returned no data');
  return mapPayment(result.data);
}

export async function deleteCloudDebtPayment(
  client: AppSupabaseClient,
  id: string,
): Promise<void> {
  const result = await client.from('debt_payments').delete().eq('id', id);
  throwIfError(result.error);
}

import type { AppSupabaseClient } from './client';
import type {
  AssetAccount,
  AssetAccountKind,
  AssetCurrency,
  AssetEvent,
  AssetEventType,
  AssetRate,
  GoldUnit,
} from '../assets/types';

const ASSET_ACCOUNT_COLUMNS = [
  'id',
  'user_id',
  'kind',
  'name',
  'currency',
  'balance',
  'quantity',
  'gold_unit',
  'bank',
  'account_identifier',
  'card_identifier',
  'include_in_total',
  'sort_order',
  'created_at',
  'updated_at',
].join(',');
const ASSET_RATE_COLUMNS = 'id,user_id,pair,value,source,fetched_at,created_at,updated_at';
const ASSET_EVENT_COLUMNS = [
  'id',
  'user_id',
  'account_id',
  'counterparty_account_id',
  'transaction_id',
  'type',
  'amount',
  'currency',
  'balance_after',
  'note',
  'occurred_at',
  'created_at',
].join(',');

type AssetTable = 'asset_accounts' | 'asset_rates' | 'asset_events';
type NumericValue = number | string;

interface QueryError {
  message: string;
}

interface QueryResult<T> {
  data: T | null;
  error: QueryError | null;
}

interface AuthUserResult {
  data: { user: { id: string } | null };
  error: QueryError | null;
}

interface CloudAssetAccountRow {
  id: string;
  user_id: string;
  kind: AssetAccountKind;
  name: string;
  currency: AssetCurrency;
  balance: NumericValue;
  quantity: NumericValue | null;
  gold_unit: GoldUnit | null;
  bank: string | null;
  account_identifier: string | null;
  card_identifier: string | null;
  include_in_total: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface CloudAssetRateRow {
  id: string;
  user_id: string | null;
  pair: AssetRate['pair'];
  value: NumericValue;
  source: AssetRate['source'];
  fetched_at: string;
  created_at: string;
  updated_at: string;
}

interface CloudAssetEventRow {
  id: string;
  user_id: string;
  account_id: string;
  counterparty_account_id: string | null;
  transaction_id: string | null;
  type: AssetEventType;
  amount: NumericValue;
  currency: AssetCurrency;
  balance_after: NumericValue | null;
  note: string | null;
  occurred_at: string;
  created_at: string;
}

interface AssetAccountUpsertRow {
  id?: string;
  user_id: string;
  kind: AssetAccountKind;
  name: string;
  currency: AssetCurrency;
  balance: number;
  quantity: number | null;
  gold_unit: GoldUnit | null;
  bank: string | null;
  account_identifier: string | null;
  card_identifier: string | null;
  include_in_total: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface AssetRateUpsertRow {
  id?: string;
  user_id: string;
  pair: AssetRate['pair'];
  value: number;
  source: AssetRate['source'];
  fetched_at: string;
  created_at: string;
  updated_at: string;
}

interface AssetEventInsertRow {
  id?: string;
  user_id: string;
  account_id: string;
  counterparty_account_id: string | null;
  transaction_id: string | null;
  type: AssetEventType;
  amount: number;
  currency: AssetCurrency;
  balance_after: number | null;
  note: string | null;
  occurred_at: string;
  created_at: string;
}

interface AssetQueryBuilder<T> extends PromiseLike<QueryResult<T[]>> {
  order(column: string, opts: { ascending: boolean }): AssetQueryBuilder<T>;
  eq(column: string, value: string): AssetQueryBuilder<T>;
  single(): PromiseLike<QueryResult<T>>;
  maybeSingle(): PromiseLike<QueryResult<T>>;
}

interface AssetMutationFilterBuilder extends PromiseLike<QueryResult<unknown>> {
  eq(column: string, value: string): AssetMutationFilterBuilder;
}

interface AssetSelectSingleBuilder<T> {
  select(columns: string): {
    single(): PromiseLike<QueryResult<T>>;
  };
}

interface AssetTableBuilder<T, UpsertRow, InsertRow> {
  select(columns: string): AssetQueryBuilder<T>;
  upsert(row: UpsertRow, opts: { onConflict: string }): AssetSelectSingleBuilder<T>;
  insert(row: InsertRow): AssetSelectSingleBuilder<T>;
  update(row: Record<string, unknown>): AssetMutationFilterBuilder;
  delete(): AssetMutationFilterBuilder;
}

interface AssetClientInput {
  auth: {
    getUser(): Promise<AuthUserResult>;
  };
  from(table: AssetTable): unknown;
}

type Assert<T extends true> = T;
export type SupabaseAssetClientCompatibility = Assert<
  AppSupabaseClient['from'] extends AssetClientInput['from'] ? true : false
>;

export type AssetAccountInput = Omit<AssetAccount, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
};
export type AssetRateInput = Omit<AssetRate, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
};
export type AssetEventInput = Omit<AssetEvent, 'id' | 'userId' | 'createdAt'> & {
  id?: string;
  createdAt?: string;
};

function assetAccountsTable(
  client: AssetClientInput,
): AssetTableBuilder<CloudAssetAccountRow, AssetAccountUpsertRow, never> {
  return client.from('asset_accounts') as AssetTableBuilder<CloudAssetAccountRow, AssetAccountUpsertRow, never>;
}

function assetRatesTable(
  client: AssetClientInput,
): AssetTableBuilder<CloudAssetRateRow, AssetRateUpsertRow, never> {
  return client.from('asset_rates') as AssetTableBuilder<CloudAssetRateRow, AssetRateUpsertRow, never>;
}

function assetEventsTable(
  client: AssetClientInput,
): AssetTableBuilder<CloudAssetEventRow, never, AssetEventInsertRow> {
  return client.from('asset_events') as AssetTableBuilder<CloudAssetEventRow, never, AssetEventInsertRow>;
}

async function currentUserId(client: AssetClientInput): Promise<string> {
  const result = await client.auth.getUser();
  if (result.error) {
    throw new Error(result.error.message);
  }
  if (!result.data.user) {
    throw new Error('No signed-in user');
  }
  return result.data.user.id;
}

function throwIfError(error: QueryError | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

function mapAssetAccount(row: CloudAssetAccountRow): AssetAccount {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    kind: row.kind,
    name: row.name,
    currency: row.currency,
    balance: Number(row.balance),
    quantity: row.quantity == null ? undefined : Number(row.quantity),
    goldUnit: row.gold_unit ?? undefined,
    bank: row.bank,
    accountIdentifier: row.account_identifier,
    cardIdentifier: row.card_identifier,
    includeInTotal: row.include_in_total,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAssetRate(row: CloudAssetRateRow): AssetRate {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    pair: row.pair,
    value: Number(row.value),
    source: row.source,
    fetchedAt: row.fetched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAssetEvent(row: CloudAssetEventRow): AssetEvent {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    accountId: row.account_id,
    counterpartyAccountId: row.counterparty_account_id,
    transactionId: row.transaction_id,
    type: row.type,
    amount: Number(row.amount),
    currency: row.currency,
    balanceAfter: row.balance_after == null ? null : Number(row.balance_after),
    note: row.note,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}

export async function listCloudAssetAccounts(
  client: AssetClientInput,
): Promise<AssetAccount[]> {
  const result = await assetAccountsTable(client)
    .select(ASSET_ACCOUNT_COLUMNS)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  throwIfError(result.error);
  return (result.data ?? []).map(mapAssetAccount);
}

export async function upsertCloudAssetAccount(
  client: AssetClientInput,
  input: AssetAccountInput,
): Promise<AssetAccount> {
  const userId = await currentUserId(client);
  const now = new Date().toISOString();
  const row: AssetAccountUpsertRow = {
    user_id: userId,
    kind: input.kind,
    name: input.name,
    currency: input.currency,
    balance: input.balance,
    quantity: input.quantity ?? null,
    gold_unit: input.goldUnit ?? null,
    bank: input.bank ?? null,
    account_identifier: input.accountIdentifier ?? null,
    card_identifier: input.cardIdentifier ?? null,
    include_in_total: input.includeInTotal,
    sort_order: input.sortOrder,
    created_at: input.createdAt ?? now,
    updated_at: input.updatedAt ?? now,
  };
  if (input.id !== undefined) {
    row.id = input.id;
  }

  const result = await assetAccountsTable(client)
    .upsert(row, { onConflict: 'id' })
    .select(ASSET_ACCOUNT_COLUMNS)
    .single();

  throwIfError(result.error);
  if (!result.data) {
    throw new Error('No asset account returned');
  }
  return mapAssetAccount(result.data);
}

export async function deleteCloudAssetAccount(
  client: AssetClientInput,
  id: string,
): Promise<void> {
  const result = await assetAccountsTable(client)
    .delete()
    .eq('id', id);

  throwIfError(result.error);
}

export async function reorderCloudAssetAccounts(
  client: AssetClientInput,
  ids: string[],
): Promise<void> {
  for (const [sortOrder, id] of ids.entries()) {
    const result = await assetAccountsTable(client)
      .update({ sort_order: sortOrder })
      .eq('id', id);

    throwIfError(result.error);
  }
}

export async function listCloudAssetRates(
  client: AssetClientInput,
): Promise<AssetRate[]> {
  const result = await assetRatesTable(client)
    .select(ASSET_RATE_COLUMNS)
    .order('fetched_at', { ascending: false });

  throwIfError(result.error);
  return (result.data ?? []).map(mapAssetRate);
}

export async function upsertCloudAssetRate(
  client: AssetClientInput,
  input: AssetRateInput,
): Promise<AssetRate> {
  const userId = input.userId ?? await currentUserId(client);
  const now = new Date().toISOString();
  const row: AssetRateUpsertRow = {
    user_id: userId,
    pair: input.pair,
    value: input.value,
    source: input.source,
    fetched_at: input.fetchedAt,
    created_at: input.createdAt ?? now,
    updated_at: input.updatedAt ?? now,
  };
  if (input.id !== undefined) {
    row.id = input.id;
  }

  const result = await assetRatesTable(client)
    .upsert(row, { onConflict: 'id' })
    .select(ASSET_RATE_COLUMNS)
    .single();

  throwIfError(result.error);
  if (!result.data) {
    throw new Error('No asset rate returned');
  }
  return mapAssetRate(result.data);
}

export async function insertCloudAssetEvent(
  client: AssetClientInput,
  input: AssetEventInput,
): Promise<AssetEvent> {
  const userId = await currentUserId(client);
  const row: AssetEventInsertRow = {
    user_id: userId,
    account_id: input.accountId,
    counterparty_account_id: input.counterpartyAccountId ?? null,
    transaction_id: input.transactionId ?? null,
    type: input.type,
    amount: input.amount,
    currency: input.currency,
    balance_after: input.balanceAfter ?? null,
    note: input.note ?? null,
    occurred_at: input.occurredAt,
    created_at: input.createdAt ?? new Date().toISOString(),
  };
  if (input.id !== undefined) {
    row.id = input.id;
  }

  const result = await assetEventsTable(client)
    .insert(row)
    .select(ASSET_EVENT_COLUMNS)
    .single();

  throwIfError(result.error);
  if (!result.data) {
    throw new Error('No asset event returned');
  }
  return mapAssetEvent(result.data);
}

export async function listCloudAssetEvents(
  client: AssetClientInput,
  accountId?: string,
): Promise<AssetEvent[]> {
  let query = assetEventsTable(client)
    .select(ASSET_EVENT_COLUMNS);
  if (accountId !== undefined) {
    query = query.eq('account_id', accountId);
  }
  const result = await query.order('occurred_at', { ascending: false });

  throwIfError(result.error);
  return (result.data ?? []).map(mapAssetEvent);
}

export async function findCloudAssetAccountByBankIdentifier(
  client: AssetClientInput,
  params: { bank: string; accountIdentifier?: string | null; cardIdentifier?: string | null },
): Promise<AssetAccount | null> {
  const hasAccountIdentifier = params.accountIdentifier != null;
  const hasCardIdentifier = params.cardIdentifier != null;
  if (!hasAccountIdentifier && !hasCardIdentifier) {
    return null;
  }

  const identifierColumn = hasAccountIdentifier ? 'account_identifier' : 'card_identifier';
  const identifier = hasAccountIdentifier ? params.accountIdentifier : params.cardIdentifier;
  if (identifier == null) {
    return null;
  }

  const result = await assetAccountsTable(client)
    .select(ASSET_ACCOUNT_COLUMNS)
    .eq('bank', params.bank)
    .eq(identifierColumn, identifier)
    .maybeSingle();

  throwIfError(result.error);
  return result.data ? mapAssetAccount(result.data) : null;
}

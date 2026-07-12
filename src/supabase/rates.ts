import type { AssetRate, AssetRatePair } from '../assets/types';

const ASSET_RATE_COLUMNS = 'id,user_id,pair,value,source,fetched_at,created_at,updated_at';
const ASSET_RATE_PAIRS = ['USD_VND', 'GOLD_GRAM_VND'] as const satisfies readonly AssetRatePair[];
const ASSET_RATE_REFRESH_OUTCOMES = ['refreshed', 'cached', 'unavailable'] as const;

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

interface CloudAssetRateRow {
  id: string;
  user_id: string | null;
  pair: AssetRatePair;
  value: NumericValue;
  source: AssetRate['source'];
  fetched_at: string;
  created_at: string;
  updated_at: string;
}

interface AssetRateUpsertRow {
  user_id: string;
  pair: AssetRatePair;
  value: number;
  source: 'manual';
  fetched_at: string;
  created_at: string;
  updated_at: string;
}

interface AssetRateQueryBuilder<T> extends PromiseLike<QueryResult<T[]>> {
  eq(column: string, value: string): AssetRateQueryBuilder<T>;
  or(filters: string): AssetRateQueryBuilder<T>;
  order(column: string, options: { ascending: boolean }): AssetRateQueryBuilder<T>;
  maybeSingle(): PromiseLike<QueryResult<T>>;
  single(): PromiseLike<QueryResult<T>>;
}

interface AssetRateMutationFilterBuilder extends PromiseLike<QueryResult<unknown>> {
  eq(column: string, value: string): AssetRateMutationFilterBuilder;
}

interface AssetRateSelectSingleBuilder<T> {
  select(columns: string): {
    single(): PromiseLike<QueryResult<T>>;
  };
}

interface AssetRateTableBuilder {
  select(columns: string): AssetRateQueryBuilder<CloudAssetRateRow>;
  upsert(
    row: AssetRateUpsertRow,
    options: { onConflict: 'user_id,pair' },
  ): AssetRateSelectSingleBuilder<CloudAssetRateRow>;
  delete(): AssetRateMutationFilterBuilder;
}

interface FunctionInvokeResult {
  data: unknown;
  error: QueryError | null;
}

interface AssetRateDataClientInput {
  auth: {
    getUser(): Promise<AuthUserResult>;
  };
  from(table: 'asset_rates'): unknown;
}

interface AssetRateRefreshClientInput {
  functions: {
    invoke(
      functionName: 'fetch-asset-rates',
      options: { method: 'POST' },
    ): Promise<FunctionInvokeResult>;
  };
}

/**
 * Legacy metadata fields remain accepted for compatibility. The persisted user
 * and source are always derived by this module.
 */
export type AssetRateInput = Pick<AssetRate, 'pair' | 'value'> & Partial<Pick<
  AssetRate,
  'id' | 'userId' | 'source' | 'fetchedAt' | 'createdAt' | 'updatedAt'
>>;

export type AssetRateRefreshOutcome = typeof ASSET_RATE_REFRESH_OUTCOMES[number];

export interface AssetRateRefreshResult {
  ok: true;
  outcomes: {
    USD_VND: AssetRateRefreshOutcome;
    GOLD_GRAM_VND: AssetRateRefreshOutcome;
  };
  rates: AssetRate[];
}

function assetRatesTable(client: AssetRateDataClientInput): AssetRateTableBuilder {
  return client.from('asset_rates') as AssetRateTableBuilder;
}

async function currentUserId(client: AssetRateDataClientInput): Promise<string> {
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

function parseRateValue(input: unknown): number {
  const value = typeof input === 'number'
    ? input
    : typeof input === 'string' && input.trim() !== ''
      ? Number(input)
      : Number.NaN;

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Asset rate value must be a positive finite number');
  }
  return value;
}

function mapAssetRate(row: CloudAssetRateRow): AssetRate {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    pair: row.pair,
    value: parseRateValue(row.value),
    source: row.source,
    fetchedAt: row.fetched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertPositiveFiniteValue(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Asset rate value must be a positive finite number');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function malformedRefreshResponse(): never {
  throw new Error('Malformed asset rate refresh response');
}

function isAssetRatePair(value: unknown): value is AssetRatePair {
  return typeof value === 'string'
    && (ASSET_RATE_PAIRS as readonly string[]).includes(value);
}

function isAssetRateRefreshOutcome(value: unknown): value is AssetRateRefreshOutcome {
  return typeof value === 'string'
    && (ASSET_RATE_REFRESH_OUTCOMES as readonly string[]).includes(value);
}

function parseRefreshRate(input: unknown): AssetRate {
  if (!isRecord(input)
    || typeof input.id !== 'string'
    || input.id.trim() === ''
    || input.user_id !== null
    || !isAssetRatePair(input.pair)
    || input.source !== 'auto'
    || typeof input.fetched_at !== 'string'
    || !Number.isFinite(Date.parse(input.fetched_at))
    || typeof input.created_at !== 'string'
    || input.created_at.trim() === ''
    || typeof input.updated_at !== 'string'
    || input.updated_at.trim() === '') {
    return malformedRefreshResponse();
  }

  const value = typeof input.value === 'number'
    ? input.value
    : typeof input.value === 'string' && input.value.trim() !== ''
      ? Number(input.value)
      : Number.NaN;
  if (!Number.isFinite(value) || value <= 0) {
    return malformedRefreshResponse();
  }

  return {
    id: input.id,
    userId: undefined,
    pair: input.pair,
    value,
    source: 'auto',
    fetchedAt: input.fetched_at,
    createdAt: input.created_at,
    updatedAt: input.updated_at,
  };
}

function parseRefreshResult(payload: unknown): AssetRateRefreshResult {
  if (!isRecord(payload)) return malformedRefreshResponse();
  if (payload.ok === false && typeof payload.error === 'string' && payload.error.trim() !== '') {
    throw new Error(`Asset rate refresh failed: ${payload.error}`);
  }
  if (payload.ok !== true || !isRecord(payload.outcomes) || !Array.isArray(payload.rates)) {
    return malformedRefreshResponse();
  }

  const usdVnd = payload.outcomes.USD_VND;
  const goldGramVnd = payload.outcomes.GOLD_GRAM_VND;
  if (!isAssetRateRefreshOutcome(usdVnd) || !isAssetRateRefreshOutcome(goldGramVnd)) {
    return malformedRefreshResponse();
  }

  return {
    ok: true,
    outcomes: {
      USD_VND: usdVnd,
      GOLD_GRAM_VND: goldGramVnd,
    },
    rates: payload.rates.map(parseRefreshRate),
  };
}

export async function listCloudAssetRates(
  client: AssetRateDataClientInput,
): Promise<AssetRate[]> {
  const userId = await currentUserId(client);
  const result = await assetRatesTable(client)
    .select(ASSET_RATE_COLUMNS)
    .or(`and(user_id.is.null,source.eq.auto),and(user_id.eq.${userId},source.eq.manual)`)
    .order('fetched_at', { ascending: false });

  throwIfError(result.error);
  return (result.data ?? []).map(mapAssetRate);
}

export async function upsertCloudAssetRate(
  client: AssetRateDataClientInput,
  input: AssetRateInput,
): Promise<AssetRate> {
  assertPositiveFiniteValue(input.value);
  const userId = await currentUserId(client);
  const existingResult = await assetRatesTable(client)
    .select(ASSET_RATE_COLUMNS)
    .eq('user_id', userId)
    .eq('pair', input.pair)
    .eq('source', 'manual')
    .maybeSingle();

  throwIfError(existingResult.error);

  const now = new Date().toISOString();
  const row: AssetRateUpsertRow = {
    user_id: userId,
    pair: input.pair,
    value: input.value,
    source: 'manual',
    fetched_at: input.fetchedAt ?? now,
    created_at: existingResult.data?.created_at ?? input.createdAt ?? now,
    updated_at: input.updatedAt ?? now,
  };

  const result = await assetRatesTable(client)
    .upsert(row, { onConflict: 'user_id,pair' })
    .select(ASSET_RATE_COLUMNS)
    .single();

  throwIfError(result.error);
  if (!result.data) {
    throw new Error('No asset rate returned');
  }
  return mapAssetRate(result.data);
}

export async function deleteCloudAssetRate(
  client: AssetRateDataClientInput,
  pair: AssetRatePair,
): Promise<void> {
  const userId = await currentUserId(client);
  const result = await assetRatesTable(client)
    .delete()
    .eq('user_id', userId)
    .eq('pair', pair)
    .eq('source', 'manual');

  throwIfError(result.error);
}

/** Invokes the global-rate refresh with an empty POST body. */
export async function refreshCloudAssetRates(
  client: AssetRateRefreshClientInput,
): Promise<AssetRateRefreshResult> {
  const result = await client.functions.invoke('fetch-asset-rates', {
    method: 'POST',
  });

  throwIfError(result.error);
  return parseRefreshResult(result.data);
}

const USD_VND_PAIR = 'USD_VND';
const GOLD_GRAM_VND_PAIR = 'GOLD_GRAM_VND';
const RATE_PAIRS = [USD_VND_PAIR, GOLD_GRAM_VND_PAIR] as const;
const DEFAULT_USD_VND_RATE_URL = 'https://open.er-api.com/v6/latest/USD';
const DEFAULT_GOLD_XAU_USD_RATE_URL = 'https://www.goldapi.io/api/XAU/USD';
const DEFAULT_CACHE_TTL_SECONDS = 28_800;
const MAX_CACHE_TTL_SECONDS = 604_800;
const DEFAULT_PROVIDER_TIMEOUT_MS = 8_000;
const MIN_PROVIDER_TIMEOUT_MS = 250;
const MAX_PROVIDER_TIMEOUT_MS = 30_000;
const DEFAULT_REFRESH_LEASE_SECONDS = 45;
const MIN_REFRESH_LEASE_SECONDS = 5;
const MAX_REFRESH_LEASE_SECONDS = 120;
const DEFAULT_RETRY_BACKOFF_SECONDS = 30;
const MIN_RETRY_BACKOFF_SECONDS = 1;
const MAX_RETRY_BACKOFF_SECONDS = 300;
const MAX_PROVIDER_FUTURE_SKEW_MS = 5 * 60 * 1_000;
const TROY_OUNCE_GRAMS = 31.1034768;
const RATE_COLUMNS = 'id,user_id,pair,value,source,fetched_at,created_at,updated_at';

export type AssetRatePair = typeof RATE_PAIRS[number];
export type AssetRateOutcome = 'refreshed' | 'cached' | 'unavailable';

export interface GlobalAssetRateRow {
  id: string;
  user_id: null;
  pair: AssetRatePair;
  value: number;
  source: 'auto';
  fetched_at: string;
  created_at: string;
  updated_at: string;
}

interface QueryResult<T> {
  data: T | null;
  error: unknown | null;
}

interface AssetRatesSelectBuilder extends PromiseLike<QueryResult<unknown[]>> {
  is(column: string, value: null): AssetRatesSelectBuilder;
  eq(column: string, value: string): AssetRatesSelectBuilder;
  order(
    column: string,
    options: { ascending: boolean },
  ): PromiseLike<QueryResult<unknown[]>>;
}

interface AssetRatesTableBuilder {
  select(columns: string): AssetRatesSelectBuilder;
}

interface AuthResult {
  data: { user: unknown | null } | null;
  error: unknown | null;
}

interface ClaimAssetRateRefreshArgs {
  p_pair: AssetRatePair;
  p_cache_ttl_seconds: number;
  p_lease_seconds: number;
}

interface CompleteAssetRateRefreshArgs {
  p_pair: AssetRatePair;
  p_value: number;
  p_fetched_at: string;
  p_claim_token: string;
  p_retry_backoff_seconds: number;
}

interface FailAssetRateRefreshArgs {
  p_pair: AssetRatePair;
  p_claim_token: string;
  p_retry_backoff_seconds: number;
}

export interface AssetRatesSupabaseClient {
  auth: {
    getUser(accessToken: string): PromiseLike<AuthResult>;
  };
  from(table: 'asset_rates'): AssetRatesTableBuilder;
  rpc(
    functionName: 'claim_asset_rate_refresh',
    args: ClaimAssetRateRefreshArgs,
  ): PromiseLike<QueryResult<unknown>>;
  rpc(
    functionName: 'complete_asset_rate_refresh',
    args: CompleteAssetRateRefreshArgs,
  ): PromiseLike<QueryResult<unknown>>;
  rpc(
    functionName: 'fail_asset_rate_refresh',
    args: FailAssetRateRefreshArgs,
  ): PromiseLike<QueryResult<unknown>>;
}

type ProviderFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface FetchAssetRatesHandlerDependencies {
  getEnv(name: string): string | undefined;
  createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options: { auth: { persistSession: false } },
  ): AssetRatesSupabaseClient;
  createSecretKeyClient(
    supabaseUrl: string,
    supabaseKey: string,
    options: { auth: { persistSession: false } },
  ): AssetRatesSupabaseClient;
  fetch?: ProviderFetch;
  now?: () => Date;
}

interface RefreshSettings {
  cacheTtlSeconds: number;
  leaseSeconds: number;
  retryBackoffSeconds: number;
  providerTimeoutMs: number;
}

interface ProviderRate {
  value: number;
  fetchedAt: string;
}

interface CompletionResult {
  rate: GlobalAssetRateRow | undefined;
  stored: boolean;
}

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const jsonHeaders = {
  ...corsHeaders,
  'content-type': 'application/json',
};

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...jsonHeaders, ...headers },
  });
}

function unauthorized(): Response {
  return json(
    { ok: false, error: 'unauthorized' },
    401,
    { 'www-authenticate': 'Bearer' },
  );
}

export function createSecretKeyOnlyFetch(
  secretKey: string,
  fetchImplementation: ProviderFetch,
): ProviderFetch {
  return (input, init) => {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
    headers.delete('authorization');
    headers.set('apikey', secretKey);
    return fetchImplementation(input, { ...init, headers });
  };
}

export function createFetchAssetRatesHandler(
  dependencies: FetchAssetRatesHandlerDependencies,
): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method !== 'POST') {
      return json(
        { ok: false, error: 'method_not_allowed' },
        405,
        { allow: 'POST, OPTIONS' },
      );
    }

    const accessToken = parseBearerToken(req.headers.get('authorization'));
    if (!accessToken) return unauthorized();

    const supabaseUrl = optionalEnv(dependencies, 'SUPABASE_URL');
    const publishableKey = supabaseKey(
      dependencies,
      'SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_PUBLISHABLE_KEYS',
      'SUPABASE_ANON_KEY',
    );
    if (!supabaseUrl || !publishableKey) {
      return json({ ok: false, error: 'missing_server_config' }, 500);
    }

    let authClient: AssetRatesSupabaseClient;
    try {
      authClient = dependencies.createClient(supabaseUrl, publishableKey, {
        auth: { persistSession: false },
      });
    } catch {
      return json({ ok: false, error: 'authentication_unavailable' }, 500);
    }

    let authResult: AuthResult;
    try {
      authResult = await authClient.auth.getUser(accessToken);
    } catch {
      return unauthorized();
    }
    if (authResult.error || !authResult.data?.user) return unauthorized();

    let body: string;
    try {
      body = await req.text();
    } catch {
      return json({ ok: false, error: 'body_not_allowed' }, 400);
    }
    if (body !== '' && body.trim() !== '{}') {
      return json({ ok: false, error: 'body_not_allowed' }, 400);
    }

    const secretKey = supabaseKey(
      dependencies,
      'SUPABASE_SECRET_KEY',
      'SUPABASE_SECRET_KEYS',
      'SUPABASE_SERVICE_ROLE_KEY',
    );
    if (!secretKey) {
      return json({ ok: false, error: 'missing_server_config' }, 500);
    }

    let serviceClient: AssetRatesSupabaseClient;
    try {
      const createServiceClient = isSupabaseSecretKey(secretKey)
        ? dependencies.createSecretKeyClient
        : dependencies.createClient;
      serviceClient = createServiceClient(supabaseUrl, secretKey, {
        auth: { persistSession: false },
      });
    } catch {
      return json({ ok: false, error: 'rate_store_failed' }, 500);
    }

    let cachedRates: GlobalAssetRateRow[];
    try {
      cachedRates = await listGlobalAutoRates(serviceClient);
    } catch {
      return json({ ok: false, error: 'rate_store_failed' }, 500);
    }

    const currentTime = dependencies.now?.() ?? new Date();
    const nowMs = currentTime.getTime();
    if (!Number.isFinite(nowMs)) {
      return json({ ok: false, error: 'server_error' }, 500);
    }

    const settings = refreshSettings(dependencies);
    const fetchProvider = dependencies.fetch ?? globalThis.fetch.bind(globalThis);
    const ratesByPair = latestRatesByPair(cachedRates);
    const outcomes: Record<AssetRatePair, AssetRateOutcome> = {
      USD_VND: ratesByPair.has(USD_VND_PAIR) ? 'cached' : 'unavailable',
      GOLD_GRAM_VND: ratesByPair.has(GOLD_GRAM_VND_PAIR) ? 'cached' : 'unavailable',
    };

    let usdRate = ratesByPair.get(USD_VND_PAIR);
    let usdDependencyFresh = isFresh(
      usdRate,
      nowMs,
      settings.cacheTtlSeconds,
    );

    if (!usdDependencyFresh) {
      let claimToken: string | null;
      try {
        claimToken = await claimRefresh(
          serviceClient,
          USD_VND_PAIR,
          settings,
        );
      } catch {
        return json({ ok: false, error: 'rate_store_failed' }, 500);
      }

      if (claimToken) {
        const providerRate = await fetchUsdVndRate(
          fetchProvider,
          envOrDefault(
            dependencies,
            'USD_VND_RATE_URL',
            DEFAULT_USD_VND_RATE_URL,
          ),
          settings.providerTimeoutMs,
          nowMs,
        );

        if (!providerRate) {
          try {
            await failRefresh(
              serviceClient,
              USD_VND_PAIR,
              claimToken,
              settings.retryBackoffSeconds,
            );
          } catch {
            return json({ ok: false, error: 'rate_store_failed' }, 500);
          }
        } else {
          let completion: CompletionResult;
          try {
            completion = await completeRefresh(
              serviceClient,
              USD_VND_PAIR,
              providerRate,
              claimToken,
              settings.retryBackoffSeconds,
            );
          } catch {
            return json({ ok: false, error: 'rate_store_failed' }, 500);
          }

          if (completion.rate) {
            usdRate = completion.rate;
            ratesByPair.set(USD_VND_PAIR, completion.rate);
          }
          outcomes.USD_VND = completion.stored
            ? 'refreshed'
            : completion.rate ? 'cached' : 'unavailable';
          usdDependencyFresh = completion.stored || isFresh(
            completion.rate,
            nowMs,
            settings.cacheTtlSeconds,
          );
        }
      } else {
        try {
          replaceRatesByPair(
            ratesByPair,
            latestRatesByPair(await listGlobalAutoRates(serviceClient)),
          );
        } catch {
          return json({ ok: false, error: 'rate_store_failed' }, 500);
        }
        usdRate = ratesByPair.get(USD_VND_PAIR);
        outcomes.USD_VND = usdRate ? 'cached' : 'unavailable';
        outcomes.GOLD_GRAM_VND = ratesByPair.has(GOLD_GRAM_VND_PAIR)
          ? 'cached'
          : 'unavailable';
        usdDependencyFresh = isFresh(
          usdRate,
          nowMs,
          settings.cacheTtlSeconds,
        );
      }
    }

    const goldRate = ratesByPair.get(GOLD_GRAM_VND_PAIR);
    const goldNeedsRefresh = !isFresh(
      goldRate,
      nowMs,
      settings.cacheTtlSeconds,
    );
    const goldApiKey = optionalEnv(dependencies, 'GOLD_API_KEY');

    if (goldNeedsRefresh && goldApiKey && usdDependencyFresh && usdRate) {
      let claimToken: string | null;
      try {
        claimToken = await claimRefresh(
          serviceClient,
          GOLD_GRAM_VND_PAIR,
          settings,
        );
      } catch {
        return json({ ok: false, error: 'rate_store_failed' }, 500);
      }

      if (claimToken) {
        const goldProviderRate = await fetchGoldXauUsdRate(
          fetchProvider,
          envOrDefault(
            dependencies,
            'GOLD_XAU_USD_RATE_URL',
            DEFAULT_GOLD_XAU_USD_RATE_URL,
          ),
          goldApiKey,
          settings.providerTimeoutMs,
          nowMs,
        );
        const goldGramVnd = goldProviderRate
          ? goldProviderRate.value * usdRate.value / TROY_OUNCE_GRAMS
          : null;
        const fetchedAt = goldProviderRate
          ? oldestTimestamp(goldProviderRate.fetchedAt, usdRate.fetched_at)
          : null;

        if (!isPositiveFiniteNumber(goldGramVnd) || !goldProviderRate || !fetchedAt) {
          try {
            await failRefresh(
              serviceClient,
              GOLD_GRAM_VND_PAIR,
              claimToken,
              settings.retryBackoffSeconds,
            );
          } catch {
            return json({ ok: false, error: 'rate_store_failed' }, 500);
          }
        } else {
          let completion: CompletionResult;
          try {
            completion = await completeRefresh(
              serviceClient,
              GOLD_GRAM_VND_PAIR,
              { value: goldGramVnd, fetchedAt },
              claimToken,
              settings.retryBackoffSeconds,
            );
          } catch {
            return json({ ok: false, error: 'rate_store_failed' }, 500);
          }

          if (completion.rate) {
            ratesByPair.set(GOLD_GRAM_VND_PAIR, completion.rate);
          }
          outcomes.GOLD_GRAM_VND = completion.stored
            ? 'refreshed'
            : completion.rate ? 'cached' : 'unavailable';
        }
      } else {
        try {
          replaceRatesByPair(
            ratesByPair,
            latestRatesByPair(await listGlobalAutoRates(serviceClient)),
          );
        } catch {
          return json({ ok: false, error: 'rate_store_failed' }, 500);
        }
        outcomes.GOLD_GRAM_VND = ratesByPair.has(GOLD_GRAM_VND_PAIR)
          ? 'cached'
          : 'unavailable';
      }
    }

    return json({
      ok: true,
      outcomes,
      rates: RATE_PAIRS.flatMap(pair => {
        const rate = ratesByPair.get(pair);
        return rate ? [rate] : [];
      }),
    });
  };
}

function parseBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function supabaseKey(
  dependencies: FetchAssetRatesHandlerDependencies,
  singularName: string,
  dictionaryName: string,
  legacyName: string,
): string | null {
  return optionalEnv(dependencies, singularName)
    ?? defaultDictionaryEntry(optionalEnv(dependencies, dictionaryName))
    ?? optionalEnv(dependencies, legacyName);
}

function defaultDictionaryEntry(input: string | null): string | null {
  if (!input) return null;
  try {
    const value: unknown = JSON.parse(input);
    if (!isRecord(value)) return null;
    return nonEmptyString(value.default)?.trim() ?? null;
  } catch {
    return null;
  }
}

function optionalEnv(
  dependencies: FetchAssetRatesHandlerDependencies,
  name: string,
): string | null {
  const value = dependencies.getEnv(name)?.trim();
  return value ? value : null;
}

function envOrDefault(
  dependencies: FetchAssetRatesHandlerDependencies,
  name: string,
  fallback: string,
): string {
  return optionalEnv(dependencies, name) ?? fallback;
}

function refreshSettings(
  dependencies: FetchAssetRatesHandlerDependencies,
): RefreshSettings {
  const providerTimeoutMs = boundedIntegerEnv(
    dependencies.getEnv('ASSET_RATE_PROVIDER_TIMEOUT_MS'),
    DEFAULT_PROVIDER_TIMEOUT_MS,
    MIN_PROVIDER_TIMEOUT_MS,
    MAX_PROVIDER_TIMEOUT_MS,
  );
  const configuredLeaseSeconds = boundedIntegerEnv(
    dependencies.getEnv('ASSET_RATE_REFRESH_LEASE_SECONDS'),
    DEFAULT_REFRESH_LEASE_SECONDS,
    MIN_REFRESH_LEASE_SECONDS,
    MAX_REFRESH_LEASE_SECONDS,
  );
  const minimumLeaseSeconds = Math.ceil(providerTimeoutMs / 1_000) + 5;

  return {
    cacheTtlSeconds: boundedIntegerEnv(
      dependencies.getEnv('ASSET_RATE_CACHE_TTL_SECONDS'),
      DEFAULT_CACHE_TTL_SECONDS,
      0,
      MAX_CACHE_TTL_SECONDS,
    ),
    leaseSeconds: Math.min(
      MAX_REFRESH_LEASE_SECONDS,
      Math.max(configuredLeaseSeconds, minimumLeaseSeconds),
    ),
    retryBackoffSeconds: boundedIntegerEnv(
      dependencies.getEnv('ASSET_RATE_RETRY_BACKOFF_SECONDS'),
      DEFAULT_RETRY_BACKOFF_SECONDS,
      MIN_RETRY_BACKOFF_SECONDS,
      MAX_RETRY_BACKOFF_SECONDS,
    ),
    providerTimeoutMs,
  };
}

function boundedIntegerEnv(
  input: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!input?.trim()) return fallback;
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}

function isFresh(
  rate: GlobalAssetRateRow | undefined,
  nowMs: number,
  cacheTtlSeconds: number,
): boolean {
  if (!rate || !Number.isFinite(nowMs)) return false;
  const updatedAtMs = Date.parse(rate.updated_at);
  if (!Number.isFinite(updatedAtMs)) return false;
  return updatedAtMs > nowMs - cacheTtlSeconds * 1_000;
}

async function listGlobalAutoRates(
  client: AssetRatesSupabaseClient,
): Promise<GlobalAssetRateRow[]> {
  const result = await client
    .from('asset_rates')
    .select(RATE_COLUMNS)
    .is('user_id', null)
    .eq('source', 'auto')
    .order('updated_at', { ascending: false });

  if (result.error) throw new Error('asset rate query failed');
  return (result.data ?? [])
    .map(normalizeGlobalRateRow)
    .filter((rate): rate is GlobalAssetRateRow => rate !== null);
}

function latestRatesByPair(
  rates: GlobalAssetRateRow[],
): Map<AssetRatePair, GlobalAssetRateRow> {
  const latest = new Map<AssetRatePair, GlobalAssetRateRow>();
  for (const rate of rates) {
    const current = latest.get(rate.pair);
    if (!current || Date.parse(rate.updated_at) > Date.parse(current.updated_at)) {
      latest.set(rate.pair, rate);
    }
  }
  return latest;
}

function replaceRatesByPair(
  target: Map<AssetRatePair, GlobalAssetRateRow>,
  replacement: Map<AssetRatePair, GlobalAssetRateRow>,
): void {
  target.clear();
  for (const [pair, rate] of replacement) target.set(pair, rate);
}

async function claimRefresh(
  client: AssetRatesSupabaseClient,
  pair: AssetRatePair,
  settings: RefreshSettings,
): Promise<string | null> {
  const result = await client.rpc('claim_asset_rate_refresh', {
    p_pair: pair,
    p_cache_ttl_seconds: settings.cacheTtlSeconds,
    p_lease_seconds: settings.leaseSeconds,
  });
  if (result.error) throw new Error('asset rate claim failed');
  return nonEmptyString(result.data);
}

async function completeRefresh(
  client: AssetRatesSupabaseClient,
  pair: AssetRatePair,
  providerRate: ProviderRate,
  claimToken: string,
  retryBackoffSeconds: number,
): Promise<CompletionResult> {
  const result = await client.rpc('complete_asset_rate_refresh', {
    p_pair: pair,
    p_value: providerRate.value,
    p_fetched_at: providerRate.fetchedAt,
    p_claim_token: claimToken,
    p_retry_backoff_seconds: retryBackoffSeconds,
  });
  if (result.error) throw new Error('asset rate completion failed');

  if (!Array.isArray(result.data) || result.data.length === 0) {
    return { rate: undefined, stored: false };
  }
  const completion = result.data[0];
  if (!isRecord(completion) || typeof completion.stored !== 'boolean') {
    throw new Error('invalid asset rate completion result');
  }

  const rate = normalizeGlobalRateRow(completion);
  if (!rate || rate.pair !== pair) {
    throw new Error('invalid asset rate completion row');
  }
  return { rate, stored: completion.stored };
}

async function failRefresh(
  client: AssetRatesSupabaseClient,
  pair: AssetRatePair,
  claimToken: string,
  retryBackoffSeconds: number,
): Promise<void> {
  const result = await client.rpc('fail_asset_rate_refresh', {
    p_pair: pair,
    p_claim_token: claimToken,
    p_retry_backoff_seconds: retryBackoffSeconds,
  });
  if (result.error) throw new Error('asset rate failure release failed');
}

function normalizeGlobalRateRow(input: unknown): GlobalAssetRateRow | null {
  if (!isRecord(input)) return null;
  if (input.user_id !== null || input.source !== 'auto') return null;
  if (!isAssetRatePair(input.pair)) return null;
  if (typeof input.id !== 'string' || input.id.trim() === '') return null;

  const value = numericValue(input.value);
  const fetchedAt = validTimestamp(input.fetched_at);
  const createdAt = validTimestamp(input.created_at);
  const updatedAt = validTimestamp(input.updated_at);
  if (!isPositiveFiniteNumber(value) || !fetchedAt || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id: input.id,
    user_id: null,
    pair: input.pair,
    value,
    source: 'auto',
    fetched_at: fetchedAt,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

async function fetchUsdVndRate(
  fetchProvider: ProviderFetch,
  url: string,
  timeoutMs: number,
  nowMs: number,
): Promise<ProviderRate | null> {
  return withProviderTimeout(timeoutMs, async signal => {
    const response = await fetchProvider(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal,
    });
    if (!response.ok) return null;

    const payload: unknown = await response.json();
    if (!isRecord(payload)) return null;
    if (payload.result !== 'success' || payload.base_code !== 'USD') return null;
    if (!isRecord(payload.rates) || !isPositiveFiniteNumber(payload.rates.VND)) {
      return null;
    }

    const fetchedAt = providerUnixSecondsToIso(
      payload.time_last_update_unix,
      nowMs,
    );
    return fetchedAt ? { value: payload.rates.VND, fetchedAt } : null;
  });
}

async function fetchGoldXauUsdRate(
  fetchProvider: ProviderFetch,
  url: string,
  apiKey: string,
  timeoutMs: number,
  nowMs: number,
): Promise<ProviderRate | null> {
  return withProviderTimeout(timeoutMs, async signal => {
    const response = await fetchProvider(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'x-access-token': apiKey,
      },
      signal,
    });
    if (!response.ok) return null;

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !isPositiveFiniteNumber(payload.price)) return null;
    if (payload.metal !== 'XAU' || payload.currency !== 'USD') return null;

    const fetchedAt = providerUnixSecondsToIso(payload.timestamp, nowMs);
    return fetchedAt ? { value: payload.price, fetchedAt } : null;
  });
}

async function withProviderTimeout<T>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T | null>,
): Promise<T | null> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>(resolve => {
    timeoutId = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } catch {
    return null;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function oldestTimestamp(first: string, second: string): string | null {
  const firstMs = Date.parse(first);
  const secondMs = Date.parse(second);
  if (!Number.isFinite(firstMs) || !Number.isFinite(secondMs)) return null;
  return new Date(Math.min(firstMs, secondMs)).toISOString();
}

function providerUnixSecondsToIso(
  input: unknown,
  nowMs: number,
): string | null {
  if (!isPositiveFiniteNumber(input)) return null;
  const timestampMs = input * 1_000;
  if (
    !Number.isFinite(timestampMs)
    || !Number.isFinite(nowMs)
    || timestampMs > nowMs + MAX_PROVIDER_FUTURE_SKEW_MS
  ) return null;
  const date = new Date(timestampMs);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function numericValue(input: unknown): number | null {
  if (typeof input === 'number') return input;
  if (typeof input !== 'string' || input.trim() === '') return null;
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : null;
}

function validTimestamp(input: unknown): string | null {
  return typeof input === 'string' && Number.isFinite(Date.parse(input))
    ? input
    : null;
}

function nonEmptyString(input: unknown): string | null {
  return typeof input === 'string' && input.trim() !== '' ? input : null;
}

function isSupabaseSecretKey(input: string): boolean {
  return input.startsWith('sb_secret_');
}

function isPositiveFiniteNumber(input: unknown): input is number {
  return typeof input === 'number' && Number.isFinite(input) && input > 0;
}

function isAssetRatePair(input: unknown): input is AssetRatePair {
  return input === USD_VND_PAIR || input === GOLD_GRAM_VND_PAIR;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

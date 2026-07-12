import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSecretKeyOnlyFetch,
  createFetchAssetRatesHandler,
  type AssetRatePair,
  type AssetRatesSupabaseClient,
  type FetchAssetRatesHandlerDependencies,
  type GlobalAssetRateRow,
} from '../../supabase/functions/_shared/asset-rates-handler';

const NOW = '2026-07-12T08:00:00.000Z';
const FRESH_UPDATED_AT = '2026-07-12T07:30:00.000Z';
const STALE_UPDATED_AT = '2026-07-11T20:00:00.000Z';
const OLD_QUOTE_AT = '2026-07-10T00:00:00.000Z';
const USD_PROVIDER_AT = '2026-07-12T07:30:00.000Z';
const GOLD_PROVIDER_AT = '2026-07-12T07:45:00.000Z';
const USD_PROVIDER_TIMESTAMP = Date.parse(USD_PROVIDER_AT) / 1_000;
const GOLD_PROVIDER_TIMESTAMP = Date.parse(GOLD_PROVIDER_AT) / 1_000;

type ProviderFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type RpcName =
  | 'claim_asset_rate_refresh'
  | 'complete_asset_rate_refresh'
  | 'fail_asset_rate_refresh';

interface RpcCall {
  functionName: RpcName;
  args: Record<string, unknown>;
}

interface CompletionOverride {
  rate?: unknown;
  stored: boolean;
}

interface HarnessOptions {
  env?: Record<string, string | undefined>;
  cachedRates?: unknown[];
  cachedRateSnapshots?: unknown[][];
  authError?: unknown;
  authUser?: unknown | null;
  authReject?: unknown;
  selectError?: unknown;
  rpcErrors?: Partial<Record<RpcName, unknown>>;
  claimTokens?: Partial<Record<AssetRatePair, string | null>>;
  completionOverrides?: Partial<Record<AssetRatePair, CompletionOverride>>;
  fetch?: ProviderFetch;
  now?: string;
}

function assetRate(
  pair: AssetRatePair,
  overrides: Partial<GlobalAssetRateRow> = {},
): GlobalAssetRateRow {
  return {
    id: `${pair.toLowerCase()}-rate`,
    user_id: null,
    pair,
    value: pair === 'USD_VND' ? 25_000 : 1_600_000,
    source: 'auto',
    fetched_at: OLD_QUOTE_AT,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: STALE_UPDATED_AT,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function request(options: {
  method?: string;
  authorization?: string | null;
  body?: BodyInit | null;
  headers?: HeadersInit;
} = {}): Request {
  const headers = new Headers(options.headers);
  if (options.authorization !== null) {
    headers.set('authorization', options.authorization ?? 'Bearer valid-token');
  }
  return new Request('https://example.test/fetch-asset-rates', {
    method: options.method ?? 'POST',
    headers,
    body: options.body,
  });
}

function configuredKey(
  env: Record<string, string | undefined>,
  preferred: string,
  dictionary: string,
  fallback: string,
): string | undefined {
  const direct = env[preferred]?.trim();
  if (direct) return direct;
  const dictionaryValue = env[dictionary]?.trim();
  if (dictionaryValue) {
    try {
      const parsed: unknown = JSON.parse(dictionaryValue);
      if (
        typeof parsed === 'object'
        && parsed !== null
        && !Array.isArray(parsed)
        && typeof (parsed as Record<string, unknown>).default === 'string'
      ) {
        const value = ((parsed as Record<string, unknown>).default as string).trim();
        if (value) return value;
      }
    } catch {
      // The production resolver also falls back when the dictionary is malformed.
    }
  }
  return env[fallback]?.trim();
}

function harness(options: HarnessOptions = {}) {
  const env: Record<string, string | undefined> = {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
    ...options.env,
  };
  const rpcCalls: RpcCall[] = [];
  const queryFilters: Array<{ method: string; column: string; value: unknown }> = [];
  const getUser = vi.fn(async () => {
    if (Object.prototype.hasOwnProperty.call(options, 'authReject')) {
      throw options.authReject;
    }
    return {
      data: {
        user: Object.prototype.hasOwnProperty.call(options, 'authUser')
          ? options.authUser ?? null
          : { id: 'user-1' },
      },
      error: options.authError ?? null,
    };
  });
  const providerFetch = vi.fn<ProviderFetch>(
    options.fetch ?? (async () => new Response(null, { status: 503 })),
  );

  let selectCount = 0;
  const selectQuery = {
    is: vi.fn((column: string, value: null) => {
      queryFilters.push({ method: 'is', column, value });
      return selectQuery;
    }),
    eq: vi.fn((column: string, value: string) => {
      queryFilters.push({ method: 'eq', column, value });
      return selectQuery;
    }),
    order: vi.fn(async () => {
      const snapshots = options.cachedRateSnapshots;
      const data = snapshots?.length
        ? snapshots[Math.min(selectCount, snapshots.length - 1)]
        : options.cachedRates ?? [];
      selectCount += 1;
      return { data, error: options.selectError ?? null };
    }),
  };
  const from = vi.fn((table: string) => {
    if (table !== 'asset_rates') throw new Error(`Unexpected table: ${table}`);
    return { select: vi.fn(() => selectQuery) };
  });

  const rpc = vi.fn(async (
    functionName: RpcName,
    args: Record<string, unknown>,
  ) => {
    rpcCalls.push({ functionName, args });
    const error = options.rpcErrors?.[functionName] ?? null;
    if (error) return { data: null, error };

    const pair = args.p_pair as AssetRatePair;
    if (functionName === 'claim_asset_rate_refresh') {
      const hasOverride = Object.prototype.hasOwnProperty.call(
        options.claimTokens ?? {},
        pair,
      );
      return {
        data: hasOverride
          ? options.claimTokens?.[pair] ?? null
          : `claim-${pair.toLowerCase()}`,
        error: null,
      };
    }

    if (functionName === 'fail_asset_rate_refresh') {
      return { data: true, error: null };
    }

    const completionOverride = options.completionOverrides?.[pair];
    if (completionOverride) {
      return {
        data: completionOverride.rate
          ? [{ ...completionOverride.rate as Record<string, unknown>, stored: completionOverride.stored }]
          : [],
        error: null,
      };
    }

    const existing = (options.cachedRates ?? []).find(candidate => (
      typeof candidate === 'object'
      && candidate !== null
      && 'pair' in candidate
      && candidate.pair === pair
    )) as Partial<GlobalAssetRateRow> | undefined;
    return {
      data: [{
        id: existing?.id ?? `generated-${pair.toLowerCase()}`,
        user_id: null,
        pair,
        value: args.p_value,
        source: 'auto',
        fetched_at: args.p_fetched_at,
        created_at: existing?.created_at ?? NOW,
        updated_at: options.now ?? NOW,
        stored: true,
      }],
      error: null,
    };
  });

  const anonClient = {
    auth: { getUser },
    from: vi.fn(() => {
      throw new Error('Auth client must not access asset rates');
    }),
    rpc: vi.fn(() => {
      throw new Error('Auth client must not call asset rate RPCs');
    }),
  } as unknown as AssetRatesSupabaseClient;
  const serviceClient = {
    auth: { getUser: vi.fn() },
    from,
    rpc,
  } as unknown as AssetRatesSupabaseClient;
  const createClient = vi.fn((
    _url: string,
    key: string,
    _clientOptions: { auth: { persistSession: false } },
  ) => {
    const publishableKey = configuredKey(
      env,
      'SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_PUBLISHABLE_KEYS',
      'SUPABASE_ANON_KEY',
    );
    const secretKey = configuredKey(
      env,
      'SUPABASE_SECRET_KEY',
      'SUPABASE_SECRET_KEYS',
      'SUPABASE_SERVICE_ROLE_KEY',
    );
    if (key === publishableKey) return anonClient;
    if (key === secretKey) return serviceClient;
    throw new Error('Unexpected Supabase key');
  });
  const createSecretKeyClient = vi.fn((
    _url: string,
    key: string,
    _clientOptions: { auth: { persistSession: false } },
  ) => {
    const secretKey = configuredKey(
      env,
      'SUPABASE_SECRET_KEY',
      'SUPABASE_SECRET_KEYS',
      'SUPABASE_SERVICE_ROLE_KEY',
    );
    if (!key.startsWith('sb_secret_') || key !== secretKey) {
      throw new Error('Unexpected Supabase secret key');
    }
    return serviceClient;
  });

  return {
    createClient,
    createSecretKeyClient,
    from,
    getUser,
    handle: createFetchAssetRatesHandler({
      getEnv: name => env[name],
      createClient: createClient as FetchAssetRatesHandlerDependencies['createClient'],
      createSecretKeyClient:
        createSecretKeyClient as FetchAssetRatesHandlerDependencies['createSecretKeyClient'],
      fetch: providerFetch,
      now: () => new Date(options.now ?? NOW),
    }),
    providerFetch,
    queryFilters,
    rpc,
    rpcCalls,
  };
}

function rpcCallsFor(context: ReturnType<typeof harness>, functionName: RpcName) {
  return context.rpcCalls.filter(call => call.functionName === functionName);
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createFetchAssetRatesHandler transport and auth', () => {
  it('handles unauthenticated CORS preflight requests', async () => {
    const context = harness();

    const response = await context.handle(request({
      method: 'OPTIONS',
      authorization: null,
    }));

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    expect(response.headers.get('access-control-allow-headers')).toContain('authorization');
    expect(context.createClient).not.toHaveBeenCalled();
  });

  it('rejects methods other than POST and OPTIONS', async () => {
    const context = harness();

    const response = await context.handle(request({ method: 'GET' }));

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST, OPTIONS');
    expect(await responseBody(response)).toEqual({
      ok: false,
      error: 'method_not_allowed',
    });
    expect(context.createClient).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'missing', authorization: null },
    { label: 'basic', authorization: 'Basic token' },
    { label: 'empty bearer', authorization: 'Bearer' },
    { label: 'ambiguous bearer', authorization: 'Bearer token extra' },
  ])('rejects a $label Authorization header', async ({ authorization }) => {
    const context = harness();

    const response = await context.handle(request({ authorization }));

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
    expect(await responseBody(response)).toEqual({ ok: false, error: 'unauthorized' });
    expect(context.createClient).not.toHaveBeenCalled();
  });

  it('validates the bearer token before creating a privileged client', async () => {
    const context = harness({ authUser: null });

    const response = await context.handle(request());

    expect(response.status).toBe(401);
    expect(context.getUser).toHaveBeenCalledWith('valid-token');
    expect(context.createClient).toHaveBeenCalledTimes(1);
    expect(context.createClient).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'anon-key',
      { auth: { persistSession: false } },
    );
    expect(context.from).not.toHaveBeenCalled();
  });

  it('rejects every non-empty body before privileged database access', async () => {
    const context = harness();

    const response = await context.handle(request({
      body: JSON.stringify({ force: true, rate: 1, user_id: 'another-user' }),
      headers: { 'content-type': 'application/json' },
    }));

    expect(response.status).toBe(400);
    expect(await responseBody(response)).toEqual({ ok: false, error: 'body_not_allowed' });
    expect(context.createClient).toHaveBeenCalledTimes(1);
    expect(context.providerFetch).not.toHaveBeenCalled();
    expect(context.rpc).not.toHaveBeenCalled();
  });

  it('prefers publishable and secret keys while retaining legacy fallbacks', async () => {
    const freshUsd = assetRate('USD_VND', { updated_at: FRESH_UPDATED_AT });
    const freshGold = assetRate('GOLD_GRAM_VND', { updated_at: FRESH_UPDATED_AT });
    const context = harness({
      cachedRates: [freshUsd, freshGold],
      env: {
        SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
        SUPABASE_SECRET_KEY: 'secret-key',
      },
    });

    const response = await context.handle(request());

    expect(response.status).toBe(200);
    expect(context.createClient).toHaveBeenNthCalledWith(
      1,
      'https://project.supabase.co',
      'publishable-key',
      { auth: { persistSession: false } },
    );
    expect(context.createClient).toHaveBeenNthCalledWith(
      2,
      'https://project.supabase.co',
      'secret-key',
      { auth: { persistSession: false } },
    );
    expect(context.createSecretKeyClient).not.toHaveBeenCalled();
    expect(JSON.stringify(await responseBody(response))).not.toContain('secret-key');
  });

  it('reads hosted Supabase key dictionaries through their default entries', async () => {
    const freshUsd = assetRate('USD_VND', { updated_at: FRESH_UPDATED_AT });
    const freshGold = assetRate('GOLD_GRAM_VND', { updated_at: FRESH_UPDATED_AT });
    const context = harness({
      cachedRates: [freshUsd, freshGold],
      env: {
        SUPABASE_ANON_KEY: undefined,
        SUPABASE_SERVICE_ROLE_KEY: undefined,
        SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({
          default: 'dictionary-publishable-key',
          rotated: 'ignored-publishable-key',
        }),
        SUPABASE_SECRET_KEYS: JSON.stringify({
          default: 'dictionary-secret-key',
          rotated: 'ignored-secret-key',
        }),
      },
    });

    const response = await context.handle(request());

    expect(response.status).toBe(200);
    expect(context.createClient).toHaveBeenNthCalledWith(
      1,
      'https://project.supabase.co',
      'dictionary-publishable-key',
      { auth: { persistSession: false } },
    );
    expect(context.createClient).toHaveBeenNthCalledWith(
      2,
      'https://project.supabase.co',
      'dictionary-secret-key',
      { auth: { persistSession: false } },
    );
  });

  it('routes sb_secret keys through the dedicated service client factory', async () => {
    const freshUsd = assetRate('USD_VND', { updated_at: FRESH_UPDATED_AT });
    const freshGold = assetRate('GOLD_GRAM_VND', { updated_at: FRESH_UPDATED_AT });
    const context = harness({
      cachedRates: [freshUsd, freshGold],
      env: {
        SUPABASE_ANON_KEY: undefined,
        SUPABASE_SERVICE_ROLE_KEY: undefined,
        SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({
          default: 'sb_publishable_browser-key',
        }),
        SUPABASE_SECRET_KEYS: JSON.stringify({
          default: 'sb_secret_server-key',
        }),
      },
    });

    const response = await context.handle(request());

    expect(response.status).toBe(200);
    expect(context.createClient).toHaveBeenCalledTimes(1);
    expect(context.createClient).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'sb_publishable_browser-key',
      { auth: { persistSession: false } },
    );
    expect(context.createSecretKeyClient).toHaveBeenCalledOnce();
    expect(context.createSecretKeyClient).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'sb_secret_server-key',
      { auth: { persistSession: false } },
    );
  });

  it('returns a secret-free error when required server config is missing', async () => {
    const context = harness({ env: { SUPABASE_SERVICE_ROLE_KEY: undefined } });

    const response = await context.handle(request());
    const body = await responseBody(response);

    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false, error: 'missing_server_config' });
    expect(JSON.stringify(body)).not.toContain('anon-key');
    expect(context.createClient).toHaveBeenCalledTimes(1);
  });
});

describe('createSecretKeyOnlyFetch', () => {
  it('sends sb_secret keys only through apikey and preserves other headers', async () => {
    const networkFetch = vi.fn<ProviderFetch>(
      async () => new Response(null, { status: 204 }),
    );
    const secretFetch = createSecretKeyOnlyFetch(
      'sb_secret_server-key',
      networkFetch,
    );

    await secretFetch(
      new Request('https://project.supabase.co/rest/v1/asset_rates', {
        headers: {
          authorization: 'Bearer sb_secret_server-key',
          'x-from-request': 'kept',
        },
      }),
      {
        headers: {
          apikey: 'sdk-value',
          authorization: 'Bearer sdk-added-value',
          'x-client-info': 'supabase-js/2.110.0',
        },
      },
    );

    expect(networkFetch).toHaveBeenCalledOnce();
    const headers = new Headers(networkFetch.mock.calls[0]?.[1]?.headers);
    expect(headers.get('apikey')).toBe('sb_secret_server-key');
    expect(headers.has('authorization')).toBe(false);
    expect(headers.get('x-from-request')).toBe('kept');
    expect(headers.get('x-client-info')).toBe('supabase-js/2.110.0');
  });
});

describe('createFetchAssetRatesHandler cache and coordination behavior', () => {
  it('measures freshness from updated_at while preserving an old provider quote timestamp', async () => {
    const usd = assetRate('USD_VND', {
      fetched_at: OLD_QUOTE_AT,
      updated_at: FRESH_UPDATED_AT,
    });
    const gold = assetRate('GOLD_GRAM_VND', {
      fetched_at: OLD_QUOTE_AT,
      updated_at: FRESH_UPDATED_AT,
    });
    const context = harness({ cachedRates: [gold, usd] });

    const response = await context.handle(request());

    expect(await responseBody(response)).toEqual({
      ok: true,
      outcomes: { USD_VND: 'cached', GOLD_GRAM_VND: 'cached' },
      rates: [usd, gold],
    });
    expect(context.providerFetch).not.toHaveBeenCalled();
    expect(context.rpc).not.toHaveBeenCalled();
  });

  it('refreshes a recent quote whose cache storage time is stale', async () => {
    const usd = assetRate('USD_VND', {
      fetched_at: '2026-07-12T07:55:00.000Z',
      updated_at: STALE_UPDATED_AT,
    });
    const context = harness({
      cachedRates: [usd],
      fetch: async () => jsonResponse({
        result: 'success',
        base_code: 'USD',
        rates: { VND: 26_100 },
        time_last_update_unix: USD_PROVIDER_TIMESTAMP,
      }),
    });

    const response = await context.handle(request());

    expect((await responseBody(response)).outcomes).toEqual({
      USD_VND: 'refreshed',
      GOLD_GRAM_VND: 'unavailable',
    });
    expect(rpcCallsFor(context, 'claim_asset_rate_refresh')).toHaveLength(1);
    expect(rpcCallsFor(context, 'complete_asset_rate_refresh')).toHaveLength(1);
  });

  it('returns stale cache without provider work when another caller owns the claim', async () => {
    const usd = assetRate('USD_VND');
    const gold = assetRate('GOLD_GRAM_VND');
    const context = harness({
      cachedRates: [usd, gold],
      claimTokens: { USD_VND: null },
      env: { GOLD_API_KEY: 'gold-key' },
    });

    const response = await context.handle(request());

    expect(await responseBody(response)).toEqual({
      ok: true,
      outcomes: { USD_VND: 'cached', GOLD_GRAM_VND: 'cached' },
      rates: [usd, gold],
    });
    expect(context.providerFetch).not.toHaveBeenCalled();
    expect(rpcCallsFor(context, 'claim_asset_rate_refresh')).toEqual([
      expect.objectContaining({ args: expect.objectContaining({ p_pair: 'USD_VND' }) }),
    ]);
  });

  it('returns unavailable when a missing rate is already claimed elsewhere', async () => {
    const context = harness({ claimTokens: { USD_VND: null } });

    const response = await context.handle(request());

    expect(await responseBody(response)).toEqual({
      ok: true,
      outcomes: { USD_VND: 'unavailable', GOLD_GRAM_VND: 'unavailable' },
      rates: [],
    });
    expect(context.providerFetch).not.toHaveBeenCalled();
  });

  it('re-reads rates after a claim miss and uses a concurrent refresh snapshot', async () => {
    const concurrentUsd = assetRate('USD_VND', {
      value: 26_250,
      fetched_at: USD_PROVIDER_AT,
      updated_at: FRESH_UPDATED_AT,
    });
    const concurrentGold = assetRate('GOLD_GRAM_VND', {
      value: 1_710_000,
      fetched_at: USD_PROVIDER_AT,
      updated_at: FRESH_UPDATED_AT,
    });
    const context = harness({
      cachedRateSnapshots: [[], [concurrentGold, concurrentUsd]],
      claimTokens: { USD_VND: null },
      env: { GOLD_API_KEY: 'gold-key' },
    });

    const response = await context.handle(request());

    expect(await responseBody(response)).toEqual({
      ok: true,
      outcomes: { USD_VND: 'cached', GOLD_GRAM_VND: 'cached' },
      rates: [concurrentUsd, concurrentGold],
    });
    expect(context.providerFetch).not.toHaveBeenCalled();
    expect(context.from).toHaveBeenCalledTimes(2);
  });

  it('re-reads a concurrently refreshed gold rate after its claim misses', async () => {
    const freshUsd = assetRate('USD_VND', {
      value: 26_250,
      fetched_at: USD_PROVIDER_AT,
      updated_at: FRESH_UPDATED_AT,
    });
    const concurrentGold = assetRate('GOLD_GRAM_VND', {
      value: 1_710_000,
      fetched_at: USD_PROVIDER_AT,
      updated_at: FRESH_UPDATED_AT,
    });
    const context = harness({
      cachedRateSnapshots: [[freshUsd], [concurrentGold, freshUsd]],
      claimTokens: { GOLD_GRAM_VND: null },
      env: { GOLD_API_KEY: 'gold-key' },
    });

    const response = await context.handle(request());

    expect(await responseBody(response)).toEqual({
      ok: true,
      outcomes: { USD_VND: 'cached', GOLD_GRAM_VND: 'cached' },
      rates: [freshUsd, concurrentGold],
    });
    expect(context.providerFetch).not.toHaveBeenCalled();
    expect(context.from).toHaveBeenCalledTimes(2);
  });

  it('bounds TTL, lease, timeout, and retry settings before sending RPC arguments', async () => {
    const context = harness({
      env: {
        ASSET_RATE_CACHE_TTL_SECONDS: '9999999',
        ASSET_RATE_PROVIDER_TIMEOUT_MS: '9999999',
        ASSET_RATE_REFRESH_LEASE_SECONDS: '9999999',
        ASSET_RATE_RETRY_BACKOFF_SECONDS: '9999999',
      },
      fetch: async () => jsonResponse({
        result: 'success',
        base_code: 'USD',
        rates: { VND: 26_000 },
        time_last_update_unix: USD_PROVIDER_TIMESTAMP,
      }),
    });

    await context.handle(request());

    expect(rpcCallsFor(context, 'claim_asset_rate_refresh')[0]?.args).toEqual({
      p_pair: 'USD_VND',
      p_cache_ttl_seconds: 604_800,
      p_lease_seconds: 120,
    });
    expect(rpcCallsFor(context, 'complete_asset_rate_refresh')[0]?.args).toMatchObject({
      p_retry_backoff_seconds: 300,
    });
  });

  it('scopes reads to global auto rows and orders cache entries by storage time', async () => {
    const context = harness({
      cachedRates: [
        assetRate('USD_VND', { updated_at: FRESH_UPDATED_AT }),
        assetRate('GOLD_GRAM_VND', { updated_at: FRESH_UPDATED_AT }),
      ],
    });

    await context.handle(request());

    expect(context.queryFilters).toEqual([
      { method: 'is', column: 'user_id', value: null },
      { method: 'eq', column: 'source', value: 'auto' },
    ]);
    expect(context.from).toHaveBeenCalledWith('asset_rates');
  });
});

describe('createFetchAssetRatesHandler provider and completion behavior', () => {
  it('aborts a never-resolving provider at the bounded timeout and returns cached fallback', async () => {
    vi.useFakeTimers();
    const staleUsd = assetRate('USD_VND', { value: 25_100 });
    let providerSignal: AbortSignal | undefined;
    const context = harness({
      cachedRates: [staleUsd],
      env: {
        ASSET_RATE_PROVIDER_TIMEOUT_MS: '1',
        ASSET_RATE_RETRY_BACKOFF_SECONDS: '7',
      },
      fetch: async (_input, init) => {
        providerSignal = init?.signal ?? undefined;
        return new Promise<Response>(() => undefined);
      },
    });

    const responsePromise = context.handle(request());
    await vi.advanceTimersByTimeAsync(250);
    const response = await responsePromise;

    expect(providerSignal?.aborted).toBe(true);
    expect(await responseBody(response)).toEqual({
      ok: true,
      outcomes: { USD_VND: 'cached', GOLD_GRAM_VND: 'unavailable' },
      rates: [staleUsd],
    });
    expect(rpcCallsFor(context, 'fail_asset_rate_refresh')[0]?.args).toEqual({
      p_pair: 'USD_VND',
      p_claim_token: 'claim-usd_vnd',
      p_retry_backoff_seconds: 7,
    });
  });

  it.each([
    ['failed result', { result: 'error', base_code: 'USD', rates: { VND: 26_000 }, time_last_update_unix: USD_PROVIDER_TIMESTAMP }],
    ['wrong base', { result: 'success', base_code: 'EUR', rates: { VND: 26_000 }, time_last_update_unix: USD_PROVIDER_TIMESTAMP }],
    ['zero rate', { result: 'success', base_code: 'USD', rates: { VND: 0 }, time_last_update_unix: USD_PROVIDER_TIMESTAMP }],
    ['missing timestamp', { result: 'success', base_code: 'USD', rates: { VND: 26_000 } }],
  ])('backs off and returns fallback for a USD payload with a %s', async (_label, payload) => {
    const context = harness({ fetch: async () => jsonResponse(payload) });

    const response = await context.handle(request());

    expect((await responseBody(response)).outcomes).toEqual({
      USD_VND: 'unavailable',
      GOLD_GRAM_VND: 'unavailable',
    });
    expect(rpcCallsFor(context, 'complete_asset_rate_refresh')).toHaveLength(0);
    expect(rpcCallsFor(context, 'fail_asset_rate_refresh')).toHaveLength(1);
  });

  it('rejects a USD provider timestamp beyond the maximum future skew', async () => {
    const futureTimestamp = (Date.parse(NOW) + 5 * 60_000 + 1_000) / 1_000;
    const context = harness({
      fetch: async () => jsonResponse({
        result: 'success',
        base_code: 'USD',
        rates: { VND: 26_000 },
        time_last_update_unix: futureTimestamp,
      }),
    });

    const response = await context.handle(request());

    expect((await responseBody(response)).outcomes).toEqual({
      USD_VND: 'unavailable',
      GOLD_GRAM_VND: 'unavailable',
    });
    expect(rpcCallsFor(context, 'complete_asset_rate_refresh')).toHaveLength(0);
    expect(rpcCallsFor(context, 'fail_asset_rate_refresh')).toHaveLength(1);
  });

  it('uses the default USD endpoint with an abort signal and stores provider quote metadata', async () => {
    const context = harness({
      fetch: async () => jsonResponse({
        result: 'success',
        base_code: 'USD',
        rates: { VND: 26_000 },
        time_last_update_unix: USD_PROVIDER_TIMESTAMP,
      }),
    });

    const response = await context.handle(request());

    expect(response.status).toBe(200);
    expect(context.providerFetch).toHaveBeenCalledWith(
      'https://open.er-api.com/v6/latest/USD',
      {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: expect.any(AbortSignal),
      },
    );
    expect(rpcCallsFor(context, 'complete_asset_rate_refresh')[0]?.args).toMatchObject({
      p_pair: 'USD_VND',
      p_value: 26_000,
      p_fetched_at: USD_PROVIDER_AT,
    });
  });

  it('does not claim or derive gold after a stale USD refresh fails', async () => {
    const staleUsd = assetRate('USD_VND');
    const staleGold = assetRate('GOLD_GRAM_VND');
    const context = harness({
      cachedRates: [staleUsd, staleGold],
      env: { GOLD_API_KEY: 'gold-key' },
      fetch: async () => new Response('unavailable', { status: 503 }),
    });

    const response = await context.handle(request());

    expect((await responseBody(response)).outcomes).toEqual({
      USD_VND: 'cached',
      GOLD_GRAM_VND: 'cached',
    });
    expect(context.providerFetch).toHaveBeenCalledTimes(1);
    expect(rpcCallsFor(context, 'claim_asset_rate_refresh')).toEqual([
      expect.objectContaining({ args: expect.objectContaining({ p_pair: 'USD_VND' }) }),
    ]);
    expect(rpcCallsFor(context, 'complete_asset_rate_refresh')).toHaveLength(0);
  });

  it.each([
    ['missing metal', { currency: 'USD', price: 2_000, timestamp: GOLD_PROVIDER_TIMESTAMP }],
    ['missing currency', { metal: 'XAU', price: 2_000, timestamp: GOLD_PROVIDER_TIMESTAMP }],
    ['wrong metal', { metal: 'XAG', currency: 'USD', price: 2_000, timestamp: GOLD_PROVIDER_TIMESTAMP }],
    ['wrong currency', { metal: 'XAU', currency: 'EUR', price: 2_000, timestamp: GOLD_PROVIDER_TIMESTAMP }],
  ])('requires exact GoldAPI identity fields: %s', async (_label, payload) => {
    const freshUsd = assetRate('USD_VND', { updated_at: FRESH_UPDATED_AT });
    const context = harness({
      cachedRates: [freshUsd],
      env: { GOLD_API_KEY: 'gold-key' },
      fetch: async () => jsonResponse(payload),
    });

    const response = await context.handle(request());

    expect((await responseBody(response)).outcomes).toEqual({
      USD_VND: 'cached',
      GOLD_GRAM_VND: 'unavailable',
    });
    expect(rpcCallsFor(context, 'complete_asset_rate_refresh')).toHaveLength(0);
    expect(rpcCallsFor(context, 'fail_asset_rate_refresh')).toHaveLength(1);
  });

  it('refreshes USD before gold and timestamps gold with the oldest dependency quote', async () => {
    const staleUsd = assetRate('USD_VND', { value: 24_900 });
    const staleGold = assetRate('GOLD_GRAM_VND', { value: 1_500_000 });
    const context = harness({
      cachedRates: [staleUsd, staleGold],
      env: {
        GOLD_API_KEY: 'gold-key',
        GOLD_XAU_USD_RATE_URL: 'https://gold-provider.test/XAU/USD',
      },
      fetch: async input => {
        if (String(input).includes('open.er-api.com')) {
          return jsonResponse({
            result: 'success',
            base_code: 'USD',
            rates: { VND: 26_200 },
            time_last_update_unix: USD_PROVIDER_TIMESTAMP,
          });
        }
        return jsonResponse({
          metal: 'XAU',
          currency: 'USD',
          price: 2_000,
          timestamp: GOLD_PROVIDER_TIMESTAMP,
        });
      },
    });

    const response = await context.handle(request());
    const body = await responseBody(response);
    const completions = rpcCallsFor(context, 'complete_asset_rate_refresh');

    expect(body.outcomes).toEqual({
      USD_VND: 'refreshed',
      GOLD_GRAM_VND: 'refreshed',
    });
    expect(context.providerFetch).toHaveBeenCalledTimes(2);
    expect(completions.map(call => call.args.p_pair)).toEqual([
      'USD_VND',
      'GOLD_GRAM_VND',
    ]);
    expect(completions[1]?.args).toMatchObject({
      p_pair: 'GOLD_GRAM_VND',
      p_fetched_at: USD_PROVIDER_AT,
    });
    expect(completions[1]?.args.p_value).toBeCloseTo(
      2_000 * 26_200 / 31.1034768,
      8,
    );
    expect(context.providerFetch).toHaveBeenLastCalledWith(
      'https://gold-provider.test/XAU/USD',
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'x-access-token': 'gold-key',
        },
        signal: expect.any(AbortSignal),
      },
    );
  });

  it('reports cached when monotonic completion keeps a newer database quote', async () => {
    const staleUsd = assetRate('USD_VND', { value: 24_900 });
    const newerRate = assetRate('USD_VND', {
      value: 26_500,
      fetched_at: '2026-07-12T07:55:00.000Z',
      updated_at: FRESH_UPDATED_AT,
    });
    const context = harness({
      cachedRates: [staleUsd],
      completionOverrides: {
        USD_VND: { rate: newerRate, stored: false },
      },
      fetch: async () => jsonResponse({
        result: 'success',
        base_code: 'USD',
        rates: { VND: 26_000 },
        time_last_update_unix: USD_PROVIDER_TIMESTAMP,
      }),
    });

    const response = await context.handle(request());

    expect(await responseBody(response)).toEqual({
      ok: true,
      outcomes: { USD_VND: 'cached', GOLD_GRAM_VND: 'unavailable' },
      rates: [newerRate],
    });
  });

  it('returns a secret-free 500 when rate storage fails', async () => {
    const context = harness({
      selectError: { message: 'service-role-secret database failure' },
    });

    const response = await context.handle(request());
    const body = await responseBody(response);

    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false, error: 'rate_store_failed' });
    expect(JSON.stringify(body)).not.toContain('service-role-secret');
    expect(context.providerFetch).not.toHaveBeenCalled();
  });
});

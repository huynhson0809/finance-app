import { describe, expect, it, vi } from 'vitest';
import {
  deleteCloudAssetRate,
  listCloudAssetRates,
  refreshCloudAssetRates,
  upsertCloudAssetRate,
} from '../../src/supabase/rates';
import type { AssetRateInput } from '../../src/supabase/rates';

interface Call {
  method: string;
  args: unknown[];
}

interface MockResult<T = unknown> {
  data: T | null;
  error: { message: string } | null;
}

interface AuthResult {
  data: { user: { id: string } | null };
  error: { message: string } | null;
}

interface ClientOptions {
  authResult?: AuthResult;
  selectResults?: MockResult[];
  upsertResult?: MockResult;
  deleteResult?: MockResult;
  invokeResult?: MockResult;
}

function globalRateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'global-usd',
    user_id: null,
    pair: 'USD_VND',
    value: '25400.75',
    source: 'auto',
    fetched_at: '2026-07-12T03:00:00.000Z',
    created_at: '2026-07-12T03:01:00.000Z',
    updated_at: '2026-07-12T03:02:00.000Z',
    ...overrides,
  };
}

function manualRateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'manual-usd',
    user_id: 'user-1',
    pair: 'USD_VND',
    value: 25800,
    source: 'manual',
    fetched_at: '2026-07-12T04:00:00.000Z',
    created_at: '2026-07-12T04:01:00.000Z',
    updated_at: '2026-07-12T04:02:00.000Z',
    ...overrides,
  };
}

function createClient(options: ClientOptions = {}) {
  const calls: Call[] = [];
  const selectResults = [...(options.selectResults ?? [])];
  const upsertedRows: unknown[] = [];

  function createQuery(result: MockResult) {
    const query = {
      eq(column: string, value: string) {
        calls.push({ method: 'eq', args: [column, value] });
        return query;
      },
      or(filters: string) {
        calls.push({ method: 'or', args: [filters] });
        return query;
      },
      order(column: string, opts: { ascending: boolean }) {
        calls.push({ method: 'order', args: [column, opts] });
        return query;
      },
      maybeSingle() {
        calls.push({ method: 'maybeSingle', args: [] });
        return Promise.resolve(result);
      },
      single() {
        calls.push({ method: 'single', args: [] });
        return Promise.resolve(result);
      },
      then<TResult1 = MockResult, TResult2 = never>(
        onfulfilled?: ((value: MockResult) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): PromiseLike<TResult1 | TResult2> {
        return Promise.resolve(result).then(onfulfilled, onrejected);
      },
    };
    return query;
  }

  const fromStage = {
    select(columns: string) {
      calls.push({ method: 'select', args: [columns] });
      const result = selectResults.shift() ?? { data: [], error: null };
      return createQuery(result);
    },
    upsert(row: unknown, upsertOptions: unknown) {
      upsertedRows.push(row);
      calls.push({ method: 'upsert', args: [row, upsertOptions] });
      return {
        select(columns: string) {
          calls.push({ method: 'select', args: [columns] });
          return createQuery(options.upsertResult ?? { data: null, error: null });
        },
      };
    },
    delete() {
      calls.push({ method: 'delete', args: [] });
      return createQuery(options.deleteResult ?? { data: null, error: null });
    },
  };

  const auth = {
    getUser: vi.fn().mockResolvedValue(options.authResult ?? {
      data: { user: { id: 'user-1' } },
      error: null,
    }),
  };
  const invoke = vi.fn(async (functionName: string, invokeOptions: unknown) => {
    calls.push({ method: 'invoke', args: [functionName, invokeOptions] });
    return options.invokeResult ?? { data: { ok: true }, error: null };
  });

  return {
    calls,
    auth,
    invoke,
    get upsertedRow() { return upsertedRows.at(-1); },
    client: {
      auth,
      functions: { invoke },
      from(table: string) {
        calls.push({ method: 'from', args: [table] });
        return fromStage;
      },
    },
  };
}

describe('cloud asset rates', () => {
  it('lists readable global automatic and current-user manual rows', async () => {
    const context = createClient({
      selectResults: [{
        data: [globalRateRow(), manualRateRow()],
        error: null,
      }],
    });

    await expect(listCloudAssetRates(context.client)).resolves.toEqual([
      {
        id: 'global-usd',
        userId: undefined,
        pair: 'USD_VND',
        value: 25400.75,
        source: 'auto',
        fetchedAt: '2026-07-12T03:00:00.000Z',
        createdAt: '2026-07-12T03:01:00.000Z',
        updatedAt: '2026-07-12T03:02:00.000Z',
      },
      {
        id: 'manual-usd',
        userId: 'user-1',
        pair: 'USD_VND',
        value: 25800,
        source: 'manual',
        fetchedAt: '2026-07-12T04:00:00.000Z',
        createdAt: '2026-07-12T04:01:00.000Z',
        updatedAt: '2026-07-12T04:02:00.000Z',
      },
    ]);
    expect(context.calls).toEqual([
      { method: 'from', args: ['asset_rates'] },
      {
        method: 'select',
        args: ['id,user_id,pair,value,source,fetched_at,created_at,updated_at'],
      },
      {
        method: 'or',
        args: ['and(user_id.is.null,source.eq.auto),and(user_id.eq.user-1,source.eq.manual)'],
      },
      { method: 'order', args: ['fetched_at', { ascending: false }] },
    ]);
  });

  it('upserts one current-user manual row per pair and preserves created_at', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-12T05:00:00.000Z'));
    const existing = manualRateRow({
      id: 'manual-gold',
      pair: 'GOLD_GRAM_VND',
      created_at: '2026-07-10T00:00:00.000Z',
    });
    const saved = manualRateRow({
      id: 'manual-gold',
      pair: 'GOLD_GRAM_VND',
      value: '2461000.5',
      fetched_at: '2026-07-12T04:59:00.000Z',
      created_at: '2026-07-10T00:00:00.000Z',
      updated_at: '2026-07-12T05:00:00.000Z',
    });
    const context = createClient({
      selectResults: [{ data: existing, error: null }],
      upsertResult: { data: saved, error: null },
    });
    const input: AssetRateInput = {
      id: 'caller-controlled-id',
      userId: 'another-user',
      pair: 'GOLD_GRAM_VND',
      value: 2460000,
      source: 'auto',
      fetchedAt: '2026-07-12T04:59:00.000Z',
      createdAt: '2026-07-12T05:00:00.000Z',
    };

    try {
      await expect(upsertCloudAssetRate(context.client, input)).resolves.toMatchObject({
        id: 'manual-gold',
        userId: 'user-1',
        pair: 'GOLD_GRAM_VND',
        value: 2461000.5,
        source: 'manual',
        createdAt: '2026-07-10T00:00:00.000Z',
      });
    } finally {
      vi.useRealTimers();
    }

    expect(context.upsertedRow).toEqual({
      user_id: 'user-1',
      pair: 'GOLD_GRAM_VND',
      value: 2460000,
      source: 'manual',
      fetched_at: '2026-07-12T04:59:00.000Z',
      created_at: '2026-07-10T00:00:00.000Z',
      updated_at: '2026-07-12T05:00:00.000Z',
    });
    expect(context.calls).toContainEqual({
      method: 'upsert',
      args: [expect.any(Object), { onConflict: 'user_id,pair' }],
    });
    expect(context.calls).toContainEqual({ method: 'eq', args: ['user_id', 'user-1'] });
    expect(context.calls).toContainEqual({ method: 'eq', args: ['pair', 'GOLD_GRAM_VND'] });
    expect(context.calls).toContainEqual({ method: 'eq', args: ['source', 'manual'] });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-positive or non-finite manual value %s',
    async value => {
      const context = createClient();

      await expect(upsertCloudAssetRate(context.client, {
        pair: 'USD_VND',
        value,
      })).rejects.toThrow('Asset rate value must be a positive finite number');
      expect(context.auth.getUser).not.toHaveBeenCalled();
      expect(context.calls).toEqual([]);
    },
  );

  it('clears only the current-user manual override for a pair', async () => {
    const context = createClient();

    await deleteCloudAssetRate(context.client, 'USD_VND');

    expect(context.calls).toEqual([
      { method: 'from', args: ['asset_rates'] },
      { method: 'delete', args: [] },
      { method: 'eq', args: ['user_id', 'user-1'] },
      { method: 'eq', args: ['pair', 'USD_VND'] },
      { method: 'eq', args: ['source', 'manual'] },
    ]);
  });

  it('returns both refreshed outcomes and response rates from one empty-body invocation', async () => {
    const usd = globalRateRow({ value: 25_400.75 });
    const gold = globalRateRow({
      id: 'global-gold',
      pair: 'GOLD_GRAM_VND',
      value: 2_450_000,
    });
    const context = createClient({
      invokeResult: {
        data: {
          ok: true,
          outcomes: { USD_VND: 'refreshed', GOLD_GRAM_VND: 'refreshed' },
          rates: [usd, gold],
        },
        error: null,
      },
    });

    await expect(refreshCloudAssetRates(context.client)).resolves.toEqual({
      ok: true,
      outcomes: { USD_VND: 'refreshed', GOLD_GRAM_VND: 'refreshed' },
      rates: [
        {
          id: 'global-usd',
          userId: undefined,
          pair: 'USD_VND',
          value: 25_400.75,
          source: 'auto',
          fetchedAt: '2026-07-12T03:00:00.000Z',
          createdAt: '2026-07-12T03:01:00.000Z',
          updatedAt: '2026-07-12T03:02:00.000Z',
        },
        {
          id: 'global-gold',
          userId: undefined,
          pair: 'GOLD_GRAM_VND',
          value: 2_450_000,
          source: 'auto',
          fetchedAt: '2026-07-12T03:00:00.000Z',
          createdAt: '2026-07-12T03:01:00.000Z',
          updatedAt: '2026-07-12T03:02:00.000Z',
        },
      ],
    });
    expect(context.invoke).toHaveBeenCalledWith('fetch-asset-rates', { method: 'POST' });
    expect(context.invoke).toHaveBeenCalledTimes(1);
    expect(context.invoke.mock.calls[0]?.[1]).not.toHaveProperty('body');
    expect(context.calls).toEqual([{
      method: 'invoke',
      args: ['fetch-asset-rates', { method: 'POST' }],
    }]);
    expect(context.auth.getUser).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'all cached',
      outcomes: { USD_VND: 'cached', GOLD_GRAM_VND: 'cached' },
      rates: [
        globalRateRow(),
        globalRateRow({ id: 'global-gold', pair: 'GOLD_GRAM_VND', value: 2_450_000 }),
      ],
    },
    {
      name: 'partially unavailable',
      outcomes: { USD_VND: 'refreshed', GOLD_GRAM_VND: 'unavailable' },
      rates: [globalRateRow()],
    },
  ] as const)('accepts a valid $name response', async ({ outcomes, rates }) => {
    const context = createClient({
      invokeResult: { data: { ok: true, outcomes, rates }, error: null },
    });

    await expect(refreshCloudAssetRates(context.client)).resolves.toMatchObject({
      ok: true,
      outcomes,
      rates: expect.any(Array),
    });
    expect(context.invoke).toHaveBeenCalledTimes(1);
    expect(context.calls).toHaveLength(1);
  });

  it('rejects SDK errors, explicit failures, and malformed failure payloads', async () => {
    const sdkError = createClient({
      invokeResult: { data: null, error: { message: 'Function returned 500' } },
    });
    const explicitFailure = createClient({
      invokeResult: { data: { ok: false, error: 'rate_store_failed' }, error: null },
    });
    const malformedFailure = createClient({
      invokeResult: { data: { ok: false, error: 500 }, error: null },
    });

    await expect(refreshCloudAssetRates(sdkError.client)).rejects.toThrow('Function returned 500');
    await expect(refreshCloudAssetRates(explicitFailure.client)).rejects.toThrow(
      'Asset rate refresh failed: rate_store_failed',
    );
    await expect(refreshCloudAssetRates(malformedFailure.client)).rejects.toThrow(
      'Malformed asset rate refresh response',
    );
    expect(sdkError.auth.getUser).not.toHaveBeenCalled();
    expect(explicitFailure.auth.getUser).not.toHaveBeenCalled();
    expect(malformedFailure.auth.getUser).not.toHaveBeenCalled();
  });

  it.each([
    ['missing outcomes', { ok: true, rates: [] }],
    [
      'unknown outcome',
      {
        ok: true,
        outcomes: { USD_VND: 'stale', GOLD_GRAM_VND: 'cached' },
        rates: [],
      },
    ],
    [
      'missing rates',
      {
        ok: true,
        outcomes: { USD_VND: 'cached', GOLD_GRAM_VND: 'cached' },
      },
    ],
    [
      'malformed rate row',
      {
        ok: true,
        outcomes: { USD_VND: 'refreshed', GOLD_GRAM_VND: 'unavailable' },
        rates: [globalRateRow({ source: 'manual' })],
      },
    ],
  ])('rejects a malformed successful response: %s', async (_name, payload) => {
    const context = createClient({ invokeResult: { data: payload, error: null } });

    await expect(refreshCloudAssetRates(context.client)).rejects.toThrow(
      'Malformed asset rate refresh response',
    );
    expect(context.invoke).toHaveBeenCalledTimes(1);
    expect(context.calls).toHaveLength(1);
  });

  it('surfaces authentication errors before querying rate rows', async () => {
    const context = createClient({
      authResult: {
        data: { user: null },
        error: { message: 'JWT expired' },
      },
    });

    await expect(listCloudAssetRates(context.client)).rejects.toThrow('JWT expired');
    expect(context.calls).toEqual([]);
  });

  it('rejects malformed numeric values instead of returning an invalid number', async () => {
    const context = createClient({
      selectResults: [{
        data: [globalRateRow({ value: 'not-a-number' })],
        error: null,
      }],
    });

    await expect(listCloudAssetRates(context.client)).rejects.toThrow(
      'Asset rate value must be a positive finite number',
    );
  });
});

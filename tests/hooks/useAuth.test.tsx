import { act, renderHook, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth, type AuthClient } from '../../src/hooks/useAuth';
import {
  assetQueryKeys,
  clearSpendlyQueryCacheForTests,
  spendlyQueryClient,
  spendlyQueryKeys,
} from '../../src/query/client';

const session = { access_token: 'token', user: { id: 'user-1' } } as Session;
const refreshedSession = { access_token: 'refreshed-token', user: { id: 'user-1' } } as Session;
const nextSession = { access_token: 'next-token', user: { id: 'user-2' } } as Session;
const staleSession = { access_token: 'stale-token', user: { id: 'user-stale' } } as Session;

const userCacheKeys = {
  rates: assetQueryKeys.rates,
  transactions: spendlyQueryKeys.transactions.recent(5),
  categories: spendlyQueryKeys.categories.custom(),
  budgets: spendlyQueryKeys.budgets.month('2026-07'),
};

function seedUserScopedCache(userId = 'user-1') {
  const rows = {
    rates: [{ id: `rate-${userId}`, userId, source: 'manual' }],
    transactions: [{ id: `transaction-${userId}`, userId }],
    categories: [{ id: `category-${userId}`, userId }],
    budgets: [{ id: `budget-${userId}`, userId }],
  };

  spendlyQueryClient.setQueryData(userCacheKeys.rates, rows.rates);
  spendlyQueryClient.setQueryData(userCacheKeys.transactions, rows.transactions);
  spendlyQueryClient.setQueryData(userCacheKeys.categories, rows.categories);
  spendlyQueryClient.setQueryData(userCacheKeys.budgets, rows.budgets);
  return rows;
}

function expectUserScopedCacheToBeEmpty(): void {
  expect(spendlyQueryClient.getQueryData(userCacheKeys.rates)).toBeUndefined();
  expect(spendlyQueryClient.getQueryData(userCacheKeys.transactions)).toBeUndefined();
  expect(spendlyQueryClient.getQueryData(userCacheKeys.categories)).toBeUndefined();
  expect(spendlyQueryClient.getQueryData(userCacheKeys.budgets)).toBeUndefined();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeClient(overrides: Partial<AuthClient['auth']> = {}) {
  const unsubscribe = vi.fn();
  let authListener: ((event: string, session: Session | null) => void) | null = null;

  const auth: AuthClient['auth'] = {
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    onAuthStateChange: vi.fn((callback) => {
      authListener = callback;
      return { data: { subscription: { unsubscribe } } };
    }),
    signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    ...overrides,
  };

  return {
    client: { auth },
    emitAuthChange: (next: Session | null, event = 'SIGNED_IN') => authListener?.(event, next),
    unsubscribe,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearSpendlyQueryCacheForTests();
});

describe('useAuth', () => {
  it('loads session from a Supabase-like client and updates from auth state changes', async () => {
    const { client, emitAuthChange } = makeClient();
    const { result } = renderHook(() => useAuth(client));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.setupError).toBe(false);
    expect(result.current.session).toBe(session);

    act(() => {
      emitAuthChange(nextSession);
    });

    expect(result.current.session).toBe(nextSession);
  });

  it('clears user-scoped cache and fetches fresh rows after user A changes to user B', async () => {
    const { client, emitAuthChange } = makeClient();
    const auth = renderHook(() => useAuth(client));
    await waitFor(() => expect(auth.result.current.session).toBe(session));

    const userARows = seedUserScopedCache();
    const userBTransactions = [{ id: 'transaction-user-2', userId: 'user-2' }];
    const loadTransactions = vi.fn(async () => userBTransactions);
    const firstMount = renderHook(() => useQuery({
      queryKey: userCacheKeys.transactions,
      queryFn: loadTransactions,
      staleTime: Infinity,
    }, spendlyQueryClient));

    expect(firstMount.result.current.data).toBe(userARows.transactions);
    expect(loadTransactions).not.toHaveBeenCalled();
    firstMount.unmount();

    act(() => {
      emitAuthChange(nextSession);
    });

    expect(auth.result.current.session).toBe(nextSession);
    expectUserScopedCacheToBeEmpty();

    const secondMount = renderHook(() => useQuery({
      queryKey: userCacheKeys.transactions,
      queryFn: loadTransactions,
      staleTime: Infinity,
    }, spendlyQueryClient));
    await waitFor(() => expect(secondMount.result.current.data).toBe(userBTransactions));

    expect(loadTransactions).toHaveBeenCalledTimes(1);
  });

  it('keeps cached data on a token refresh for the same user', async () => {
    const { client, emitAuthChange } = makeClient();
    const { result } = renderHook(() => useAuth(client));
    await waitFor(() => expect(result.current.session).toBe(session));
    const cachedRows = seedUserScopedCache();

    act(() => {
      emitAuthChange(refreshedSession, 'TOKEN_REFRESHED');
    });

    expect(result.current.session).toBe(refreshedSession);
    expect(spendlyQueryClient.getQueryData(userCacheKeys.rates)).toBe(cachedRows.rates);
    expect(spendlyQueryClient.getQueryData(userCacheKeys.transactions)).toBe(cachedRows.transactions);
    expect(spendlyQueryClient.getQueryData(userCacheKeys.categories)).toBe(cachedRows.categories);
    expect(spendlyQueryClient.getQueryData(userCacheKeys.budgets)).toBe(cachedRows.budgets);
  });

  it('clears user-scoped cache when user A signs out', async () => {
    const { client, emitAuthChange } = makeClient();
    const { result } = renderHook(() => useAuth(client));
    await waitFor(() => expect(result.current.session).toBe(session));
    seedUserScopedCache();

    act(() => {
      emitAuthChange(null, 'SIGNED_OUT');
    });

    expect(result.current.session).toBeNull();
    expectUserScopedCacheToBeEmpty();
  });

  it('reports setup error when client is missing', async () => {
    const { result } = renderHook(() => useAuth(null));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.setupError).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.session).toBeNull();
  });

  it('stores an auth error when getSession resolves with an error', async () => {
    const { client } = makeClient({
      getSession: vi.fn(async () => ({
        data: { session: null },
        error: { message: 'could not load session' },
      })),
    });
    const { result } = renderHook(() => useAuth(client));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('could not load session');
    expect(result.current.session).toBeNull();
  });

  it('stores an auth error when getSession rejects', async () => {
    const { client } = makeClient({
      getSession: vi.fn(async () => {
        throw new Error('network down');
      }),
    });
    const { result } = renderHook(() => useAuth(client));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('network down');
    expect(result.current.session).toBeNull();
  });

  it('keeps a newer auth-state session when getSession resolves later', async () => {
    const load = deferred<{ data: { session: Session | null }; error: null }>();
    const { client, emitAuthChange } = makeClient({
      getSession: vi.fn(() => load.promise),
    });
    const { result } = renderHook(() => useAuth(client));

    act(() => {
      emitAuthChange(nextSession);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.session).toBe(nextSession);
    const currentRows = seedUserScopedCache('user-2');

    await act(async () => {
      load.resolve({ data: { session: staleSession }, error: null });
      await load.promise;
    });

    expect(result.current.session).toBe(nextSession);
    expect(spendlyQueryClient.getQueryData(userCacheKeys.transactions)).toBe(
      currentRows.transactions,
    );
  });

  it('does not reuse cache when the auth client is replaced, even for the same user', async () => {
    const first = makeClient();
    const replacementLoad = deferred<{ data: { session: Session | null }; error: null }>();
    const replacement = makeClient({
      getSession: vi.fn(() => replacementLoad.promise),
    });
    const { result, rerender } = renderHook(({ authClient }) => useAuth(authClient), {
      initialProps: { authClient: first.client },
    });
    await waitFor(() => expect(result.current.session).toBe(session));
    seedUserScopedCache();

    rerender({ authClient: replacement.client });

    expect(result.current.loading).toBe(true);
    expect(result.current.session).toBeNull();
    expectUserScopedCacheToBeEmpty();
    expect(first.unsubscribe).toHaveBeenCalledTimes(1);

    await act(async () => {
      replacementLoad.resolve({ data: { session }, error: null });
      await replacementLoad.promise;
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.session).toBe(session);
    expectUserScopedCacheToBeEmpty();
  });

  it('starts Google OAuth with redirect to the current origin', async () => {
    const { client } = makeClient();
    const { result } = renderHook(() => useAuth(client));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.signInWithGoogle();
    });

    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  });

  it('throws a helpful error when Google OAuth fails', async () => {
    const { client } = makeClient({
      signInWithOAuth: vi.fn(async () => ({ data: {}, error: { message: 'oauth failed' } })),
    });
    const { result } = renderHook(() => useAuth(client));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.signInWithGoogle()).rejects.toThrow('oauth failed');
  });

  it('signs out and surfaces sign-out errors', async () => {
    const { client } = makeClient();
    const { result, rerender } = renderHook(({ authClient }) => useAuth(authClient), {
      initialProps: { authClient: client },
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.signOut();
    });
    expect(client.auth.signOut).toHaveBeenCalledTimes(1);

    const failingClient = makeClient({
      signOut: vi.fn(async () => ({ error: { message: 'sign out failed' } })),
    }).client;
    rerender({ authClient: failingClient });

    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(result.current.signOut()).rejects.toThrow('sign out failed');
  });

  it('cleans up the auth subscription and ignores callbacks after unmount', async () => {
    const load = deferred<{ data: { session: Session | null }; error: null }>();
    const { client, emitAuthChange, unsubscribe } = makeClient({
      getSession: vi.fn(() => load.promise),
    });
    const { result, unmount } = renderHook(() => useAuth(client));

    expect(result.current.loading).toBe(true);
    unmount();

    act(() => {
      emitAuthChange(nextSession);
    });
    await act(async () => {
      load.resolve({ data: { session }, error: null });
      await load.promise;
    });

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

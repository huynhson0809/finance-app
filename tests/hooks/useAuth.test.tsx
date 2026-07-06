import { act, renderHook, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth, type AuthClient } from '../../src/hooks/useAuth';

const session = { access_token: 'token', user: { id: 'user-1' } } as Session;
const nextSession = { access_token: 'next-token', user: { id: 'user-2' } } as Session;

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
    emitAuthChange: (next: Session | null) => authListener?.('SIGNED_IN', next),
    unsubscribe,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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

  it('reports setup error when client is missing', async () => {
    const { result } = renderHook(() => useAuth(null));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.setupError).toBe(true);
    expect(result.current.session).toBeNull();
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

  it('cleans up the auth subscription on unmount', async () => {
    const { client, unsubscribe } = makeClient();
    const { result, unmount } = renderHook(() => useAuth(client));

    await waitFor(() => expect(result.current.loading).toBe(false));
    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

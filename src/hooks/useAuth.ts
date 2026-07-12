import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { clearSpendlyQueryCache } from '../query/client';
import { supabase, type AppSupabaseClient } from '../supabase/client';

type AuthError = { message: string } | null;
type AuthSessionResponse = Promise<{ data: { session: Session | null }; error: AuthError }>;
type OAuthResponse = Promise<{ error: AuthError }>;
type SignOutResponse = Promise<{ error: AuthError }>;
type AuthSubscription = { unsubscribe: () => void };

export interface AuthClient {
  auth: {
    getSession: () => AuthSessionResponse;
    onAuthStateChange: (
      callback: (event: string, session: Session | null) => void,
    ) => { data: { subscription: AuthSubscription } };
    signInWithOAuth: (args: {
      provider: 'google';
      options: { redirectTo: string };
    }) => OAuthResponse;
    signOut: () => SignOutResponse;
  };
}

export interface AuthState {
  session: Session | null;
  loading: boolean;
  setupError: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

type AuthClientLike = AuthClient | AppSupabaseClient;

interface AuthSnapshot {
  client: AuthClientLike | null;
  session: Session | null;
  loading: boolean;
  setupError: boolean;
  error: string | null;
}

interface CacheAuthIdentity {
  client: AuthClientLike | null;
  userId: string | null | undefined;
}

let cacheAuthIdentity: CacheAuthIdentity | undefined;

function startCacheAuthScope(client: AuthClientLike | null): void {
  if (cacheAuthIdentity?.client === client) return;

  clearSpendlyQueryCache();
  cacheAuthIdentity = {
    client,
    userId: client ? undefined : null,
  };
}

function syncCacheAuthIdentity(client: AuthClientLike, session: Session | null): void {
  if (cacheAuthIdentity?.client !== client) return;

  const nextUserId = session?.user.id ?? null;
  if (cacheAuthIdentity.userId === undefined) {
    cacheAuthIdentity.userId = nextUserId;
    return;
  }
  if (cacheAuthIdentity.userId === nextUserId) return;

  clearSpendlyQueryCache();
  cacheAuthIdentity.userId = nextUserId;
}

export function useAuth(client: AuthClient | AppSupabaseClient | null = supabase): AuthState {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>({
    client,
    session: null,
    loading: true,
    setupError: false,
    error: null,
  });

  useEffect(() => {
    startCacheAuthScope(client);

    if (!client) {
      setSnapshot({
        client,
        session: null,
        loading: false,
        setupError: true,
        error: null,
      });
      return;
    }

    let active = true;
    let authStateChanged = false;
    setSnapshot({
      client,
      session: null,
      loading: true,
      setupError: false,
      error: null,
    });

    const commitSession = (nextSession: Session | null) => {
      if (!active) return;
      syncCacheAuthIdentity(client, nextSession);
      setSnapshot({
        client,
        session: nextSession,
        loading: false,
        setupError: false,
        error: null,
      });
    };

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      authStateChanged = true;
      commitSession(nextSession);
    });

    client.auth.getSession()
      .then(({ data, error: loadError }) => {
        if (!active || authStateChanged) return;
        if (loadError) {
          setSnapshot({
            client,
            session: null,
            loading: false,
            setupError: false,
            error: loadError.message,
          });
          return;
        }
        commitSession(data.session);
      })
      .catch((loadError: unknown) => {
        if (!active || authStateChanged) return;
        setSnapshot({
          client,
          session: null,
          loading: false,
          setupError: false,
          error: loadError instanceof Error ? loadError.message : String(loadError),
        });
      });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  const signInWithGoogle = useCallback(async () => {
    if (!client) throw new Error('Supabase client is not configured');
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw new Error(error.message);
  }, [client]);

  const signOut = useCallback(async () => {
    if (!client) throw new Error('Supabase client is not configured');
    const { error } = await client.auth.signOut();
    if (error) throw new Error(error.message);
  }, [client]);

  const currentSnapshot = snapshot.client === client
    ? snapshot
    : {
        client,
        session: null,
        loading: true,
        setupError: false,
        error: null,
      };

  return {
    session: currentSnapshot.session,
    loading: currentSnapshot.loading,
    setupError: currentSnapshot.setupError,
    error: currentSnapshot.error,
    signInWithGoogle,
    signOut,
  };
}

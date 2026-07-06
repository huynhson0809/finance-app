import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
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
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuth(client: AuthClient | AppSupabaseClient | null = supabase): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState(false);

  useEffect(() => {
    if (!client) {
      setSession(null);
      setSetupError(true);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setSetupError(false);

    client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
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

  return { session, loading, setupError, signInWithGoogle, signOut };
}

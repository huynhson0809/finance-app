import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { SignInScreen } from './SignInScreen';

interface AuthGateProps {
  children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const { t } = useTranslation();
  const { session, loading, setupError, error, signInWithGoogle } = useAuth();

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0e1117] px-4 text-sm text-slate-400">
        {t('auth.loading')}
      </main>
    );
  }

  if (setupError || !session) {
    return <SignInScreen setupError={setupError} authError={error} onSignIn={signInWithGoogle} />;
  }

  return <>{children}</>;
}

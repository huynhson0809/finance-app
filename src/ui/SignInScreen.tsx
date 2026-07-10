import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface SignInScreenProps {
  setupError: boolean;
  authError?: string | null;
  onSignIn: () => Promise<void>;
}

export function SignInScreen({ setupError, authError = null, onSignIn }: SignInScreenProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignIn() {
    setError(null);
    setSubmitting(true);
    try {
      await onSignIn();
    } catch {
      setError(t('auth.signInFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0e1117] px-4 text-slate-100">
      <section className="w-full max-w-sm rounded-[28px] border border-white/10 bg-white/[0.07] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur">
        <img
          src="/brand/spendly-mark.svg"
          alt=""
          aria-hidden="true"
          className="mb-4 h-16 w-16 rounded-[22px] shadow-[0_0_34px_rgba(56,189,248,0.24)]"
        />
        <h1 className="text-2xl font-semibold text-white">{t('auth.title')}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">{t('auth.subtitle')}</p>

        {setupError && (
          <div role="alert" className="mt-4 rounded-2xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">
            {t('auth.setupError')}
          </div>
        )}

        {authError && (
          <div role="alert" className="mt-4 rounded-2xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">
            {authError}
          </div>
        )}

        {error && (
          <div role="alert" className="mt-4 rounded-2xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleSignIn}
          disabled={setupError || submitting}
          className="mt-6 min-h-12 w-full rounded-2xl bg-sky-400 px-4 py-3 text-sm font-bold text-slate-950 shadow-[0_0_24px_rgba(56,189,248,0.24)] disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
        >
          {t('auth.signInWithGoogle')}
        </button>
      </section>
    </main>
  );
}

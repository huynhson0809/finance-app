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
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <section className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">{t('auth.title')}</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">{t('auth.subtitle')}</p>

        {setupError && (
          <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {t('auth.setupError')}
          </div>
        )}

        {authError && (
          <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {authError}
          </div>
        )}

        {error && (
          <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleSignIn}
          disabled={setupError || submitting}
          className="mt-6 w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {t('auth.signInWithGoogle')}
        </button>
      </section>
    </main>
  );
}

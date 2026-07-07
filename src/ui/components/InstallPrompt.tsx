import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PWA_PROMPT_OFFSET_CLASS, PWA_PROMPT_WIDTH_CLASS } from './primitives';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function InstallPrompt() {
  const { t } = useTranslation();
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!evt || dismissed) return null;

  async function install() {
    if (!evt) return;
    await evt.prompt();
    await evt.userChoice;
    setEvt(null);
  }

  return (
    <div
      role="dialog"
      aria-label={t('install.message')}
      className={`fixed ${PWA_PROMPT_OFFSET_CLASS} ${PWA_PROMPT_WIDTH_CLASS} z-40 bg-emerald-600 text-white text-sm px-4 py-2 rounded shadow flex items-center justify-between`}
    >
      <span>{t('install.message')}</span>
      <div className="flex items-center gap-3">
        <button type="button" onClick={install} className="font-semibold">
          {t('install.cta')}
        </button>
        <button type="button" onClick={() => setDismissed(true)} aria-label={t('install.dismiss')}>×</button>
      </div>
    </div>
  );
}

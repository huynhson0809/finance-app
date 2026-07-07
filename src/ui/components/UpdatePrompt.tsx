import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { PWA_PROMPT_OFFSET_CLASS, PWA_PROMPT_WIDTH_CLASS } from './primitives';

export function UpdatePrompt() {
  const { t } = useTranslation();
  const { needRefresh: [need, setNeed], updateServiceWorker } = useRegisterSW({
    onRegisterError(err) { console.error('SW register failed', err); },
  });
  if (!need) return null;
  return (
    <div
      role="status"
      className={`fixed ${PWA_PROMPT_OFFSET_CLASS} ${PWA_PROMPT_WIDTH_CLASS} z-50 bg-blue-600 text-white text-sm px-4 py-2 rounded shadow flex items-center justify-between`}
    >
      <span>{t('pwa.updateAvailable')}</span>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => updateServiceWorker(true)} className="font-semibold">
          {t('pwa.refresh')}
        </button>
        <button type="button" onClick={() => setNeed(false)} aria-label={t('pwa.dismiss')}>×</button>
      </div>
    </div>
  );
}

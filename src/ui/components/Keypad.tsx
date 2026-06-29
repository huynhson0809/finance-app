import { useTranslation } from 'react-i18next';

const KEYS = ['1','2','3','4','5','6','7','8','9','000','0','⌫'];
export function Keypad({ onChange }: { onChange: (next: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-3 gap-2 p-2">
      {KEYS.map(k => (
        <button key={k}
          type="button"
          aria-label={k === '⌫' ? t('add.delete') : k}
          className="py-4 text-xl bg-gray-100 rounded"
          onClick={() => onChange(k)}
        >{k}</button>
      ))}
    </div>
  );
}

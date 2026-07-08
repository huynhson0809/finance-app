import { useTranslation } from 'react-i18next';
import { KeypadButton } from './primitives';

const KEYS = ['1','2','3','4','5','6','7','8','9','000','0','⌫'];

export function Keypad({ onChange }: { onChange: (next: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-3 gap-2 px-4 py-3">
      {KEYS.map(k => (
        <KeypadButton
          key={k}
          label={k === '⌫' ? t('add.delete') : k}
          onPress={() => onChange(k)}
        >
          {k}
        </KeypadButton>
      ))}
    </div>
  );
}

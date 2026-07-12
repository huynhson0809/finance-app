import { useState, useRef, useEffect } from 'react';
import { Delete } from 'lucide-react';

function formatWithSeparator(digits: string): string {
  if (!digits) return '0';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

interface MoneyNumpadProps {
  value: string;
  onChange: (raw: string) => void;
  onDone?: () => void;
  maxDigits?: number;
}

export function MoneyNumpad({ value, onChange, onDone, maxDigits = 12 }: MoneyNumpadProps) {
  function press(digit: string) {
    if (digit === '00') {
      const next = value + '00';
      if (next.length <= maxDigits) onChange(next);
      return;
    }
    if (value === '0' && digit === '0') return;
    const next = value === '0' ? digit : value + digit;
    if (next.length <= maxDigits) onChange(next);
  }

  function backspace() {
    if (value.length <= 1) {
      onChange('');
      return;
    }
    onChange(value.slice(0, -1));
  }

  function clear() {
    onChange('');
  }

  const btnClass =
    'flex h-14 items-center justify-center rounded-xl bg-white/[0.07] text-xl font-semibold text-white active:bg-white/15 transition select-none';

  return (
    <div className="grid grid-cols-4 gap-1.5 px-2 pb-2 pt-1.5">
      {['7', '8', '9'].map(d => (
        <button key={d} type="button" className={btnClass} onClick={() => press(d)}>{d}</button>
      ))}
      <button type="button" className={`${btnClass} text-slate-400`} onClick={clear}>AC</button>

      {['4', '5', '6'].map(d => (
        <button key={d} type="button" className={btnClass} onClick={() => press(d)}>{d}</button>
      ))}
      <button type="button" className={`${btnClass} text-rose-400`} onClick={backspace}>
        <Delete aria-hidden="true" className="h-6 w-6" />
      </button>

      {['1', '2', '3'].map(d => (
        <button key={d} type="button" className={btnClass} onClick={() => press(d)}>{d}</button>
      ))}
      {onDone ? (
        <button
          type="button"
          className="row-span-2 flex items-center justify-center rounded-xl bg-sky-500 text-lg font-bold text-slate-950 active:bg-sky-400 transition select-none"
          onClick={onDone}
        >
          OK
        </button>
      ) : (
        <div className="row-span-2" />
      )}

      <button type="button" className={btnClass} onClick={() => press('0')}>0</button>
      <button type="button" className={`${btnClass} col-span-2`} onClick={() => press('00')}>000</button>
    </div>
  );
}

export function FixedMoneyNumpad({ value, onChange, onDone, maxDigits }: MoneyNumpadProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#1c1c1e] pb-[env(safe-area-inset-bottom)]">
      <MoneyNumpad value={value} onChange={onChange} onDone={onDone} maxDigits={maxDigits} />
    </div>
  );
}

interface MoneyInputFieldProps {
  value: string;
  onChange: (raw: string) => void;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
}

export function MoneyInputField({
  value,
  onChange,
  label,
  placeholder = '0',
  autoFocus = false,
  ...ariaProps
}: MoneyInputFieldProps) {
  const [showNumpad, setShowNumpad] = useState(autoFocus);
  const containerRef = useRef<HTMLDivElement>(null);

  const formatted = value ? formatWithSeparator(value) : '';

  useEffect(() => {
    if (!showNumpad) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowNumpad(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNumpad]);

  return (
    <div ref={containerRef}>
      <button
        type="button"
        onClick={() => setShowNumpad(true)}
        className={`flex min-h-12 w-full items-center rounded-xl border px-3 py-2 text-left text-lg font-bold transition ${
          showNumpad
            ? 'border-sky-400 bg-slate-900 ring-1 ring-sky-400/30'
            : 'border-white/10 bg-slate-950/70'
        }`}
        aria-label={ariaProps['aria-label'] ?? label}
        aria-invalid={ariaProps['aria-invalid']}
      >
        {formatted ? (
          <span className="text-white">{formatted}<span className="text-slate-500"> đ</span></span>
        ) : (
          <span className="text-slate-500">{placeholder}</span>
        )}
      </button>

      {showNumpad && (
        <FixedMoneyNumpad
          value={value}
          onChange={onChange}
          onDone={() => setShowNumpad(false)}
        />
      )}
    </div>
  );
}

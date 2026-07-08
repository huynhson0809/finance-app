export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  ariaLabel,
  onChange,
}: {
  value: T;
  options: readonly SegmentedOption<T>[];
  ariaLabel: string;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="grid gap-1 rounded-2xl border border-white/10 bg-black/20 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={[
              'min-h-11 rounded-xl px-3 text-sm font-semibold transition',
              active
                ? 'bg-sky-400 text-slate-950 shadow-[0_0_18px_rgba(56,189,248,0.35)]'
                : 'text-slate-300',
            ].join(' ')}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

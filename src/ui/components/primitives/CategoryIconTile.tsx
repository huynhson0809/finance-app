import type { ComponentType } from 'react';

interface CategoryIconTileProps<T extends string> {
  value: T;
  label: string;
  selected: boolean;
  onSelect: (value: T) => void;
  Icon: ComponentType<{ 'aria-hidden'?: boolean; className?: string }>;
  accentClass: string;
  surfaceClass: string;
}

export function CategoryIconTile<T extends string>({
  value,
  label,
  selected,
  onSelect,
  Icon,
  accentClass,
  surfaceClass,
}: CategoryIconTileProps<T>) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(value)}
      className={[
        'min-h-[5.75rem] rounded-2xl border px-2 py-3 text-center transition active:scale-[0.98]',
        selected
          ? 'border-sky-300 bg-sky-300/15 shadow-[0_0_18px_rgba(56,189,248,0.26)]'
          : 'border-white/10 bg-white/[0.055]',
      ].join(' ')}
    >
      <span className={`mx-auto flex h-10 w-10 items-center justify-center rounded-2xl ${surfaceClass}`}>
        <Icon aria-hidden={true} className={`h-6 w-6 ${accentClass}`} />
      </span>
      <span className="mt-2 block text-xs font-medium leading-tight text-slate-100">{label}</span>
    </button>
  );
}

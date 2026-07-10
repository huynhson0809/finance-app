import type { ComponentType } from 'react';

interface CategoryIconTileProps<T extends string> {
  value: T;
  label: string;
  selected: boolean;
  onSelect: (value: T) => void;
  Icon: ComponentType<{ 'aria-hidden'?: boolean; className?: string }>;
  accentClass: string;
  surfaceClass: string;
  density?: 'comfortable' | 'compact';
}

export function CategoryIconTile<T extends string>({
  value,
  label,
  selected,
  onSelect,
  Icon,
  accentClass,
  surfaceClass,
  density = 'comfortable',
}: CategoryIconTileProps<T>) {
  const compact = density === 'compact';

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(value)}
      className={[
        compact ? 'min-h-[4.45rem] rounded-xl px-1.5 py-2' : 'min-h-[5.75rem] rounded-2xl px-2 py-3',
        'border text-center transition active:scale-[0.98]',
        selected
          ? 'border-sky-300 bg-sky-300/15 shadow-[0_0_18px_rgba(56,189,248,0.26)]'
          : 'border-white/10 bg-white/[0.055]',
      ].join(' ')}
    >
      <span className={[
        compact ? 'h-8 w-8 rounded-xl' : 'h-10 w-10 rounded-2xl',
        `mx-auto flex items-center justify-center ${surfaceClass}`,
      ].join(' ')}>
        <Icon aria-hidden={true} className={`${compact ? 'h-5 w-5' : 'h-6 w-6'} ${accentClass}`} />
      </span>
      <span className={[
        compact ? 'mt-1 line-clamp-2 text-[0.68rem]' : 'mt-2 text-xs',
        'block font-medium leading-tight text-slate-100',
      ].join(' ')}>
        {label}
      </span>
    </button>
  );
}

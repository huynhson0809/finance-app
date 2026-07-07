import type { Category } from '../../../types';
import { CATEGORY_META } from '../../theme/categoryMeta';

export function CategoryIconTile({
  category,
  label,
  selected,
  onSelect,
}: {
  category: Category;
  label: string;
  selected: boolean;
  onSelect: (category: Category) => void;
}) {
  const meta = CATEGORY_META[category];
  const Icon = meta.Icon;

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(category)}
      className={[
        'min-h-[5.75rem] rounded-2xl border px-2 py-3 text-center transition active:scale-[0.98]',
        selected
          ? 'border-sky-300 bg-sky-300/15 shadow-[0_0_18px_rgba(56,189,248,0.26)]'
          : 'border-white/10 bg-white/[0.055]',
      ].join(' ')}
    >
      <span className={`mx-auto flex h-10 w-10 items-center justify-center rounded-2xl ${meta.surfaceClass}`}>
        <Icon aria-hidden="true" className={`h-6 w-6 ${meta.accentClass}`} />
      </span>
      <span className="mt-2 block text-xs font-medium leading-tight text-slate-100">{label}</span>
    </button>
  );
}

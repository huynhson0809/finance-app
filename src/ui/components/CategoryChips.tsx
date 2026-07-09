import { useTranslation } from 'react-i18next';
import { CATEGORIES, type Category, type CategoryOverride, type UserCategory } from '../../types';
import { categoryLabel, getCategoryMeta } from '../theme/categoryMeta';
import { CategoryIconTile } from './primitives';

export function CategoryChips({
  value,
  onSelect,
  categories = CATEGORIES,
  customCategories = [],
  categoryOverrides = [],
  labels = {},
  density = 'comfortable',
  className = '',
}: {
  value: Category | null;
  onSelect: (c: Category) => void;
  categories?: readonly Category[];
  customCategories?: readonly UserCategory[];
  categoryOverrides?: readonly CategoryOverride[];
  labels?: Partial<Record<Category, string>>;
  density?: 'comfortable' | 'compact';
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={[
      'grid grid-cols-3',
      density === 'compact' ? 'gap-1.5 px-0 py-2' : 'gap-2 px-4 py-3',
      className,
    ].join(' ')}>
      {categories.map(c => {
        const meta = getCategoryMeta(c, customCategories, categoryOverrides);
        return (
          <CategoryIconTile
            key={c}
            value={c}
            label={labels[c] ?? categoryLabel(c, customCategories, t, categoryOverrides)}
            selected={value === c}
            onSelect={onSelect}
            Icon={meta.Icon}
            accentClass={meta.accentClass}
            surfaceClass={meta.surfaceClass}
            density={density}
          />
        );
      })}
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { CATEGORIES, type Category } from '../../types';
import { CATEGORY_META } from '../theme/categoryMeta';
import { CategoryIconTile } from './primitives';

export function CategoryChips({
  value,
  onSelect,
  categories = CATEGORIES,
  density = 'comfortable',
  className = '',
}: {
  value: Category | null;
  onSelect: (c: Category) => void;
  categories?: readonly Category[];
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
        const meta = CATEGORY_META[c];
        return (
          <CategoryIconTile
            key={c}
            value={c}
            label={t(`category.${c}`)}
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

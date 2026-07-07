import { useTranslation } from 'react-i18next';
import { CATEGORIES, type Category } from '../../types';

export function CategoryChips({
  value, onSelect, categories = CATEGORIES,
}: {
  value: Category | null;
  onSelect: (c: Category) => void;
  categories?: readonly Category[];
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2 p-2">
      {categories.map(c => (
        <button key={c}
          type="button"
          aria-pressed={value === c}
          onClick={() => onSelect(c)}
          className={`px-3 py-2 rounded-full border text-sm ${value === c ? 'bg-blue-600 text-white' : 'bg-white'}`}
        >{t(`category.${c}`)}</button>
      ))}
    </div>
  );
}

import { describe, expect, it } from 'vitest';
import { CATEGORIES, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../../src/types';
import { CATEGORY_META, categoryToneClass } from '../../src/ui/theme/categoryMeta';

describe('categoryMeta', () => {
  it('defines visual metadata for every category', () => {
    expect(Object.keys(CATEGORY_META).sort()).toEqual([...CATEGORIES].sort());

    for (const category of CATEGORIES) {
      expect(CATEGORY_META[category].labelKey).toBe(`category.${category}`);
      expect(CATEGORY_META[category].accentClass).toMatch(/^text-/);
      expect(CATEGORY_META[category].surfaceClass).toMatch(/^bg-/);
      expect(CATEGORY_META[category].Icon).toBeDefined();
    }
  });

  it('maps category direction to readable money tones', () => {
    expect(categoryToneClass(EXPENSE_CATEGORIES[0])).toContain('rose');
    expect(categoryToneClass(INCOME_CATEGORIES[0])).toContain('emerald');
  });
});

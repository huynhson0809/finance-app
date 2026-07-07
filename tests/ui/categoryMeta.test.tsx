import { describe, expect, it } from 'vitest';
import { CATEGORIES, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../../src/types';
import {
  CATEGORY_META,
  categoryToneClass,
  isExpenseVisualCategory,
  isIncomeVisualCategory,
} from '../../src/ui/theme/categoryMeta';

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
    for (const category of EXPENSE_CATEGORIES) {
      expect(categoryToneClass(category)).toContain('rose');
    }

    for (const category of INCOME_CATEGORIES) {
      expect(categoryToneClass(category)).toContain('emerald');
    }
  });

  it('identifies visual category direction', () => {
    for (const category of EXPENSE_CATEGORIES) {
      expect(isExpenseVisualCategory(category)).toBe(true);
      expect(isIncomeVisualCategory(category)).toBe(false);
    }

    for (const category of INCOME_CATEGORIES) {
      expect(isExpenseVisualCategory(category)).toBe(false);
      expect(isIncomeVisualCategory(category)).toBe(true);
    }
  });
});

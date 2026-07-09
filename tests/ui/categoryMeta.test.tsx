import { describe, expect, it } from 'vitest';
import { CATEGORIES, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../../src/types';
import {
  CATEGORY_META,
  categoryLabel,
  categoryToneClass,
  getCategoryMeta,
  isExpenseVisualCategory,
  isIncomeVisualCategory,
} from '../../src/ui/theme/categoryMeta';
import type { Category, UserCategory } from '../../src/types';

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

  it('returns safe fallback metadata for custom categories', () => {
    expect(getCategoryMeta('custom-expense-pet-care').accentClass).toContain('rose');
    expect(getCategoryMeta('custom-expense-pet-care').surfaceClass).toMatch(/^bg-/);
    expect(getCategoryMeta('custom-expense-pet-care').Icon).toBeDefined();

    expect(getCategoryMeta('custom-income-freelance').accentClass).toContain('emerald');
    expect(getCategoryMeta('custom-income-freelance').surfaceClass).toMatch(/^bg-/);
    expect(getCategoryMeta('custom-income-freelance').Icon).toBeDefined();
  });

  it('labels custom categories by saved name before falling back to built-in or humanized labels', () => {
    const customCategories: UserCategory[] = [{
      id: 'custom-expense-pet-care',
      direction: 'expense',
      name: 'Pet Care',
      createdAt: '2099-06-04T14:48:00.000Z',
      updatedAt: '2099-06-04T14:48:00.000Z',
    }];
    const t = (key: string) => key === 'category.food-drinks' ? 'Food & Drinks' : key;

    expect(categoryLabel('custom-expense-pet-care', customCategories, t)).toBe('Pet Care');
    expect(categoryLabel('food-drinks', customCategories, t)).toBe('Food & Drinks');
    expect(categoryLabel('custom-expense-child-care' as Category, customCategories, t)).toBe('Child Care');
  });
});

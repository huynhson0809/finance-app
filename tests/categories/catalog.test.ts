import { describe, expect, it } from 'vitest';
import {
  categoryBelongsToDirection,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type UserCategory,
} from '../../src/types';
import { customCategoriesForDirection, categoriesForDirectionWithCustom } from '../../src/categories/catalog';

const customExpense: UserCategory = {
  id: 'custom-expense-pet-care',
  direction: 'expense',
  name: 'Pet care',
  createdAt: '2026-07-09T00:00:00.000Z',
  updatedAt: '2026-07-09T00:00:00.000Z',
};

const customIncome: UserCategory = {
  id: 'custom-income-freelance',
  direction: 'income',
  name: 'Freelance',
  createdAt: '2026-07-09T00:00:00.000Z',
  updatedAt: '2026-07-09T00:00:00.000Z',
};

describe('category catalog', () => {
  it('treats custom category ids as belonging to their prefixed direction only', () => {
    expect(categoryBelongsToDirection('custom-expense-pet-care', 'expense')).toBe(true);
    expect(categoryBelongsToDirection('custom-expense-pet-care', 'income')).toBe(false);
    expect(categoryBelongsToDirection('custom-income-freelance', 'income')).toBe(true);
    expect(categoryBelongsToDirection('custom-income-freelance', 'expense')).toBe(false);
  });

  it('filters custom category records by direction', () => {
    expect(customCategoriesForDirection([customExpense, customIncome], 'expense')).toEqual([customExpense]);
    expect(customCategoriesForDirection([customExpense, customIncome], 'income')).toEqual([customIncome]);
  });

  it('merges built-in categories with matching custom category ids', () => {
    expect(categoriesForDirectionWithCustom('expense', [customExpense, customIncome])).toEqual([
      ...EXPENSE_CATEGORIES,
      customExpense.id,
    ]);
    expect(categoriesForDirectionWithCustom('income', [customExpense, customIncome])).toEqual([
      ...INCOME_CATEGORIES,
      customIncome.id,
    ]);
  });

  it('orders built-in and custom category ids from a saved user order', () => {
    expect(categoriesForDirectionWithCustom('expense', [customExpense, customIncome], [
      customExpense.id,
      'coffee-bubble-tea',
      'missing-category' as never,
      'food-drinks',
    ])).toEqual([
      customExpense.id,
      'coffee-bubble-tea',
      'food-drinks',
      ...EXPENSE_CATEGORIES.filter(category => !['coffee-bubble-tea', 'food-drinks'].includes(category)),
    ]);
  });
});

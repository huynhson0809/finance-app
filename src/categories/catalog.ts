import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type Category,
  type TransactionDirection,
  type UserCategory,
} from '../types';

export function builtInCategoriesForDirection(direction: TransactionDirection): readonly Category[] {
  return direction === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

export function customCategoriesForDirection(
  categories: readonly UserCategory[],
  direction: TransactionDirection,
): UserCategory[] {
  return categories.filter(category => category.direction === direction);
}

export function categoriesForDirectionWithCustom(
  direction: TransactionDirection,
  customCategories: readonly UserCategory[] = [],
): Category[] {
  return [
    ...builtInCategoriesForDirection(direction),
    ...customCategoriesForDirection(customCategories, direction).map(category => category.id),
  ];
}

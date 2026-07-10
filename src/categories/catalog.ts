import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  categoryBelongsToDirection,
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
  savedOrder: readonly Category[] = [],
): Category[] {
  const defaultOrder = [
    ...builtInCategoriesForDirection(direction),
    ...customCategoriesForDirection(customCategories, direction).map(category => category.id),
  ];
  if (savedOrder.length === 0) return defaultOrder;

  const available = new Set(defaultOrder);
  const seen = new Set<Category>();
  const ordered = savedOrder.flatMap(category => {
    if (!available.has(category) || seen.has(category) || !categoryBelongsToDirection(category, direction)) {
      return [];
    }
    seen.add(category);
    return [category];
  });

  return [
    ...ordered,
    ...defaultOrder.filter(category => !seen.has(category)),
  ];
}

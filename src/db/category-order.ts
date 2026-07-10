import { categoryBelongsToDirection, type Category, type CategoryOrder, type TransactionDirection } from '../types';
import { getSetting, setSetting } from './settings';

const CATEGORY_ORDER_KEY_PREFIX = 'category-order';

function settingKey(ownerKey: string, direction: TransactionDirection): string {
  return `${CATEGORY_ORDER_KEY_PREFIX}:${ownerKey}:${direction}`;
}

function normalizeCategories(
  direction: TransactionDirection,
  categories: readonly Category[] | undefined,
): Category[] {
  const seen = new Set<Category>();
  return (categories ?? []).flatMap(category => {
    if (seen.has(category) || !categoryBelongsToDirection(category, direction)) return [];
    seen.add(category);
    return [category];
  });
}

function normalizeOrder(
  direction: TransactionDirection,
  value: unknown,
): CategoryOrder | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<CategoryOrder>;
  const categories = normalizeCategories(direction, candidate.categories);
  if (categories.length === 0) return null;
  return {
    direction,
    categories,
    updatedAt: typeof candidate.updatedAt === 'string'
      ? candidate.updatedAt
      : new Date().toISOString(),
  };
}

export async function getCategoryOrder(
  ownerKey: string,
  direction: TransactionDirection,
): Promise<CategoryOrder | null> {
  return normalizeOrder(direction, await getSetting(settingKey(ownerKey, direction)));
}

export async function replaceCategoryOrder(
  ownerKey: string,
  direction: TransactionDirection,
  categories: readonly Category[],
  updatedAt = new Date().toISOString(),
): Promise<CategoryOrder> {
  const order: CategoryOrder = {
    direction,
    categories: normalizeCategories(direction, categories),
    updatedAt,
  };
  await setSetting(settingKey(ownerKey, direction), order);
  return order;
}

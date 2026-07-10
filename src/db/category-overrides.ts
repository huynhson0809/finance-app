import { getSetting, setSetting } from './settings';
import { CATEGORIES, type BuiltInCategory, type CategoryIconKey, type CategoryOverride } from '../types';

const CATEGORY_OVERRIDES_KEY = 'category-overrides';

function isBuiltInCategory(category: string): category is BuiltInCategory {
  return (CATEGORIES as readonly string[]).includes(category);
}

function normalizeOverrides(value: unknown): CategoryOverride[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Partial<CategoryOverride>;
    if (!candidate.category || !isBuiltInCategory(candidate.category)) return [];

    return [{
      category: candidate.category,
      name: typeof candidate.name === 'string' && candidate.name.trim()
        ? candidate.name.trim()
        : undefined,
      iconKey: candidate.iconKey,
      updatedAt: typeof candidate.updatedAt === 'string'
        ? candidate.updatedAt
        : new Date().toISOString(),
    }];
  });
}

export async function getCategoryOverrides(): Promise<CategoryOverride[]> {
  return normalizeOverrides(await getSetting(CATEGORY_OVERRIDES_KEY));
}

export async function replaceCategoryOverrides(overrides: CategoryOverride[]): Promise<void> {
  await setSetting(CATEGORY_OVERRIDES_KEY, normalizeOverrides(overrides));
}

export async function upsertCategoryOverride(
  category: BuiltInCategory,
  values: { name?: string; iconKey?: CategoryIconKey },
): Promise<CategoryOverride> {
  const overrides = await getCategoryOverrides();
  const name = values.name?.trim() || undefined;
  const next: CategoryOverride = {
    category,
    name,
    iconKey: values.iconKey,
    updatedAt: new Date().toISOString(),
  };

  await setSetting(
    CATEGORY_OVERRIDES_KEY,
    [
      ...overrides.filter(item => item.category !== category),
      next,
    ],
  );

  return next;
}

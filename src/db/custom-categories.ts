import { getSetting, setSetting } from './settings';
import type {
  CategoryIconKey,
  CustomExpenseCategory,
  CustomIncomeCategory,
  TransactionDirection,
  UserCategory,
} from '../types';

const CUSTOM_CATEGORIES_SETTING_KEY = 'customCategories';

type CustomCategoryId = CustomExpenseCategory | CustomIncomeCategory;
type MutationResult<T> = {
  categories: UserCategory[];
  result: T;
};

let mutationQueue: Promise<void> = Promise.resolve();

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Category name cannot be blank');
  }
  return trimmed;
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'category';
}

function makeCustomCategoryId(direction: TransactionDirection, name: string): CustomCategoryId {
  const suffix = crypto.randomUUID().slice(0, 8);
  return `custom-${direction}-${slugify(name)}-${suffix}` as CustomCategoryId;
}

async function setCustomCategories(categories: UserCategory[]): Promise<void> {
  await setSetting(CUSTOM_CATEGORIES_SETTING_KEY, categories);
}

export async function getCustomCategories(): Promise<UserCategory[]> {
  return await getSetting<UserCategory[]>(CUSTOM_CATEGORIES_SETTING_KEY) ?? [];
}

export async function replaceCustomCategories(categories: UserCategory[]): Promise<void> {
  await setCustomCategories(categories);
}

function mutateCustomCategories<T>(
  mutation: (categories: UserCategory[]) => MutationResult<T>,
): Promise<T> {
  const run = mutationQueue.then(async () => {
    const current = await getCustomCategories();
    const { categories, result } = mutation(current);
    await setCustomCategories(categories);
    return result;
  });

  mutationQueue = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

export async function createCustomCategory(
  direction: TransactionDirection,
  name: string,
  iconKey?: CategoryIconKey,
): Promise<UserCategory> {
  const normalizedName = normalizeName(name);
  const now = new Date().toISOString();
  const category: UserCategory = {
    id: makeCustomCategoryId(direction, normalizedName),
    direction,
    name: normalizedName,
    iconKey,
    createdAt: now,
    updatedAt: now,
  };

  return mutateCustomCategories(categories => ({
    categories: [...categories, category],
    result: category,
  }));
}

export async function renameCustomCategory(id: CustomCategoryId, name: string): Promise<UserCategory> {
  const normalizedName = normalizeName(name);
  return mutateCustomCategories(categories => {
    const index = categories.findIndex(category => category.id === id);
    if (index === -1) {
      throw new Error(`Custom category not found: ${id}`);
    }

    const previous = categories[index];
    const now = new Date();
    const previousUpdatedAt = Date.parse(previous.updatedAt);
    const updatedAt = Number.isFinite(previousUpdatedAt) && now.getTime() <= previousUpdatedAt
      ? new Date(previousUpdatedAt + 1).toISOString()
      : now.toISOString();
    const renamed: UserCategory = {
      ...previous,
      name: normalizedName,
      updatedAt,
    };

    const next = [...categories];
    next[index] = renamed;
    return {
      categories: next,
      result: renamed,
    };
  });
}

export async function updateCustomCategoryIcon(
  id: CustomCategoryId,
  iconKey: CategoryIconKey,
): Promise<UserCategory> {
  return mutateCustomCategories(categories => {
    const index = categories.findIndex(category => category.id === id);
    if (index === -1) {
      throw new Error(`Custom category not found: ${id}`);
    }

    const previous = categories[index];
    const now = new Date();
    const previousUpdatedAt = Date.parse(previous.updatedAt);
    const updatedAt = Number.isFinite(previousUpdatedAt) && now.getTime() <= previousUpdatedAt
      ? new Date(previousUpdatedAt + 1).toISOString()
      : now.toISOString();
    const updated: UserCategory = {
      ...previous,
      iconKey,
      updatedAt,
    };

    const next = [...categories];
    next[index] = updated;
    return {
      categories: next,
      result: updated,
    };
  });
}

export async function deleteCustomCategory(id: CustomCategoryId): Promise<void> {
  await mutateCustomCategories(categories => ({
    categories: categories.filter(category => category.id !== id),
    result: undefined,
  }));
}

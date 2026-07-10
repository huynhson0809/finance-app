import type { AppSupabaseClient } from './client';
import type {
  BuiltInCategory,
  Category,
  CategoryIconKey,
  CategoryOverride,
  CategoryOrder,
  CustomExpenseCategory,
  CustomIncomeCategory,
  TransactionDirection,
  UserCategory,
} from '../types';

const CUSTOM_CATEGORY_COLUMNS = 'id,direction,name,icon_key,created_at,updated_at';
const CATEGORY_OVERRIDE_COLUMNS = 'category,name,icon_key,updated_at';
const CATEGORY_ORDER_COLUMNS = 'direction,categories,updated_at';

type CloudCustomCategoryId = CustomExpenseCategory | CustomIncomeCategory;
type CategoryTable = 'user_categories' | 'category_overrides' | 'category_orders';

interface QueryError {
  message: string;
}

interface QueryResult<T> {
  data: T | null;
  error: QueryError | null;
}

interface AuthUserResult {
  data: { user: { id: string } | null };
  error: QueryError | null;
}

interface CloudCustomCategoryRow {
  id: CloudCustomCategoryId;
  direction: TransactionDirection;
  name: string;
  icon_key: CategoryIconKey | null;
  created_at: string;
  updated_at: string;
}

interface CloudCategoryOverrideRow {
  category: BuiltInCategory;
  name: string | null;
  icon_key: CategoryIconKey | null;
  updated_at: string;
}

interface CloudCategoryOrderRow {
  direction: TransactionDirection;
  categories: Category[];
  updated_at: string;
}

interface CustomCategoryUpsertRow {
  id: CloudCustomCategoryId;
  user_id: string;
  direction: TransactionDirection;
  name: string;
  icon_key: CategoryIconKey | null;
  created_at: string;
  updated_at: string;
}

interface CategoryOverrideUpsertRow {
  user_id: string;
  category: BuiltInCategory;
  name: string | null;
  icon_key: CategoryIconKey | null;
  updated_at: string;
}

interface CategoryOrderUpsertRow {
  user_id: string;
  direction: TransactionDirection;
  categories: Category[];
  updated_at: string;
}

interface CategoryQueryBuilder<T> extends PromiseLike<QueryResult<T[]>> {
  order(column: string, opts: { ascending: boolean }): PromiseLike<QueryResult<T[]>>;
  eq(column: string, value: string): CategoryQueryBuilder<T>;
  single(): PromiseLike<QueryResult<T>>;
}

interface CategoryUpsertSelectBuilder<T> {
  select(columns: string): {
    single(): PromiseLike<QueryResult<T>>;
  };
}

interface CategoryDeleteFilterBuilder {
  eq(column: string, value: string): PromiseLike<{ error: QueryError | null }>;
}

interface CategoryTableBuilder<T, U> {
  select(columns: string): CategoryQueryBuilder<T>;
  upsert(row: U, opts: { onConflict: string }): CategoryUpsertSelectBuilder<T>;
  delete(): CategoryDeleteFilterBuilder;
}

interface CategoryClientInput {
  auth: {
    getUser(): Promise<AuthUserResult>;
  };
  from(table: CategoryTable): unknown;
}

type Assert<T extends true> = T;
export type SupabaseCategoryClientCompatibility = Assert<
  AppSupabaseClient['from'] extends CategoryClientInput['from'] ? true : false
>;

function customCategoriesTable(
  client: CategoryClientInput,
): CategoryTableBuilder<CloudCustomCategoryRow, CustomCategoryUpsertRow> {
  return client.from('user_categories') as CategoryTableBuilder<CloudCustomCategoryRow, CustomCategoryUpsertRow>;
}

function categoryOverridesTable(
  client: CategoryClientInput,
): CategoryTableBuilder<CloudCategoryOverrideRow, CategoryOverrideUpsertRow> {
  return client.from('category_overrides') as CategoryTableBuilder<CloudCategoryOverrideRow, CategoryOverrideUpsertRow>;
}

function categoryOrdersTable(
  client: CategoryClientInput,
): CategoryTableBuilder<CloudCategoryOrderRow, CategoryOrderUpsertRow> {
  return client.from('category_orders') as CategoryTableBuilder<CloudCategoryOrderRow, CategoryOrderUpsertRow>;
}

async function currentUserId(client: CategoryClientInput): Promise<string> {
  const result = await client.auth.getUser();
  if (result.error) {
    throw new Error(result.error.message);
  }
  if (!result.data.user) {
    throw new Error('No signed-in user');
  }
  return result.data.user.id;
}

function throwIfError(error: QueryError | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

function mapCustomCategory(row: CloudCustomCategoryRow): UserCategory {
  return {
    id: row.id,
    direction: row.direction,
    name: row.name,
    iconKey: row.icon_key ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCategoryOverride(row: CloudCategoryOverrideRow): CategoryOverride {
  return {
    category: row.category,
    name: row.name ?? undefined,
    iconKey: row.icon_key ?? undefined,
    updatedAt: row.updated_at,
  };
}

function mapCategoryOrder(row: CloudCategoryOrderRow): CategoryOrder {
  return {
    direction: row.direction,
    categories: row.categories,
    updatedAt: row.updated_at,
  };
}

export async function listCloudCustomCategories(
  client: CategoryClientInput,
): Promise<UserCategory[]> {
  const result = await customCategoriesTable(client)
    .select(CUSTOM_CATEGORY_COLUMNS)
    .order('created_at', { ascending: true });

  throwIfError(result.error);
  return (result.data ?? []).map(mapCustomCategory);
}

export async function upsertCloudCustomCategory(
  client: CategoryClientInput,
  category: UserCategory,
): Promise<UserCategory> {
  const userId = await currentUserId(client);
  const result = await customCategoriesTable(client)
    .upsert({
      id: category.id,
      user_id: userId,
      direction: category.direction,
      name: category.name,
      icon_key: category.iconKey ?? null,
      created_at: category.createdAt,
      updated_at: category.updatedAt,
    }, { onConflict: 'user_id,id' })
    .select(CUSTOM_CATEGORY_COLUMNS)
    .single();

  throwIfError(result.error);
  if (!result.data) {
    throw new Error('No category returned');
  }
  return mapCustomCategory(result.data);
}

export async function deleteCloudCustomCategory(
  client: CategoryClientInput,
  id: CloudCustomCategoryId,
): Promise<void> {
  const result = await customCategoriesTable(client)
    .delete()
    .eq('id', id);

  throwIfError(result.error);
}

export async function listCloudCategoryOverrides(
  client: CategoryClientInput,
): Promise<CategoryOverride[]> {
  const result = await categoryOverridesTable(client)
    .select(CATEGORY_OVERRIDE_COLUMNS)
    .order('category', { ascending: true });

  throwIfError(result.error);
  return (result.data ?? []).map(mapCategoryOverride);
}

export async function upsertCloudCategoryOverride(
  client: CategoryClientInput,
  override: CategoryOverride,
): Promise<CategoryOverride> {
  const userId = await currentUserId(client);
  const result = await categoryOverridesTable(client)
    .upsert({
      user_id: userId,
      category: override.category,
      name: override.name ?? null,
      icon_key: override.iconKey ?? null,
      updated_at: override.updatedAt,
    }, { onConflict: 'user_id,category' })
    .select(CATEGORY_OVERRIDE_COLUMNS)
    .single();

  throwIfError(result.error);
  if (!result.data) {
    throw new Error('No category override returned');
  }
  return mapCategoryOverride(result.data);
}

export async function listCloudCategoryOrders(
  client: CategoryClientInput,
): Promise<CategoryOrder[]> {
  const result = await categoryOrdersTable(client)
    .select(CATEGORY_ORDER_COLUMNS)
    .order('direction', { ascending: true });

  throwIfError(result.error);
  return (result.data ?? []).map(mapCategoryOrder);
}

export async function upsertCloudCategoryOrder(
  client: CategoryClientInput,
  order: CategoryOrder,
): Promise<CategoryOrder> {
  const userId = await currentUserId(client);
  const result = await categoryOrdersTable(client)
    .upsert({
      user_id: userId,
      direction: order.direction,
      categories: order.categories,
      updated_at: order.updatedAt,
    }, { onConflict: 'user_id,direction' })
    .select(CATEGORY_ORDER_COLUMNS)
    .single();

  throwIfError(result.error);
  if (!result.data) {
    throw new Error('No category order returned');
  }
  return mapCategoryOrder(result.data);
}

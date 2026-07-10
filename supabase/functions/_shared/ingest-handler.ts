import { buildExternalHash, normalizeIngestPayload } from './ingest.ts';
import {
  builtInCategoryOptionsForDirection,
  type GeminiCategoryDirection,
  type GeminiCategoryOption,
  suggestCategoryWithGemini,
} from './gemini-category.ts';

interface InsertError {
  code?: string;
}

interface InsertResult {
  error: InsertError | null;
}

interface InsertBuilder {
  insert(row: Record<string, unknown>): Promise<InsertResult>;
}

interface SelectResult<T> {
  data: T[] | null;
  error: unknown | null;
}

interface UserCategoriesQueryBuilder<T> extends PromiseLike<SelectResult<T>> {
  eq(column: string, value: string): UserCategoriesQueryBuilder<T>;
  order(column: string, options: { ascending: boolean }): Promise<SelectResult<T>>;
}

interface UserCategoriesBuilder<T> {
  select(columns: string): UserCategoriesQueryBuilder<T>;
}

interface UserCategoryRow {
  id: string;
  direction: string;
  name: string;
}

export interface IngestSupabaseClient {
  from(table: 'transactions'): InsertBuilder;
  from(table: 'user_categories'): UserCategoriesBuilder<UserCategoryRow>;
}

export interface IngestHandlerDependencies {
  getEnv(name: string): string | undefined;
  createClient(
    supabaseUrl: string,
    serviceRoleKey: string,
    options: { auth: { persistSession: false } },
  ): IngestSupabaseClient;
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, x-ingest-secret',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const jsonHeaders = {
  ...corsHeaders,
  'content-type': 'application/json',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

export function createIngestTransactionHandler(
  dependencies: IngestHandlerDependencies,
): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method !== 'POST') {
      return json({ ok: false, error: 'method_not_allowed' }, 405);
    }

    const expectedSecret = dependencies.getEnv('INGEST_SECRET');
    const providedSecret = req.headers.get('x-ingest-secret');
    if (!expectedSecret || providedSecret !== expectedSecret) {
      return json({ ok: false, error: 'unauthorized' }, 401);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: 'invalid_json' }, 400);
    }

    const normalized = normalizeIngestPayload(body);
    if (!normalized.ok) {
      return json({ ok: false, error: normalized.error }, 400);
    }

    const supabaseUrl = dependencies.getEnv('SUPABASE_URL');
    const serviceRoleKey = dependencies.getEnv('SUPABASE_SERVICE_ROLE_KEY');
    const defaultUserId = dependencies.getEnv('DEFAULT_USER_ID');
    if (!supabaseUrl || !serviceRoleKey || !defaultUserId) {
      return json({ ok: false, error: 'missing_server_config' }, 500);
    }

    const supabase = dependencies.createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const categories = await categoryOptionsForDefaultUser(
      supabase,
      defaultUserId,
      normalized.value.direction,
    );

    const aiCategory = await suggestCategoryWithGemini({
      text: normalized.value.content,
      direction: normalized.value.direction,
      categories,
      apiKey: dependencies.getEnv('GEMINI_API_KEY'),
      model: dependencies.getEnv('GEMINI_MODEL'),
    }, {
      fetch: dependencies.fetch,
    });
    const transaction = aiCategory
      ? { ...normalized.value, category: aiCategory }
      : normalized.value;
    const external_hash = await buildExternalHash(transaction);
    const { error } = await supabase.from('transactions').insert({
      ...transaction,
      user_id: defaultUserId,
      external_hash,
    });

    if (error?.code === '23505') {
      return json({ ok: true, status: 'duplicate' }, 200);
    }
    if (error) {
      console.error('insert transaction failed', error);
      return json({ ok: false, error: 'insert_failed' }, 500);
    }

    return json({ ok: true, status: 'inserted' }, 201);
  };
}

async function categoryOptionsForDefaultUser(
  supabase: IngestSupabaseClient,
  defaultUserId: string,
  direction: GeminiCategoryDirection,
): Promise<GeminiCategoryOption[]> {
  const builtIn = builtInCategoryOptionsForDirection(direction);

  try {
    const result = await supabase
      .from('user_categories')
      .select('id,direction,name')
      .eq('user_id', defaultUserId)
      .eq('direction', direction)
      .order('created_at', { ascending: true });

    if (result.error) {
      console.warn('list custom categories for ingest failed', result.error);
      return builtIn;
    }

    const custom = (result.data ?? [])
      .map(row => customCategoryOption(row, direction))
      .filter((option): option is GeminiCategoryOption => option !== null);

    return [...builtIn, ...custom];
  } catch (error) {
    console.warn('list custom categories for ingest failed', error);
    return builtIn;
  }
}

function customCategoryOption(
  row: UserCategoryRow,
  direction: GeminiCategoryDirection,
): GeminiCategoryOption | null {
  const id = row.id.trim();
  const label = row.name.trim();
  if (!id || !label || row.direction !== direction) return null;
  if (direction === 'expense' && !id.startsWith('custom-expense-')) return null;
  if (direction === 'income' && !id.startsWith('custom-income-')) return null;
  return { id, label, direction } as GeminiCategoryOption;
}

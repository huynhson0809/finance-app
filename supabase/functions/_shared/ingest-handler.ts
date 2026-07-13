import {
  buildExternalHash,
  normalizeIngestPayload,
  type NormalizedIngestPayload,
} from './ingest.ts';
import {
  builtInCategoryOptionsForDirection,
  type GeminiCategoryDirection,
  type GeminiCategoryOption,
  suggestCategoryWithGemini,
} from './gemini-category.ts';

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

interface IngestTransactionRpcArgs {
  p_user_id: string;
  p_bank: string;
  p_type: string;
  p_amount: number;
  p_transaction_time: string;
  p_content: string;
  p_category: string;
  p_direction: string;
  p_external_hash: string;
  p_account_identifier: string | null;
  p_card_identifier: string | null;
  p_balance_vnd: number | null;
}

interface IngestTransactionRpcResult {
  data: unknown;
  error: unknown | null;
}

type IngestTransactionRpcData =
  | {
      status: 'inserted';
      transaction_id: string;
      asset_account_id: string | null;
      asset_event_id: string | null;
    }
  | {
      status: 'duplicate';
      transaction_id: string | null;
      asset_account_id: string | null;
      asset_event_id: string | null;
    };

interface IngestLogRow {
  user_id: string;
  bank: string | null;
  type: string | null;
  amount: string | null;
  content: string | null;
  status: 'success' | 'duplicate' | 'error';
  error_code: string | null;
  error_detail: string | null;
  raw_payload: unknown;
}

interface IngestLogInsertBuilder {
  insert(row: IngestLogRow): PromiseLike<{ error: unknown | null }>;
}

interface LookupUserRpcResult {
  data: string | null;
  error: unknown | null;
}

export interface IngestSupabaseClient {
  from(table: 'user_categories'): UserCategoriesBuilder<UserCategoryRow>;
  from(table: 'ingest_logs'): IngestLogInsertBuilder;
  rpc(
    functionName: 'ingest_bank_email_transaction',
    args: IngestTransactionRpcArgs,
  ): PromiseLike<IngestTransactionRpcResult>;
  rpc(
    functionName: 'lookup_user_by_ingest_secret',
    args: { p_secret: string },
  ): PromiseLike<LookupUserRpcResult>;
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

async function writeLog(
  supabase: IngestSupabaseClient | null,
  userId: string | null,
  rawBody: unknown,
  status: IngestLogRow['status'],
  errorCode: string | null,
  errorDetail: string | null,
): Promise<void> {
  if (!supabase || !userId) return;
  const payload = typeof rawBody === 'object' && rawBody !== null ? rawBody as Record<string, unknown> : {};
  try {
    await supabase.from('ingest_logs').insert({
      user_id: userId,
      bank: typeof payload.bank === 'string' ? payload.bank : null,
      type: typeof payload.type === 'string' ? payload.type : null,
      amount: typeof payload.amount === 'string' ? payload.amount : (payload.amount != null ? String(payload.amount) : null),
      content: typeof payload.content === 'string' ? payload.content?.slice(0, 200) : null,
      status,
      error_code: errorCode,
      error_detail: errorDetail,
      raw_payload: rawBody,
    });
  } catch {
    // logging failure should not break the ingest response
  }
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

    const providedSecret = req.headers.get('x-ingest-secret');
    if (!providedSecret?.trim()) {
      return json({ ok: false, error: 'unauthorized' }, 401);
    }

    const supabaseUrl = dependencies.getEnv('SUPABASE_URL');
    const serviceRoleKey = dependencies.getEnv('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ ok: false, error: 'missing_server_config' }, 500);
    }

    const supabase = dependencies.createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Look up user by ingest secret
    let defaultUserId: string | null = null;
    try {
      const lookupResult = await supabase.rpc('lookup_user_by_ingest_secret', {
        p_secret: providedSecret,
      });
      if (lookupResult.data) {
        defaultUserId = lookupResult.data;
      }
    } catch {
      // lookup failed
    }

    if (!defaultUserId) {
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
      await writeLog(supabase, defaultUserId, body, 'error', normalized.error, null);
      return json({ ok: false, error: normalized.error }, 400);
    }

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
    const transaction: NormalizedIngestPayload = aiCategory
      ? { ...normalized.value, category: aiCategory }
      : normalized.value;
    const external_hash = await buildExternalHash(transaction);
    let rpcResult: IngestTransactionRpcResult;

    try {
      rpcResult = await supabase.rpc('ingest_bank_email_transaction', {
        p_user_id: defaultUserId,
        p_bank: transaction.bank,
        p_type: transaction.type,
        p_amount: transaction.amount,
        p_transaction_time: transaction.transaction_time,
        p_content: transaction.content,
        p_category: transaction.category,
        p_direction: transaction.direction,
        p_external_hash: external_hash,
        p_account_identifier: transaction.account_identifier ?? null,
        p_card_identifier: transaction.card_identifier ?? null,
        p_balance_vnd: transaction.balance_vnd ?? null,
      });
    } catch (error) {
      console.error('ingest transaction RPC failed', error);
      await writeLog(supabase, defaultUserId, body, 'error', 'rpc_exception', String(error));
      return json({ ok: false, error: 'insert_failed' }, 500);
    }

    if (rpcResult.error) {
      console.error('ingest transaction RPC failed', rpcResult.error);
      await writeLog(supabase, defaultUserId, body, 'error', 'rpc_error', JSON.stringify(rpcResult.error));
      return json({ ok: false, error: 'insert_failed' }, 500);
    }
    if (!isIngestTransactionRpcData(rpcResult.data)) {
      console.error('invalid ingest transaction RPC response', rpcResult.data);
      await writeLog(supabase, defaultUserId, body, 'error', 'invalid_rpc_response', JSON.stringify(rpcResult.data));
      return json({ ok: false, error: 'insert_failed' }, 500);
    }

    if (rpcResult.data.status === 'duplicate') {
      await writeLog(supabase, defaultUserId, body, 'duplicate', null, null);
      return json({ ok: true, status: 'duplicate' }, 200);
    }

    await writeLog(supabase, defaultUserId, body, 'success', null, null);
    return json({
      ok: true,
      status: 'inserted',
      transaction_id: rpcResult.data.transaction_id,
      asset_account_id: rpcResult.data.asset_account_id,
      asset_event_id: rpcResult.data.asset_event_id,
    }, 201);
  };
}

function isIngestTransactionRpcData(data: unknown): data is IngestTransactionRpcData {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;

  const candidate = data as Record<string, unknown>;
  if (
    !isNullableNonEmptyString(candidate.asset_account_id) ||
    !isNullableNonEmptyString(candidate.asset_event_id)
  ) {
    return false;
  }

  if (candidate.status === 'inserted') return isNonEmptyString(candidate.transaction_id);
  if (candidate.status === 'duplicate') {
    return isNullableNonEmptyString(candidate.transaction_id);
  }
  return false;
}

function isNullableNonEmptyString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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

import { buildExternalHash, normalizeIngestPayload } from './ingest.ts';

interface InsertError {
  code?: string;
}

interface InsertResult {
  error: InsertError | null;
}

interface InsertBuilder {
  insert(row: Record<string, unknown>): Promise<InsertResult>;
}

export interface IngestSupabaseClient {
  from(table: 'transactions'): InsertBuilder;
}

export interface IngestHandlerDependencies {
  getEnv(name: string): string | undefined;
  createClient(
    supabaseUrl: string,
    serviceRoleKey: string,
    options: { auth: { persistSession: false } },
  ): IngestSupabaseClient;
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
    const external_hash = await buildExternalHash(normalized.value);
    const { error } = await supabase.from('transactions').insert({
      ...normalized.value,
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

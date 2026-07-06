import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildExternalHash, normalizeIngestPayload } from '../_shared/ingest.ts';

const jsonHeaders = {
  'content-type': 'application/json',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  const expectedSecret = Deno.env.get('INGEST_SECRET');
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const defaultUserId = Deno.env.get('DEFAULT_USER_ID');
  if (!supabaseUrl || !serviceRoleKey || !defaultUserId) {
    return json({ ok: false, error: 'missing_server_config' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
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
});

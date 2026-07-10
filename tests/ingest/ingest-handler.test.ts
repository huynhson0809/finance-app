import { describe, expect, it, vi } from 'vitest';
import {
  createIngestTransactionHandler,
  type IngestSupabaseClient,
} from '../../supabase/functions/_shared/ingest-handler';

function request(init: RequestInit = {}): Request {
  return new Request('https://example.test/ingest-transaction', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ingest-secret': 'secret',
      ...(init.headers ?? {}),
    },
    body: JSON.stringify({
      bank: 'MB',
      type: 'transfer',
      amount: '297,000.00',
      datetime: '04-07-2026 21:48:49',
      content: '159287 1PEV8',
      raw_source: 'email',
    }),
    ...init,
  });
}

function handler(options: {
  env?: Record<string, string | undefined>;
  insertError?: { code?: string; message?: string } | null;
  inserts?: unknown[];
  userCategories?: Array<{
    id: string;
    direction: 'expense' | 'income';
    name: string;
  }>;
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
} = {}) {
  const env: Record<string, string | undefined> = {
    INGEST_SECRET: 'secret',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    DEFAULT_USER_ID: 'user-1',
    ...options.env,
  };
  const inserts = options.inserts ?? [];
  const userCategories = options.userCategories ?? [];
  const createClient = vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'user_categories') {
        const query = {
          eq: vi.fn(() => query),
          order: vi.fn(async () => ({ data: userCategories, error: null })),
        };
        return {
          select: vi.fn(() => query),
        };
      }

      return {
        insert: vi.fn(async (row: unknown) => {
          inserts.push({ table, row });
          return { error: options.insertError ?? null };
        }),
      };
    }),
  } as unknown as IngestSupabaseClient));

  return {
    inserts,
    createClient,
    handle: createIngestTransactionHandler({
      getEnv: name => env[name],
      createClient,
      fetch: options.fetch,
    }),
  };
}

async function jsonBody(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe('createIngestTransactionHandler', () => {
  it('rejects non-POST requests', async () => {
    const { handle } = handler();

    const response = await handle(request({ method: 'GET', body: null }));

    expect(response.status).toBe(405);
    expect(await jsonBody(response)).toEqual({ ok: false, error: 'method_not_allowed' });
  });

  it('rejects unauthorized requests before parsing JSON', async () => {
    const { handle, createClient } = handler();

    const response = await handle(request({
      headers: { 'x-ingest-secret': 'wrong' },
      body: '{',
    }));

    expect(response.status).toBe(401);
    expect(await jsonBody(response)).toEqual({ ok: false, error: 'unauthorized' });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON after secret validation', async () => {
    const { handle } = handler();

    const response = await handle(request({ body: '{' }));

    expect(response.status).toBe(400);
    expect(await jsonBody(response)).toEqual({ ok: false, error: 'invalid_json' });
  });

  it('reports missing server config', async () => {
    const { handle } = handler({ env: { DEFAULT_USER_ID: undefined } });

    const response = await handle(request());

    expect(response.status).toBe(500);
    expect(await jsonBody(response)).toEqual({ ok: false, error: 'missing_server_config' });
  });

  it('inserts normalized rows for the configured default user', async () => {
    const { handle, inserts, createClient } = handler();

    const response = await handle(request());

    expect(response.status).toBe(201);
    expect(await jsonBody(response)).toEqual({ ok: true, status: 'inserted' });
    expect(createClient).toHaveBeenCalledWith('https://project.supabase.co', 'service-role', {
      auth: { persistSession: false },
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      table: 'transactions',
      row: {
        bank: 'MB',
        type: 'transfer',
        amount: 297000,
        transaction_time: '2026-07-04T14:48:49.000Z',
        content: '159287 1PEV8',
        category: 'others',
        direction: 'expense',
        raw_source: 'email',
        user_id: 'user-1',
      },
    });
    expect((inserts[0] as { row: { external_hash: string } }).row.external_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('uses Gemini category suggestions when configured', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              { text: JSON.stringify({ category: 'food-drinks', confidence: 0.88 }) },
            ],
          },
        },
      ],
    })));
    const { handle, inserts } = handler({
      env: { GEMINI_API_KEY: 'gemini-key' },
      fetch,
    });

    const response = await handle(request({
      body: JSON.stringify({
        bank: 'MB',
        type: 'transfer',
        amount: '8,888.00',
        datetime: '08-07-2026 12:59:46',
        content: 'HUYNH NGOC SON chuyen tien an uong',
        raw_source: 'email',
      }),
    }));

    expect(response.status).toBe(201);
    expect(inserts[0]).toMatchObject({
      row: {
        category: 'food-drinks',
        content: 'HUYNH NGOC SON chuyen tien an uong',
      },
    });
  });

  it('includes default user custom categories in Gemini email suggestions', async () => {
    const fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      expect(payload.generationConfig.properties).toBeUndefined();
      expect(payload.generationConfig.responseSchema.properties.category.enum)
        .toContain('custom-expense-pickleball-1234');
      expect(payload.contents[0].parts[0].text).toContain('custom-expense-pickleball-1234: Pickleball');

      return new Response(JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                { text: JSON.stringify({ category: 'custom-expense-pickleball-1234', confidence: 0.92 }) },
              ],
            },
          },
        ],
      }));
    });
    const { handle, inserts } = handler({
      env: { GEMINI_API_KEY: 'gemini-key' },
      userCategories: [{
        id: 'custom-expense-pickleball-1234',
        direction: 'expense',
        name: 'Pickleball',
      }],
      fetch,
    });

    const response = await handle(request({
      body: JSON.stringify({
        bank: 'MB',
        type: 'transfer',
        amount: '250,000.00',
        datetime: '08-07-2026 18:10:00',
        content: 'Phi san pickleball toi nay',
        raw_source: 'email',
      }),
    }));

    expect(response.status).toBe(201);
    expect(inserts[0]).toMatchObject({
      row: {
        category: 'custom-expense-pickleball-1234',
        content: 'Phi san pickleball toi nay',
      },
    });
  });

  it('falls back to rule-based categories when Gemini fails', async () => {
    const fetch = vi.fn(async () => new Response('bad gateway', { status: 502 }));
    const { handle, inserts } = handler({
      env: { GEMINI_API_KEY: 'gemini-key' },
      fetch,
    });

    const response = await handle(request());

    expect(response.status).toBe(201);
    expect(inserts[0]).toMatchObject({
      row: { category: 'others' },
    });
  });

  it('inserts ACB credit alerts as income rows', async () => {
    const { handle, inserts } = handler();

    const response = await handle(request({
      body: JSON.stringify({
        bank: 'ACB',
        type: 'balance_alert',
        amount: '+6,666.00',
        datetime: '080726-13:14:07',
        content: 'HUYNH NGOC SON CHUYEN TIEN GD 6189MSCBD2E4DZA8 080726-13:14:07',
        raw_source: 'email',
        direction: 'income',
      }),
    }));

    expect(response.status).toBe(201);
    expect(await jsonBody(response)).toEqual({ ok: true, status: 'inserted' });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      table: 'transactions',
      row: {
        bank: 'ACB',
        type: 'balance_alert',
        amount: 6666,
        transaction_time: '2026-07-08T06:14:07.000Z',
        content: 'HUYNH NGOC SON CHUYEN TIEN GD 6189MSCBD2E4DZA8 080726-13:14:07',
        category: 'temporary-income',
        direction: 'income',
        raw_source: 'email',
        user_id: 'user-1',
      },
    });
  });

  it('treats unique constraint errors as duplicate inserts', async () => {
    const { handle } = handler({ insertError: { code: '23505' } });

    const response = await handle(request());

    expect(response.status).toBe(200);
    expect(await jsonBody(response)).toEqual({ ok: true, status: 'duplicate' });
  });

  it('handles CORS preflight requests', async () => {
    const { handle } = handler();

    const response = await handle(request({ method: 'OPTIONS', body: null }));

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });
});

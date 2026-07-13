import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createIngestTransactionHandler,
  type IngestSupabaseClient,
} from "../../supabase/functions/_shared/ingest-handler";

function request(init: RequestInit = {}): Request {
  return new Request("https://example.test/ingest-transaction", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ingest-secret": "secret",
      ...(init.headers ?? {}),
    },
    body: JSON.stringify({
      bank: "MB",
      type: "transfer",
      amount: "297,000.00",
      datetime: "04-07-2026 21:48:49",
      content: "159287 1PEV8",
      raw_source: "email",
    }),
    ...init,
  });
}

function handler(
  options: {
    env?: Record<string, string | undefined>;
    rpcData?: unknown;
    rpcError?: unknown;
    rpcReject?: unknown;
    rpcCalls?: Array<{ functionName: string; args: Record<string, unknown> }>;
    userCategories?: Array<{
      id: string;
      direction: "expense" | "income";
      name: string;
    }>;
    fetch?: (
      input: string | URL | Request,
      init?: RequestInit,
    ) => Promise<Response>;
  } = {},
) {
  const env: Record<string, string | undefined> = {
    INGEST_SECRET: "secret",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    DEFAULT_USER_ID: "user-1",
    ...options.env,
  };
  const rpcCalls = options.rpcCalls ?? [];
  const userCategories = options.userCategories ?? [];
  const rpcData = Object.prototype.hasOwnProperty.call(options, "rpcData")
    ? options.rpcData
    : {
        status: "inserted",
        transaction_id: "transaction-1",
        asset_account_id: null,
        asset_event_id: null,
      };
  const rpc = vi.fn(
    async (functionName: string, args: Record<string, unknown>) => {
      rpcCalls.push({ functionName, args });
      if (functionName === "lookup_user_by_ingest_secret") {
        return {
          data:
            args.p_secret === "secret" ? (env.DEFAULT_USER_ID ?? null) : null,
          error: null,
        };
      }
      if (Object.prototype.hasOwnProperty.call(options, "rpcReject")) {
        throw options.rpcReject;
      }
      return { data: rpcData, error: options.rpcError ?? null };
    },
  );
  const createClient = vi.fn(
    () =>
      ({
        from: vi.fn((table: string) => {
          if (table === "user_categories") {
            const query = {
              eq: vi.fn(() => query),
              order: vi.fn(async () => ({ data: userCategories, error: null })),
            };
            return {
              select: vi.fn(() => query),
            };
          }
          if (table === "ingest_logs") {
            return {
              insert: vi.fn(async () => ({ error: null })),
            };
          }

          throw new Error(`Unexpected table: ${table}`);
        }),
        rpc,
      }) as unknown as IngestSupabaseClient,
  );

  return {
    rpc,
    rpcCalls,
    createClient,
    handle: createIngestTransactionHandler({
      getEnv: (name) => env[name],
      createClient,
      fetch: options.fetch,
    }),
  };
}

async function jsonBody(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createIngestTransactionHandler", () => {
  it("rejects non-POST requests", async () => {
    const { handle } = handler();

    const response = await handle(request({ method: "GET", body: null }));

    expect(response.status).toBe(405);
    expect(await jsonBody(response)).toEqual({
      ok: false,
      error: "method_not_allowed",
    });
  });

  it.each([
    { label: "missing", value: undefined },
    { label: "empty", value: "" },
    { label: "blank", value: "   " },
  ])(
    "rejects when INGEST_SECRET is $label and per-user lookup fails",
    async ({ value }) => {
      const { handle } = handler({ env: { INGEST_SECRET: value } });

      const response = await handle(
        request({
          headers: { "content-type": "application/json" },
          body: "{",
        }),
      );

      expect(response.status).toBe(401);
      expect(await jsonBody(response)).toEqual({
        ok: false,
        error: "unauthorized",
      });
    },
  );

  it("rejects a wrong request secret before parsing JSON", async () => {
    const { handle } = handler();

    const response = await handle(
      request({
        headers: { "x-ingest-secret": "wrong" },
        body: "{",
      }),
    );

    expect(response.status).toBe(401);
    expect(await jsonBody(response)).toEqual({
      ok: false,
      error: "unauthorized",
    });
  });

  it("rejects a missing request secret when the server secret is configured", async () => {
    const { handle, createClient } = handler();

    const response = await handle(
      request({
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );

    expect(response.status).toBe(401);
    expect(await jsonBody(response)).toEqual({
      ok: false,
      error: "unauthorized",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON after secret validation", async () => {
    const { handle } = handler();

    const response = await handle(request({ body: "{" }));

    expect(response.status).toBe(400);
    expect(await jsonBody(response)).toEqual({
      ok: false,
      error: "invalid_json",
    });
  });

  it("rejects invalid normalized payloads without calling the ingest RPC", async () => {
    const { handle, rpcCalls } = handler();

    const response = await handle(
      request({
        body: JSON.stringify({
          bank: "VCB",
          type: "transfer",
          amount: "297,000.00",
          datetime: "04-07-2026 21:48:49",
          content: "159287 1PEV8",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await jsonBody(response)).toEqual({
      ok: false,
      error: "invalid_bank",
    });
    const ingestCalls = rpcCalls.filter(
      (c) => c.functionName === "ingest_bank_email_transaction",
    );
    expect(ingestCalls).toHaveLength(0);
  });

  it("reports missing server config when SUPABASE_URL is missing", async () => {
    const { handle } = handler({ env: { SUPABASE_URL: undefined } });

    const response = await handle(request());

    expect(response.status).toBe(500);
    expect(await jsonBody(response)).toEqual({
      ok: false,
      error: "missing_server_config",
    });
  });

  it("calls the ingestion RPC with a normalized legacy payload", async () => {
    const { handle, rpcCalls, createClient } = handler();

    const response = await handle(request());

    expect(response.status).toBe(201);
    expect(await jsonBody(response)).toEqual({
      ok: true,
      status: "inserted",
      transaction_id: "transaction-1",
      asset_account_id: null,
      asset_event_id: null,
    });
    expect(createClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "service-role",
      {
        auth: { persistSession: false },
      },
    );
    expect(
      rpcCalls.filter(
        (c) => c.functionName === "ingest_bank_email_transaction",
      ),
    ).toHaveLength(1);
    expect(
      rpcCalls.find((c) => c.functionName === "ingest_bank_email_transaction"),
    ).toEqual({
      functionName: "ingest_bank_email_transaction",
      args: {
        p_user_id: "user-1",
        p_bank: "MB",
        p_type: "transfer",
        p_amount: 297000,
        p_transaction_time: "2026-07-04T14:48:49.000Z",
        p_content: "159287 1PEV8",
        p_category: "others",
        p_direction: "expense",
        p_external_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        p_account_identifier: null,
        p_card_identifier: null,
        p_balance_vnd: null,
      },
    });
  });

  it("passes normalized account identifiers and balances to the RPC", async () => {
    const { handle, rpcCalls } = handler({
      rpcData: {
        status: "inserted",
        transaction_id: "transaction-account",
        asset_account_id: "asset-account",
        asset_event_id: "asset-event",
      },
    });

    const response = await handle(
      request({
        body: JSON.stringify({
          bank: "ACB",
          type: "balance_alert",
          amount: "50,000.00",
          datetime: "080726-13:14:07",
          content: "THANH TOAN HOA DON",
          direction: "expense",
          account_identifier: "1234567890",
          balance_vnd: 1_250_000,
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await jsonBody(response)).toEqual({
      ok: true,
      status: "inserted",
      transaction_id: "transaction-account",
      asset_account_id: "asset-account",
      asset_event_id: "asset-event",
    });
    expect(
      rpcCalls.find((c) => c.functionName === "ingest_bank_email_transaction"),
    ).toMatchObject({
      args: {
        p_account_identifier: "1234567890",
        p_card_identifier: null,
        p_balance_vnd: 1_250_000,
      },
    });
  });

  it("passes normalized card identifiers to the RPC", async () => {
    const { handle, rpcCalls } = handler();

    const response = await handle(
      request({
        body: JSON.stringify({
          bank: "MB",
          type: "card",
          amount: "125,000.00",
          datetime: "08-07-2026 20:15:00",
          content: "Thanh toan the tai MERCHANT",
          card_identifier: "9876",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(
      rpcCalls.find((c) => c.functionName === "ingest_bank_email_transaction"),
    ).toMatchObject({
      args: {
        p_account_identifier: null,
        p_card_identifier: "9876",
        p_balance_vnd: null,
      },
    });
  });

  it("uses Gemini category suggestions when configured", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        category: "food-drinks",
                        confidence: 0.88,
                      }),
                    },
                  ],
                },
              },
            ],
          }),
        ),
    );
    const { handle, rpcCalls } = handler({
      env: { GEMINI_API_KEY: "gemini-key" },
      fetch,
    });

    const response = await handle(
      request({
        body: JSON.stringify({
          bank: "MB",
          type: "transfer",
          amount: "8,888.00",
          datetime: "08-07-2026 12:59:46",
          content: "HUYNH NGOC SON chuyen tien an uong",
          raw_source: "email",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(
      rpcCalls.find((c) => c.functionName === "ingest_bank_email_transaction"),
    ).toMatchObject({
      args: {
        p_category: "food-drinks",
        p_content: "HUYNH NGOC SON chuyen tien an uong",
      },
    });
  });

  it("includes default user custom categories in Gemini email suggestions", async () => {
    const fetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const payload = JSON.parse(String(init?.body));
        expect(payload.generationConfig.properties).toBeUndefined();
        expect(
          payload.generationConfig.responseSchema.properties.category.enum,
        ).toContain("custom-expense-pickleball-1234");
        expect(payload.contents[0].parts[0].text).toContain(
          "custom-expense-pickleball-1234: Pickleball",
        );

        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        category: "custom-expense-pickleball-1234",
                        confidence: 0.92,
                      }),
                    },
                  ],
                },
              },
            ],
          }),
        );
      },
    );
    const { handle, rpcCalls } = handler({
      env: { GEMINI_API_KEY: "gemini-key" },
      userCategories: [
        {
          id: "custom-expense-pickleball-1234",
          direction: "expense",
          name: "Pickleball",
        },
      ],
      fetch,
    });

    const response = await handle(
      request({
        body: JSON.stringify({
          bank: "MB",
          type: "transfer",
          amount: "250,000.00",
          datetime: "08-07-2026 18:10:00",
          content: "Phi san pickleball toi nay",
          raw_source: "email",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(
      rpcCalls.find((c) => c.functionName === "ingest_bank_email_transaction"),
    ).toMatchObject({
      args: {
        p_category: "custom-expense-pickleball-1234",
        p_content: "Phi san pickleball toi nay",
      },
    });
  });

  it("passes a custom income Gemini category through to the RPC", async () => {
    const fetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const payload = JSON.parse(String(init?.body));
        expect(
          payload.generationConfig.responseSchema.properties.category.enum,
        ).toContain("custom-income-freelance-1234");
        expect(payload.contents[0].parts[0].text).toContain(
          "custom-income-freelance-1234: Freelance",
        );

        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        category: "custom-income-freelance-1234",
                        confidence: 0.94,
                      }),
                    },
                  ],
                },
              },
            ],
          }),
        );
      },
    );
    const { handle, rpcCalls } = handler({
      env: { GEMINI_API_KEY: "gemini-key" },
      userCategories: [
        {
          id: "custom-income-freelance-1234",
          direction: "income",
          name: "Freelance",
        },
      ],
      fetch,
    });

    const response = await handle(
      request({
        body: JSON.stringify({
          bank: "ACB",
          type: "balance_alert",
          amount: "+500,000.00",
          datetime: "080726-18:10:00",
          content: "Thanh toan du an freelance",
          raw_source: "email",
          direction: "income",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(
      rpcCalls.find((c) => c.functionName === "ingest_bank_email_transaction"),
    ).toMatchObject({
      args: {
        p_category: "custom-income-freelance-1234",
        p_content: "Thanh toan du an freelance",
        p_direction: "income",
      },
    });
  });

  it("falls back to rule-based categories when Gemini fails", async () => {
    const fetch = vi.fn(
      async () => new Response("bad gateway", { status: 502 }),
    );
    const { handle, rpcCalls } = handler({
      env: { GEMINI_API_KEY: "gemini-key" },
      fetch,
    });

    const response = await handle(request());

    expect(response.status).toBe(201);
    expect(
      rpcCalls.find((c) => c.functionName === "ingest_bank_email_transaction"),
    ).toMatchObject({
      args: { p_category: "others" },
    });
  });

  it("passes ACB credit alerts to the RPC as income transactions", async () => {
    const { handle, rpcCalls } = handler();

    const response = await handle(
      request({
        body: JSON.stringify({
          bank: "ACB",
          type: "balance_alert",
          amount: "+6,666.00",
          datetime: "080726-13:14:07",
          content:
            "HUYNH NGOC SON CHUYEN TIEN GD 6189MSCBD2E4DZA8 080726-13:14:07",
          raw_source: "email",
          direction: "income",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await jsonBody(response)).toMatchObject({
      ok: true,
      status: "inserted",
    });
    expect(
      rpcCalls.filter(
        (c) => c.functionName === "ingest_bank_email_transaction",
      ),
    ).toHaveLength(1);
    expect(
      rpcCalls.find((c) => c.functionName === "ingest_bank_email_transaction"),
    ).toMatchObject({
      functionName: "ingest_bank_email_transaction",
      args: {
        p_user_id: "user-1",
        p_bank: "ACB",
        p_type: "balance_alert",
        p_amount: 6666,
        p_transaction_time: "2026-07-08T06:14:07.000Z",
        p_content:
          "HUYNH NGOC SON CHUYEN TIEN GD 6189MSCBD2E4DZA8 080726-13:14:07",
        p_category: "temporary-income",
        p_direction: "income",
      },
    });
  });

  it("returns the duplicate status reported by the RPC", async () => {
    const { handle } = handler({
      rpcData: {
        status: "duplicate",
        transaction_id: null,
        asset_account_id: null,
        asset_event_id: null,
      },
    });

    const response = await handle(request());

    expect(response.status).toBe(200);
    expect(await jsonBody(response)).toEqual({ ok: true, status: "duplicate" });
  });

  it("returns insert_failed when the RPC reports an error", async () => {
    const rpcError = { code: "P0001", message: "asset update failed" };
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { handle } = handler({ rpcError });

    const response = await handle(request());

    expect(response.status).toBe(500);
    expect(await jsonBody(response)).toEqual({
      ok: false,
      error: "insert_failed",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "ingest transaction RPC failed",
      rpcError,
    );
  });

  it("returns insert_failed when the RPC rejects", async () => {
    const rpcError = new Error("network unavailable");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { handle } = handler({ rpcReject: rpcError });

    const response = await handle(request());

    expect(response.status).toBe(500);
    expect(await jsonBody(response)).toEqual({
      ok: false,
      error: "insert_failed",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "ingest transaction RPC failed",
      rpcError,
    );
  });

  it("returns insert_failed for an invalid RPC response", async () => {
    const invalidData = {
      status: "inserted",
      transaction_id: null,
      asset_account_id: null,
      asset_event_id: null,
    };
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { handle } = handler({ rpcData: invalidData });

    const response = await handle(request());

    expect(response.status).toBe(500);
    expect(await jsonBody(response)).toEqual({
      ok: false,
      error: "insert_failed",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "invalid ingest transaction RPC response",
      invalidData,
    );
  });

  it("handles CORS preflight requests", async () => {
    const { handle, rpc } = handler();

    const response = await handle(request({ method: "OPTIONS", body: null }));

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "POST, OPTIONS",
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});

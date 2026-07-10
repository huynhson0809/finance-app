import {
  suggestCategoryWithGemini,
  type GeminiCategoryDirection,
  type GeminiCategoryOption,
} from '../_shared/gemini-category.ts';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const jsonHeaders = {
  ...corsHeaders,
  'content-type': 'application/json',
};

interface SuggestCategoryBody {
  text?: unknown;
  direction?: unknown;
  categories?: unknown;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  let body: SuggestCategoryBody;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  if (typeof body.text !== 'string' || body.text.trim() === '') {
    return json({ ok: false, error: 'invalid_text' }, 400);
  }

  if (body.direction !== 'expense' && body.direction !== 'income') {
    return json({ ok: false, error: 'invalid_direction' }, 400);
  }

  const categories = parseCategories(body.categories, body.direction);
  if (categories.length === 0) {
    return json({ ok: false, error: 'invalid_categories' }, 400);
  }

  const category = await suggestCategoryWithGemini({
    text: body.text,
    direction: body.direction,
    categories,
    apiKey: Deno.env.get('GEMINI_API_KEY'),
    model: Deno.env.get('GEMINI_MODEL'),
  });

  return json({ ok: true, category });
});

function parseCategories(input: unknown, direction: GeminiCategoryDirection): GeminiCategoryOption[] {
  if (!Array.isArray(input)) return [];

  return input
    .map(item => {
      if (!isRecord(item)) return null;
      if (typeof item.id !== 'string' || typeof item.label !== 'string') return null;
      const id = item.id.trim();
      const label = item.label.trim();
      if (!id || !label) return null;
      if (!categoryIdMatchesDirection(id, direction)) return null;

      return { id, label, direction } as GeminiCategoryOption;
    })
    .filter((item): item is GeminiCategoryOption => item !== null);
}

function categoryIdMatchesDirection(id: string, direction: GeminiCategoryDirection): boolean {
  if (id.startsWith('custom-income-')) return direction === 'income';
  if (id.startsWith('custom-expense-')) return direction === 'expense';

  if (direction === 'income') {
    return ['salary', 'allowance', 'bonus', 'side-income', 'investment', 'temporary-income'].includes(id);
  }

  return [
    'food-drinks',
    'coffee-bubble-tea',
    'transportation',
    'shopping',
    'bills-utilities',
    'healthcare',
    'entertainment',
    'transfers-debt',
    'others',
  ].includes(id);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

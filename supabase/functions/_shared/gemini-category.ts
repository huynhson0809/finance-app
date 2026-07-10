import type { Category } from './category.ts';

export type GeminiCategoryDirection = 'expense' | 'income';

export interface GeminiCategoryOption {
  id: Category;
  label: string;
  direction?: GeminiCategoryDirection;
}

export interface GeminiCategorySuggestionInput {
  text: string;
  direction: GeminiCategoryDirection;
  categories: readonly GeminiCategoryOption[];
  apiKey?: string;
  model?: string;
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface GeminiCategorySuggestionDependencies {
  fetch?: FetchLike;
}

const DEFAULT_MODEL = 'gemini-2.5-flash';
const MIN_CONFIDENCE = 0.45;

const BUILT_IN_CATEGORY_OPTIONS: readonly GeminiCategoryOption[] = [
  { id: 'food-drinks', label: 'Ăn uống / Food & dining', direction: 'expense' },
  { id: 'coffee-bubble-tea', label: 'Cà phê & Trà sữa / Coffee & bubble tea', direction: 'expense' },
  { id: 'transportation', label: 'Đi lại / Transport', direction: 'expense' },
  { id: 'shopping', label: 'Mua sắm / Shopping', direction: 'expense' },
  { id: 'bills-utilities', label: 'Hoá đơn & Tiện ích / Bills & utilities', direction: 'expense' },
  { id: 'healthcare', label: 'Sức khoẻ / Healthcare', direction: 'expense' },
  { id: 'entertainment', label: 'Giải trí / Entertainment', direction: 'expense' },
  { id: 'transfers-debt', label: 'Chuyển khoản & Trả nợ / Transfers & debt', direction: 'expense' },
  { id: 'others', label: 'Khác / Other', direction: 'expense' },
  { id: 'salary', label: 'Tiền lương / Salary', direction: 'income' },
  { id: 'allowance', label: 'Tiền phụ cấp / Allowance', direction: 'income' },
  { id: 'bonus', label: 'Tiền thưởng / Bonus', direction: 'income' },
  { id: 'side-income', label: 'Thu nhập phụ / Side income', direction: 'income' },
  { id: 'investment', label: 'Đầu tư / Investment', direction: 'income' },
  { id: 'temporary-income', label: 'Thu nhập tạm thời / Temporary income', direction: 'income' },
];

export function builtInCategoryOptionsForDirection(
  direction: GeminiCategoryDirection,
): GeminiCategoryOption[] {
  return BUILT_IN_CATEGORY_OPTIONS.filter(option => option.direction === direction);
}

export async function suggestCategoryWithGemini(
  input: GeminiCategorySuggestionInput,
  dependencies: GeminiCategorySuggestionDependencies = {},
): Promise<Category | null> {
  const apiKey = input.apiKey?.trim();
  const text = input.text.trim();
  const categories = normalizeCategoryOptions(input.categories, input.direction);

  if (!apiKey || !text || categories.length === 0) return null;

  const fetchFn = dependencies.fetch ?? globalThis.fetch;
  const model = normalizeModel(input.model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  try {
    const response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: buildPrompt(text, input.direction, categories) }],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                enum: categories.map(category => category.id),
              },
              confidence: { type: 'number' },
            },
            required: ['category'],
          },
        },
      }),
    });

    if (!response.ok) {
      console.warn('Gemini category suggestion failed', response.status, await safeResponseText(response));
      return null;
    }

    const data = await response.json();
    return parseGeminiCategory(data, categories);
  } catch (error) {
    console.warn('Gemini category suggestion failed', error);
    return null;
  }
}

function normalizeModel(model: string | undefined): string {
  return (model?.trim() || DEFAULT_MODEL).replace(/^models\//, '');
}

function normalizeCategoryOptions(
  categories: readonly GeminiCategoryOption[],
  direction: GeminiCategoryDirection,
): GeminiCategoryOption[] {
  const seen = new Set<string>();
  return categories
    .filter(category => category.id && category.label.trim())
    .filter(category => category.direction === undefined || category.direction === direction)
    .filter(category => categoryDirectionFromId(category.id) === direction)
    .filter(category => {
      if (seen.has(category.id)) return false;
      seen.add(category.id);
      return true;
    })
    .slice(0, 60);
}

function categoryDirectionFromId(category: Category): GeminiCategoryDirection {
  if (category.startsWith('custom-income-')) return 'income';
  if (category.startsWith('custom-expense-')) return 'expense';
  return BUILT_IN_CATEGORY_OPTIONS.find(option => option.id === category)?.direction ?? 'expense';
}

function buildPrompt(
  text: string,
  direction: GeminiCategoryDirection,
  categories: readonly GeminiCategoryOption[],
): string {
  const fallback = direction === 'income' ? 'temporary-income' : 'others';
  const categoryList = categories
    .map(category => `- ${category.id}: ${category.label}`)
    .join('\n');

  return [
    'You classify one Vietnamese personal finance transaction.',
    'Choose exactly one category id from the existing category list.',
    `Direction: ${direction}`,
    `If the text clearly mentions a category label, choose that matching category. If uncertain, choose "${fallback}" when available.`,
    'Return JSON only with this shape: {"category":"category-id","confidence":0.0}.',
    `Existing categories:\n${categoryList}`,
    `Transaction text:\n${text.slice(0, 2500)}`,
  ].join('\n\n');
}

function parseGeminiCategory(data: unknown, categories: readonly GeminiCategoryOption[]): Category | null {
  const allowed = new Set(categories.map(category => category.id));
  const text = extractGeminiText(data);
  if (!text) return null;

  const parsed = parseJsonObject(text);
  if (!parsed) return null;

  const category = parsed.category;
  if (typeof category !== 'string' || !allowed.has(category as Category)) return null;

  const confidence = parsed.confidence;
  if (
    typeof confidence === 'number' &&
    Number.isFinite(confidence) &&
    confidence < MIN_CONFIDENCE
  ) {
    return null;
  }

  return category as Category;
}

function extractGeminiText(data: unknown): string | null {
  if (!isRecord(data)) return null;
  if (typeof data.output_text === 'string') return data.output_text;

  const candidates = data.candidates;
  if (!Array.isArray(candidates)) return null;
  for (const candidate of candidates) {
    if (!isRecord(candidate) || !isRecord(candidate.content)) continue;
    const parts = candidate.content.parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (isRecord(part) && typeof part.text === 'string') return part.text;
    }
  }
  return null;
}

function parseJsonObject(input: string): Record<string, unknown> | null {
  const trimmed = input.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    const parsed = JSON.parse(trimmed);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

async function safeResponseText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '';
  }
}

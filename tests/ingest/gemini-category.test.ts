import { describe, expect, it, vi } from 'vitest';
import {
  builtInCategoryOptionsForDirection,
  suggestCategoryWithGemini,
} from '../../supabase/functions/_shared/gemini-category';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('suggestCategoryWithGemini', () => {
  it('returns null without an api key', async () => {
    const fetch = vi.fn();

    const category = await suggestCategoryWithGemini({
      text: 'ăn uống cuối tuần',
      direction: 'expense',
      categories: builtInCategoryOptionsForDirection('expense'),
    }, {
      fetch,
    });

    expect(category).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('asks Gemini to choose one allowed category id', async () => {
    const fetch = vi.fn(async () => jsonResponse({
      candidates: [
        {
          content: {
            parts: [
              { text: JSON.stringify({ category: 'food-drinks', confidence: 0.91 }) },
            ],
          },
        },
      ],
    }));

    const category = await suggestCategoryWithGemini({
      text: 'HUYNH NGOC SON chuyen tien an uong',
      direction: 'expense',
      categories: builtInCategoryOptionsForDirection('expense'),
      apiKey: 'gemini-key',
      model: 'gemini-test-flash',
    }, {
      fetch,
    });

    expect(category).toBe('food-drinks');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain('/models/gemini-test-flash:generateContent');
    expect(init.headers).toMatchObject({
      'x-goog-api-key': 'gemini-key',
    });
    expect(JSON.parse(init.body as string)).toMatchObject({
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });
  });

  it('uses the current default Gemini Flash model when no model is configured', async () => {
    const fetch = vi.fn(async () => jsonResponse({
      candidates: [
        {
          content: {
            parts: [
              { text: JSON.stringify({ category: 'food-drinks', confidence: 0.91 }) },
            ],
          },
        },
      ],
    }));

    await suggestCategoryWithGemini({
      text: 'ăn uống cuối tuần',
      direction: 'expense',
      categories: builtInCategoryOptionsForDirection('expense'),
      apiKey: 'gemini-key',
    }, {
      fetch,
    });

    const [url] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain('/models/gemini-3.5-flash:generateContent');
  });

  it('ignores invalid or low-confidence categories', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        candidates: [{ content: { parts: [{ text: '{"category":"salary","confidence":0.99}' }] } }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        candidates: [{ content: { parts: [{ text: '{"category":"food-drinks","confidence":0.1}' }] } }],
      }));

    await expect(suggestCategoryWithGemini({
      text: 'ăn uống',
      direction: 'expense',
      categories: builtInCategoryOptionsForDirection('expense'),
      apiKey: 'gemini-key',
    }, {
      fetch,
    })).resolves.toBeNull();

    await expect(suggestCategoryWithGemini({
      text: 'ăn uống',
      direction: 'expense',
      categories: builtInCategoryOptionsForDirection('expense'),
      apiKey: 'gemini-key',
    }, {
      fetch,
    })).resolves.toBeNull();
  });
});

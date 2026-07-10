import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    functions: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock('../../src/supabase/client', () => ({
  get supabase() {
    return mocks.supabase;
  },
}));

import {
  clearCloudCategorySuggestionCacheForTests,
  suggestCloudCategory,
} from '../../src/supabase/category-suggestions';

beforeEach(() => {
  clearCloudCategorySuggestionCacheForTests();
  mocks.supabase.auth.getSession.mockReset();
  mocks.supabase.functions.invoke.mockReset();
  mocks.supabase.auth.getSession.mockResolvedValue({
    data: { session: { access_token: 'token' } },
    error: null,
  });
  mocks.supabase.functions.invoke.mockResolvedValue({
    data: { category: 'custom-expense-snacks-1234' },
    error: null,
  });
});

describe('suggestCloudCategory', () => {
  it('reuses the same cloud suggestion for the same text, direction, and category list', async () => {
    const input = {
      text: 'ăn vặt tối',
      direction: 'expense' as const,
      categories: [
        { id: 'food-drinks' as const, label: 'Ăn uống' },
        { id: 'custom-expense-snacks-1234' as const, label: 'Ăn vặt' },
      ],
    };

    await expect(suggestCloudCategory(input)).resolves.toBe('custom-expense-snacks-1234');
    await expect(suggestCloudCategory(input)).resolves.toBe('custom-expense-snacks-1234');

    expect(mocks.supabase.functions.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.supabase.functions.invoke).toHaveBeenCalledWith(
      'suggest-category',
      expect.objectContaining({
        body: expect.objectContaining({
          categories: input.categories,
        }),
      }),
    );
  });
});

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CategoryOverride } from '../../src/types';

const mocks = vi.hoisted(() => ({
  getCategoryOverrides: vi.fn(),
  replaceCategoryOverrides: vi.fn(),
  upsertCategoryOverride: vi.fn(),
}));

vi.mock('../../src/db/category-overrides', () => mocks);

import { useCategoryOverrides } from '../../src/hooks/useCategoryOverrides';
import { clearSpendlyQueryCacheForTests } from '../../src/query/client';

function override(overrides: Partial<CategoryOverride> = {}): CategoryOverride {
  return {
    category: 'food-drinks',
    name: 'Ăn uống',
    iconKey: 'utensils',
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  clearSpendlyQueryCacheForTests();
  mocks.getCategoryOverrides.mockReset();
  mocks.replaceCategoryOverrides.mockReset();
  mocks.upsertCategoryOverride.mockReset();
});

describe('useCategoryOverrides', () => {
  it('reuses fresh overrides when the hook remounts between tabs', async () => {
    const overrides = [override()];
    mocks.getCategoryOverrides.mockResolvedValue(overrides);

    const first = renderHook(() => useCategoryOverrides());
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();

    const second = renderHook(() => useCategoryOverrides());
    await waitFor(() => expect(second.result.current.loading).toBe(false));

    expect(second.result.current.overrides).toEqual(overrides);
    expect(mocks.getCategoryOverrides).toHaveBeenCalledTimes(1);
  });
});

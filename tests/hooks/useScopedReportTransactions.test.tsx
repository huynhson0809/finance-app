import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { yearRangeVietnamISO } from '../../src/lib/date';

const mocks = vi.hoisted(() => ({
  supabase: {} as unknown,
  listCloudTransactions: vi.fn(),
  listCloudTransactionsForRange: vi.fn(),
}));

vi.mock('../../src/supabase/client', () => ({
  get supabase() {
    return mocks.supabase;
  },
}));

vi.mock('../../src/supabase/transactions', () => ({
  listCloudTransactions: mocks.listCloudTransactions,
  listCloudTransactionsForRange: mocks.listCloudTransactionsForRange,
}));

import { useScopedReportTransactions } from '../../src/hooks/useScopedReportTransactions';
import { clearSpendlyQueryCacheForTests } from '../../src/query/client';

beforeEach(() => {
  clearSpendlyQueryCacheForTests();
  mocks.supabase = {};
  mocks.listCloudTransactions.mockReset();
  mocks.listCloudTransactionsForRange.mockReset();
  mocks.listCloudTransactions.mockResolvedValue([]);
  mocks.listCloudTransactionsForRange.mockResolvedValue([]);
});

describe('useScopedReportTransactions', () => {
  it('deduplicates simultaneous yearly loads for the same year', async () => {
    const { result } = renderHook(() => ({
      first: useScopedReportTransactions('year', '2026-01'),
      second: useScopedReportTransactions('year', '2026-01'),
    }));

    await waitFor(() => expect(result.current.first.loading).toBe(false));
    await waitFor(() => expect(result.current.second.loading).toBe(false));

    expect(mocks.listCloudTransactionsForRange).toHaveBeenCalledTimes(1);
    expect(mocks.listCloudTransactionsForRange).toHaveBeenCalledWith(
      mocks.supabase,
      yearRangeVietnamISO(2026),
    );
  });
});

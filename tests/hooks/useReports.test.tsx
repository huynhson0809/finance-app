import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { __resetDBForTests } from '../../src/db';
import { addTransaction } from '../../src/db/transactions';
import { upsertBudget } from '../../src/db/budgets';
import { useReports } from '../../src/hooks/useReports';

beforeEach(async () => {
  await __resetDBForTests();
  indexedDB.deleteDatabase('finance-app');
});

describe('useReports', () => {
  it('returns zeros when nothing has been written', async () => {
    const { result } = renderHook(() => useReports('2026-06'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sums['food-drinks']).toBe(0);
    expect(result.current.bStatus.overall).toBe('ok');
  });

  it('aggregates current month transactions', async () => {
    await addTransaction({
      amount: 1500, currency: 'VND',
      occurredAt: '2026-06-10T08:00:00.000Z',
      category: 'food-drinks', source: 'manual',
    });
    await upsertBudget('2026-06', 10000);
    const { result } = renderHook(() => useReports('2026-06'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sums['food-drinks']).toBe(1500);
    expect(result.current.bStatus.overall).toBe('ok');
  });
});

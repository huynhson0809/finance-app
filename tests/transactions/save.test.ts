import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '../../src/types';

const mocks = vi.hoisted(() => ({
  supabase: null as unknown,
  addCloudTransaction: vi.fn(),
  addTransaction: vi.fn(),
}));

vi.mock('../../src/supabase/client', () => ({
  get supabase() {
    return mocks.supabase;
  },
}));

vi.mock('../../src/supabase/transactions', () => ({
  addCloudTransaction: mocks.addCloudTransaction,
}));

vi.mock('../../src/db/transactions', () => ({
  addTransaction: mocks.addTransaction,
}));

import { saveUserTransaction } from '../../src/transactions/save';

const input = {
  amount: 45000,
  currency: 'VND' as const,
  occurredAt: '2026-07-06T05:00:00.000Z',
  merchant: 'Highlands Coffee',
  category: 'coffee-bubble-tea' as const,
  source: 'manual' as const,
};

const saved = {
  ...input,
  id: 'tx-1',
  createdAt: '2026-07-06T05:00:10.000Z',
  updatedAt: '2026-07-06T05:00:10.000Z',
} satisfies Transaction;

beforeEach(() => {
  mocks.supabase = null;
  mocks.addCloudTransaction.mockReset();
  mocks.addTransaction.mockReset();
  mocks.addCloudTransaction.mockResolvedValue(saved);
  mocks.addTransaction.mockResolvedValue(saved);
});

describe('saveUserTransaction', () => {
  it('writes to Supabase when the cloud client is configured', async () => {
    mocks.supabase = { from: vi.fn() };

    await expect(saveUserTransaction(input)).resolves.toBe(saved);

    expect(mocks.addCloudTransaction).toHaveBeenCalledWith(mocks.supabase, input);
    expect(mocks.addTransaction).not.toHaveBeenCalled();
  });

  it('falls back to local storage only when Supabase is not configured', async () => {
    mocks.supabase = null;

    await expect(saveUserTransaction(input)).resolves.toBe(saved);

    expect(mocks.addTransaction).toHaveBeenCalledWith(input);
    expect(mocks.addCloudTransaction).not.toHaveBeenCalled();
  });
});

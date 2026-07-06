import { describe, expect, it } from 'vitest';
import { mapTransactionRow } from '../../src/supabase/mapper';

describe('mapTransactionRow', () => {
  it('maps an MB card row to the app Transaction shape', () => {
    const tx = mapTransactionRow({
      id: 'tx-1',
      bank: 'MB',
      type: 'card',
      amount: 52043,
      currency: 'VND',
      transaction_time: '2026-07-06T04:19:20.000Z',
      content: 'Grab* BWCFLJMBDWRJ-G-1',
      raw_source: 'email',
      created_at: '2026-07-06T04:20:00.000Z',
    });

    expect(tx).toMatchObject({
      id: 'tx-1',
      amount: 52043,
      currency: 'VND',
      occurredAt: '2026-07-06T04:19:20.000Z',
      merchant: 'Grab* BWCFLJMBDWRJ-G-1',
      category: 'transportation',
      note: 'MB card',
      source: 'bank-email',
      bankHint: 'mb',
    });
  });

  it('falls back to others when content has no category match', () => {
    const tx = mapTransactionRow({
      id: 'tx-2',
      bank: 'ACB',
      type: 'balance_alert',
      amount: 10000,
      currency: 'VND',
      transaction_time: '2026-07-06T07:47:32.000Z',
      content: 'UNKNOWN TRANSFER MEMO',
      raw_source: 'email',
      created_at: '2026-07-06T07:48:00.000Z',
    });

    expect(tx.category).toBe('others');
    expect(tx.bankHint).toBe('acb');
  });
});

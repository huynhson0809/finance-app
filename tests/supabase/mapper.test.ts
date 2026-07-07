import { describe, expect, it } from 'vitest';
import { mapTransactionRow } from '../../src/supabase/mapper';
import type { CloudTransactionRow } from '../../src/supabase/mapper';

function row(overrides: Partial<CloudTransactionRow> = {}): CloudTransactionRow {
  return {
    id: 'tx-1',
    bank: 'MB',
    type: 'card',
    amount: 52043,
    currency: 'VND',
    transaction_time: '2026-07-06T04:19:20.000Z',
    content: 'Grab* BWCFLJMBDWRJ-G-1',
    raw_source: 'email',
    merchant: null,
    category: null,
    note: null,
    bank_hint: null,
    created_at: '2026-07-06T04:20:00.000Z',
    ...overrides,
  };
}

describe('mapTransactionRow', () => {
  it('maps an MB card row to the app Transaction shape', () => {
    const tx = mapTransactionRow(row());

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

  it('uses a stored email category instead of reclassifying the content', () => {
    const tx = mapTransactionRow(row({
      category: 'shopping',
      content: 'Grab* BWCFLJMBDWRJ-G-1',
    }));

    expect(tx.category).toBe('shopping');
  });

  it('keeps old email rows with generic transfer wording in others', () => {
    const tx = mapTransactionRow(row({
      category: null,
      content: 'HUYNH NGOC SON CHUYEN KHOAN-060726-14:47:32 6187ASCB028NLNNA',
    }));

    expect(tx.category).toBe('others');
  });

  it('falls back to others when content has no category match', () => {
    const tx = mapTransactionRow(row({
      id: 'tx-2',
      bank: 'ACB',
      type: 'balance_alert',
      amount: 10000,
      transaction_time: '2026-07-06T07:47:32.000Z',
      content: 'UNKNOWN TRANSFER MEMO',
      created_at: '2026-07-06T07:48:00.000Z',
    }));

    expect(tx.category).toBe('others');
    expect(tx.bankHint).toBe('acb');
  });

  it('maps user-entered manual rows directly instead of classifying content', () => {
    const tx = mapTransactionRow(row({
      id: 'manual-1',
      bank: null,
      type: 'manual',
      amount: 45000,
      transaction_time: '2026-07-06T05:00:00.000Z',
      content: 'Highlands Coffee',
      raw_source: 'manual',
      merchant: 'Highlands Coffee',
      category: 'coffee-bubble-tea',
      note: 'morning coffee',
      bank_hint: null,
      created_at: '2026-07-06T05:00:10.000Z',
    }));

    expect(tx).toMatchObject({
      id: 'manual-1',
      amount: 45000,
      occurredAt: '2026-07-06T05:00:00.000Z',
      merchant: 'Highlands Coffee',
      category: 'coffee-bubble-tea',
      note: 'morning coffee',
      source: 'manual',
    });
  });
});

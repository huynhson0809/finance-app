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
    asset_account_id: null,
    counterparty_asset_account_id: null,
    asset_event_id: null,
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

  it('maps legacy cloud rows without direction as expenses', () => {
    const tx = mapTransactionRow(row());

    expect(tx.direction).toBe('expense');
  });

  it('maps transaction asset links', () => {
    const tx = mapTransactionRow(row({
      asset_account_id: 'account-1',
      counterparty_asset_account_id: 'account-2',
      asset_event_id: 'event-1',
    }));

    expect(tx).toMatchObject({
      assetAccountId: 'account-1',
      counterpartyAssetAccountId: 'account-2',
      assetEventId: 'event-1',
    });
  });

  it('maps income cloud rows to income transactions', () => {
    const tx = mapTransactionRow(row({
      id: 'income-1',
      bank: null,
      type: 'manual',
      amount: 25000000,
      transaction_time: '2026-07-01T02:00:00.000Z',
      content: 'Monthly salary',
      raw_source: 'manual',
      merchant: null,
      category: 'salary',
      note: 'Monthly salary',
      bank_hint: null,
      created_at: '2026-07-01T02:00:10.000Z',
      direction: 'income',
    } as Partial<CloudTransactionRow> & { direction: 'income' }));

    expect(tx).toMatchObject({
      direction: 'income',
      category: 'salary',
      note: 'Monthly salary',
      source: 'manual',
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

  it('classifies legacy email rows from category labels in transfer content', () => {
    const tx = mapTransactionRow(row({
      category: null,
      content: 'HUYNH NGOC SON chuyen tien an uong',
    }));

    expect(tx.category).toBe('food-drinks');
  });

  it('reclassifies generic others email rows when content matches a category label', () => {
    const tx = mapTransactionRow(row({
      category: 'others',
      content: 'HUYNH NGOC SON chuyen tien an uong',
    }));

    expect(tx.category).toBe('food-drinks');
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

  it('keeps custom expense categories from edited manual rows', () => {
    const tx = mapTransactionRow(row({
      id: 'manual-custom-1',
      bank: null,
      type: 'manual',
      amount: 88000,
      transaction_time: '2026-07-09T12:30:00.000Z',
      content: 'Pet food',
      raw_source: 'manual',
      merchant: 'Pet food',
      category: 'custom-expense-pet-care',
      bank_hint: null,
      created_at: '2026-07-09T12:30:10.000Z',
      direction: 'expense',
    }));

    expect(tx).toMatchObject({
      direction: 'expense',
      category: 'custom-expense-pet-care',
      source: 'manual',
    });
  });

  it('keeps custom income categories from edited rows', () => {
    const tx = mapTransactionRow(row({
      id: 'income-custom-1',
      bank: null,
      type: 'manual',
      amount: 1200000,
      transaction_time: '2026-07-09T12:30:00.000Z',
      content: 'Freelance',
      raw_source: 'manual',
      merchant: null,
      category: 'custom-income-freelance',
      note: 'Freelance',
      bank_hint: null,
      created_at: '2026-07-09T12:30:10.000Z',
      direction: 'income',
    }));

    expect(tx).toMatchObject({
      direction: 'income',
      category: 'custom-income-freelance',
      source: 'manual',
    });
  });

  it('keeps custom categories from edited email rows', () => {
    const tx = mapTransactionRow(row({
      id: 'email-custom-1',
      category: 'custom-expense-snacks',
      content: 'UNKNOWN TRANSFER MEMO',
    }));

    expect(tx).toMatchObject({
      direction: 'expense',
      category: 'custom-expense-snacks',
      source: 'bank-email',
    });
  });

  it('keeps income direction and category for income email rows', () => {
    const tx = mapTransactionRow(row({
      id: 'email-income-1',
      bank: 'ACB',
      type: 'balance_alert',
      amount: 6666,
      content: 'HUYNH NGOC SON CHUYEN TIEN GD',
      category: 'custom-income-family',
      direction: 'income',
      raw_source: 'email',
    }));

    expect(tx).toMatchObject({
      direction: 'income',
      category: 'custom-income-family',
      merchant: 'HUYNH NGOC SON CHUYEN TIEN GD',
      note: 'ACB balance_alert',
      source: 'bank-email',
    });
  });

  it('keeps cloud metadata for MB card email rows', () => {
    const tx = mapTransactionRow(row({
      bank: 'MB',
      type: 'card',
      raw_source: 'email',
    }));

    expect(tx).toMatchObject({
      bank: 'MB',
      transactionType: 'card',
      rawSource: 'email',
      bankHint: 'mb',
      source: 'bank-email',
    });
  });

  it('keeps cloud metadata for manual rows', () => {
    const tx = mapTransactionRow(row({
      bank: null,
      type: 'manual',
      raw_source: 'manual',
      merchant: 'Coffee',
      category: 'coffee-bubble-tea',
    }));

    expect(tx).toMatchObject({
      bank: undefined,
      transactionType: 'manual',
      rawSource: 'manual',
      source: 'manual',
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildAssetSummary,
  getRateValue,
  goldQuantityToGrams,
  valueAssetAccountVnd,
} from '../../src/assets/valuation';
import type { AssetAccount, AssetRate } from '../../src/assets/types';

const now = '2026-07-11T09:00:00.000Z';

function account(overrides: Partial<AssetAccount>): AssetAccount {
  return {
    id: 'account-1',
    kind: 'cash',
    name: 'Cash',
    currency: 'VND',
    balance: 0,
    includeInTotal: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function rate(overrides: Partial<AssetRate>): AssetRate {
  return {
    id: 'rate-1',
    pair: 'USD_VND',
    value: 25000,
    source: 'manual',
    fetchedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('goldQuantityToGrams', () => {
  it('converts luong to grams', () => {
    expect(goldQuantityToGrams(1, 'luong')).toBe(37.5);
  });

  it('converts chi to grams', () => {
    expect(goldQuantityToGrams(1, 'chi')).toBe(3.75);
  });
});

describe('getRateValue', () => {
  it('returns the newest matching rate by fetchedAt', () => {
    const rates = [
      rate({ id: 'old-usd', value: 24000, fetchedAt: '2026-07-10T00:00:00.000Z' }),
      rate({ id: 'new-usd', value: 26000, fetchedAt: '2026-07-11T00:00:00.000Z' }),
      rate({
        id: 'gold',
        pair: 'GOLD_GRAM_VND',
        value: 3200000,
        fetchedAt: '2026-07-12T00:00:00.000Z',
      }),
    ];

    expect(getRateValue(rates, 'USD_VND')).toBe(26000);
  });

  it('uses the latest encountered matching rate when fetchedAt ties', () => {
    const rates = [
      rate({ id: 'first', value: 25000, fetchedAt: now }),
      rate({ id: 'second', value: 25100, fetchedAt: now }),
    ];

    expect(getRateValue(rates, 'USD_VND')).toBe(25100);
  });

  it('ignores invalid matching fetchedAt values when selecting the newest rate', () => {
    const rates = [
      rate({ id: 'invalid-usd', value: 99999, fetchedAt: 'not-a-date' }),
      rate({ id: 'valid-usd', value: 26000, fetchedAt: '2026-07-11T00:00:00.000Z' }),
    ];

    expect(getRateValue(rates, 'USD_VND')).toBe(26000);
  });

  it('returns null when matching rates have no valid fetchedAt values', () => {
    const rates = [
      rate({ id: 'invalid-usd', value: 99999, fetchedAt: 'not-a-date' }),
      rate({ id: 'also-invalid-usd', value: 88888, fetchedAt: '' }),
    ];

    expect(getRateValue(rates, 'USD_VND')).toBeNull();
  });
});

describe('valueAssetAccountVnd', () => {
  it('values USD foreign currency with the newest USD_VND rate', () => {
    const usdWallet = account({
      id: 'usd-wallet',
      kind: 'foreign_currency',
      currency: 'USD',
      balance: 10,
    });

    expect(
      valueAssetAccountVnd(usdWallet, [
        rate({ value: 24000, fetchedAt: '2026-07-10T00:00:00.000Z' }),
        rate({ value: 26000, fetchedAt: '2026-07-11T00:00:00.000Z' }),
      ]),
    ).toBe(260000);
  });

  it('values gold with the newest GOLD_GRAM_VND rate and unit conversion', () => {
    const gold = account({
      id: 'gold',
      kind: 'gold',
      currency: 'VND',
      balance: 0,
      quantity: 2,
      goldUnit: 'chi',
    });

    expect(
      valueAssetAccountVnd(gold, [
        rate({
          id: 'old-gold',
          pair: 'GOLD_GRAM_VND',
          value: 2500000,
          fetchedAt: '2026-07-10T00:00:00.000Z',
        }),
        rate({
          id: 'new-gold',
          pair: 'GOLD_GRAM_VND',
          value: 3000000,
          fetchedAt: '2026-07-11T00:00:00.000Z',
        }),
      ]),
    ).toBe(22500000);
  });
});

describe('buildAssetSummary', () => {
  it('counts positive credit card debt as negative assets and positive liability', () => {
    const summary = buildAssetSummary(
      [
        account({ id: 'bank', kind: 'bank', name: 'Bank', balance: 1000000 }),
        account({
          id: 'card',
          kind: 'credit_card',
          name: 'Card',
          balance: 250000,
        }),
      ],
      [],
    );

    expect(summary.totalAssetsVnd).toBe(750000);
    expect(summary.liquidVnd).toBe(1000000);
    expect(summary.liabilityVnd).toBe(250000);
    expect(summary.byAccount.map((item) => item.valueVnd)).toEqual([1000000, -250000]);
  });

  it('does not treat negative credit card balances as debt', () => {
    const summary = buildAssetSummary(
      [
        account({
          id: 'card',
          kind: 'credit_card',
          name: 'Overpaid Card',
          balance: -250000,
        }),
      ],
      [],
    );

    expect(valueAssetAccountVnd(summary.byAccount[0].account, [])).toBe(0);
    expect(summary.totalAssetsVnd).toBe(0);
    expect(summary.liabilityVnd).toBe(0);
    expect(summary.byAccount).toEqual([
      { account: expect.objectContaining({ id: 'card' }), valueVnd: 0 },
    ]);
  });

  it('keeps savings included in total assets and savings total', () => {
    const summary = buildAssetSummary(
      [account({ id: 'savings', kind: 'savings', name: 'Savings', balance: 2000000 })],
      [],
    );

    expect(summary.totalAssetsVnd).toBe(2000000);
    expect(summary.savingsVnd).toBe(2000000);
    expect(summary.byAccount).toHaveLength(1);
  });

  it('excludes accounts with includeInTotal false from totals and byAccount', () => {
    const summary = buildAssetSummary(
      [
        account({ id: 'cash', kind: 'cash', name: 'Cash', balance: 100000 }),
        account({
          id: 'hidden',
          kind: 'bank',
          name: 'Hidden',
          balance: 900000,
          includeInTotal: false,
        }),
      ],
      [],
    );

    expect(summary.totalAssetsVnd).toBe(100000);
    expect(summary.byAccount.map((item) => item.account.id)).toEqual(['cash']);
  });

  it('values included non-VND accounts without rates at 0 and keeps them in byAccount', () => {
    const summary = buildAssetSummary(
      [
        account({
          id: 'usd-wallet',
          kind: 'foreign_currency',
          name: 'USD Wallet',
          currency: 'USD',
          balance: 100,
        }),
        account({
          id: 'gold',
          kind: 'gold',
          name: 'Gold',
          balance: 0,
          quantity: 1,
          goldUnit: 'luong',
        }),
      ],
      [],
    );

    expect(summary.totalAssetsVnd).toBe(0);
    expect(summary.byAccount).toEqual([
      { account: expect.objectContaining({ id: 'usd-wallet' }), valueVnd: 0 },
      { account: expect.objectContaining({ id: 'gold' }), valueVnd: 0 },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  selectEffectiveAssetRate,
  selectEffectiveAssetRates,
} from '../../src/assets/rates';
import type { AssetRate } from '../../src/assets/types';

const now = '2026-07-11T09:00:00.000Z';

function rate(overrides: Partial<AssetRate> = {}): AssetRate {
  return {
    id: 'rate-1',
    pair: 'USD_VND',
    value: 25_000,
    source: 'auto',
    fetchedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('selectEffectiveAssetRate', () => {
  it('prefers an older manual user rate over a newer global auto rate', () => {
    const manual = rate({
      id: 'manual-usd',
      userId: 'user-1',
      source: 'manual',
      value: 24_000,
      fetchedAt: '2026-07-10T00:00:00.000Z',
    });
    const auto = rate({
      id: 'auto-usd',
      value: 26_000,
      fetchedAt: '2026-07-12T00:00:00.000Z',
    });

    expect(selectEffectiveAssetRate([auto, manual], 'USD_VND')).toBe(manual);
  });

  it('selects the newest valid manual rate', () => {
    const older = rate({
      id: 'older-manual',
      userId: 'user-1',
      source: 'manual',
      fetchedAt: '2026-07-10T00:00:00.000Z',
    });
    const newer = rate({
      id: 'newer-manual',
      userId: 'user-1',
      source: 'manual',
      fetchedAt: '2026-07-11T00:00:00.000Z',
    });

    expect(selectEffectiveAssetRate([newer, older], 'USD_VND')).toBe(newer);
  });

  it('ignores invalid and incorrectly scoped rates', () => {
    const fallback = rate({ id: 'valid-auto' });
    const invalidRates = [
      rate({ id: 'not-finite', userId: 'user-1', source: 'manual', value: Number.NaN }),
      rate({ id: 'zero', userId: 'user-1', source: 'manual', value: 0 }),
      rate({ id: 'negative', userId: 'user-1', source: 'manual', value: -1 }),
      rate({ id: 'infinite', userId: 'user-1', source: 'manual', value: Number.POSITIVE_INFINITY }),
      rate({ id: 'bad-date', userId: 'user-1', source: 'manual', fetchedAt: 'not-a-date' }),
      rate({ id: 'global-manual', source: 'manual' }),
      rate({ id: 'user-auto', userId: 'user-1', source: 'auto' }),
    ];

    expect(selectEffectiveAssetRate([...invalidRates, fallback], 'USD_VND')).toBe(fallback);
  });

  it('falls back to the newest valid global auto rate', () => {
    const older = rate({
      id: 'older-auto',
      fetchedAt: '2026-07-10T00:00:00.000Z',
    });
    const newer = rate({
      id: 'newer-auto',
      fetchedAt: '2026-07-12T00:00:00.000Z',
    });

    expect(selectEffectiveAssetRate([newer, older], 'USD_VND')).toBe(newer);
  });

  it('returns null when no valid rate is eligible', () => {
    const rates = [
      rate({ source: 'manual' }),
      rate({ userId: 'user-1', source: 'auto' }),
      rate({ value: 0 }),
      rate({ fetchedAt: 'not-a-date' }),
    ];

    expect(selectEffectiveAssetRate(rates, 'USD_VND')).toBeNull();
  });
});

describe('selectEffectiveAssetRates', () => {
  it('selects pairs independently in stable pair order', () => {
    const goldAuto = rate({
      id: 'gold-auto',
      pair: 'GOLD_GRAM_VND',
      value: 2_000_000,
    });
    const usdAuto = rate({ id: 'usd-auto', value: 26_000 });
    const goldManual = rate({
      id: 'gold-manual',
      userId: 'user-1',
      pair: 'GOLD_GRAM_VND',
      value: 1_900_000,
      source: 'manual',
      fetchedAt: '2026-07-10T00:00:00.000Z',
    });

    expect(selectEffectiveAssetRates([goldAuto, usdAuto, goldManual])).toEqual([
      usdAuto,
      goldManual,
    ]);
  });

  it('omits a pair with no eligible valid rate', () => {
    const gold = rate({
      id: 'gold-auto',
      pair: 'GOLD_GRAM_VND',
      value: 2_000_000,
    });

    expect(selectEffectiveAssetRates([gold])).toEqual([gold]);
  });
});

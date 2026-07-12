import type { AssetRate, AssetRatePair } from './types';

const ASSET_RATE_PAIRS: readonly AssetRatePair[] = [
  'USD_VND',
  'GOLD_GRAM_VND',
];

function validFetchedAt(rate: AssetRate): number | null {
  if (!Number.isFinite(rate.value) || rate.value <= 0) return null;

  const fetchedAt = Date.parse(rate.fetchedAt);
  return Number.isFinite(fetchedAt) ? fetchedAt : null;
}

export function selectEffectiveAssetRate(
  rates: readonly AssetRate[],
  pair: AssetRatePair,
): AssetRate | null {
  let newestManual: AssetRate | null = null;
  let newestManualFetchedAt = Number.NEGATIVE_INFINITY;
  let newestAuto: AssetRate | null = null;
  let newestAutoFetchedAt = Number.NEGATIVE_INFINITY;

  for (const rate of rates) {
    if (rate.pair !== pair) continue;

    const fetchedAt = validFetchedAt(rate);
    if (fetchedAt === null) continue;

    if (rate.source === 'manual' && rate.userId !== undefined) {
      if (fetchedAt >= newestManualFetchedAt) {
        newestManual = rate;
        newestManualFetchedAt = fetchedAt;
      }
    } else if (rate.source === 'auto' && rate.userId === undefined) {
      if (fetchedAt >= newestAutoFetchedAt) {
        newestAuto = rate;
        newestAutoFetchedAt = fetchedAt;
      }
    }
  }

  return newestManual ?? newestAuto;
}

export function selectEffectiveAssetRates(rates: readonly AssetRate[]): AssetRate[] {
  const selected: AssetRate[] = [];

  for (const pair of ASSET_RATE_PAIRS) {
    const rate = selectEffectiveAssetRate(rates, pair);
    if (rate) selected.push(rate);
  }

  return selected;
}

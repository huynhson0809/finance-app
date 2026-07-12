import type { AssetAccount, AssetRate, AssetSummary, GoldUnit } from './types';

function assertNever(value: never): never {
  throw new Error(`Unhandled asset kind: ${String(value)}`);
}

export function goldQuantityToGrams(quantity: number, unit: GoldUnit): number {
  switch (unit) {
    case 'gram':
      return quantity;
    case 'chi':
      return quantity * 3.75;
    case 'luong':
      return quantity * 37.5;
  }
}

export function getRateValue(rates: AssetRate[], pair: AssetRate['pair']): number | null {
  let newestRate: AssetRate | null = null;
  let newestFetchedAt: number | null = null;

  for (const rate of rates) {
    if (rate.pair !== pair) continue;

    const fetchedAt = Date.parse(rate.fetchedAt);
    if (!Number.isFinite(fetchedAt)) continue;

    if (newestFetchedAt === null || fetchedAt >= newestFetchedAt) {
      newestRate = rate;
      newestFetchedAt = fetchedAt;
    }
  }

  return newestRate?.value ?? null;
}

function currencyAmountToVnd(amount: number, currency: AssetAccount['currency'], rates: AssetRate[]): number {
  if (currency === 'VND') return amount;

  const usdVnd = getRateValue(rates, 'USD_VND');
  if (usdVnd === null) return 0;

  return amount * usdVnd;
}

export function valueAssetAccountVnd(account: AssetAccount, rates: AssetRate[]): number {
  switch (account.kind) {
    case 'cash':
    case 'bank':
    case 'savings':
    case 'foreign_currency':
      return currencyAmountToVnd(account.balance, account.currency, rates);
    case 'credit_card': {
      const debt = Math.max(0, account.balance);
      return debt === 0 ? 0 : -currencyAmountToVnd(debt, account.currency, rates);
    }
    case 'gold': {
      const goldGramVnd = getRateValue(rates, 'GOLD_GRAM_VND');
      if (goldGramVnd === null) return 0;

      return goldQuantityToGrams(account.quantity ?? 0, account.goldUnit ?? 'gram') * goldGramVnd;
    }
    default:
      return assertNever(account.kind);
  }
}

export function buildAssetSummary(accounts: AssetAccount[], rates: AssetRate[]): AssetSummary {
  let totalAssetsVnd = 0;
  let liquidVnd = 0;
  let savingsVnd = 0;
  let liabilityVnd = 0;
  const byAccount: AssetSummary['byAccount'] = [];

  for (const account of accounts) {
    if (!account.includeInTotal) continue;

    const valueVnd = valueAssetAccountVnd(account, rates);
    byAccount.push({ account, valueVnd });
    totalAssetsVnd += valueVnd;

    switch (account.kind) {
      case 'cash':
      case 'bank':
      case 'gold':
      case 'foreign_currency':
        liquidVnd += valueVnd;
        break;
      case 'savings':
        savingsVnd += valueVnd;
        break;
      case 'credit_card':
        liabilityVnd += Math.max(0, -valueVnd);
        break;
      default:
        assertNever(account.kind);
    }
  }

  return {
    totalAssetsVnd,
    liquidVnd,
    savingsVnd,
    liabilityVnd,
    byAccount,
  };
}

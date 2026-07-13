const VI = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const EN = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'VND', currencyDisplay: 'narrowSymbol' });
const VI_COMPACT = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const EN_COMPACT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const USD_VI = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'USD' });
const USD_EN = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatVND(amount: number, locale: 'vi' | 'en'): string {
  return (locale === 'vi' ? VI : EN).format(Math.round(amount));
}

export function formatUSD(amount: number, locale: 'vi' | 'en'): string {
  return (locale === 'vi' ? USD_VI : USD_EN).format(amount / 100);
}

export function formatMoney(amount: number, currency: 'VND' | 'USD', locale: 'vi' | 'en'): string {
  return currency === 'USD' ? formatUSD(amount, locale) : formatVND(amount, locale);
}

export function formatCompactVND(amount: number, locale: 'vi' | 'en'): string {
  const rounded = Math.round(Math.abs(amount));
  const formatter = locale === 'vi' ? VI_COMPACT : EN_COMPACT;

  if (rounded >= 1_000_000) {
    const suffix = locale === 'vi' ? 'tr' : 'M';
    return `${formatter.format(rounded / 1_000_000)}${suffix}`;
  }

  if (rounded >= 1_000) {
    return `${formatter.format(Math.round(rounded / 1_000))}k`;
  }

  return formatter.format(rounded);
}

export function parseVNDInput(raw: string): number {
  const cleaned = raw.replace(/[^\d]/g, '');
  if (!cleaned) return NaN;
  return parseInt(cleaned, 10);
}

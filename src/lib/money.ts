const VI = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const EN = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'VND', currencyDisplay: 'narrowSymbol' });

export function formatVND(amount: number, locale: 'vi' | 'en'): string {
  return (locale === 'vi' ? VI : EN).format(Math.round(amount));
}

export function parseVNDInput(raw: string): number {
  const cleaned = raw.replace(/[^\d]/g, '');
  if (!cleaned) return NaN;
  return parseInt(cleaned, 10);
}

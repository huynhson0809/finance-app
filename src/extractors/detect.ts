import type { OcrBankHint } from './types';

const FINGERPRINTS: Array<{ bank: OcrBankHint; patterns: RegExp[] }> = [
  { bank: 'vietcombank', patterns: [/vietcombank/i, /\bVCB\b/, /Số dư/i] },
  { bank: 'techcombank', patterns: [/techcombank/i, /\bTCB\b/] },
  { bank: 'momo',        patterns: [/\bMoMo\b/i, /Ví MoMo/i] },
  { bank: 'zalopay',     patterns: [/zalopay/i, /\bZP\b/] },
];

export function detectBank(text: string): OcrBankHint | null {
  if (!text) return null;
  let best: { bank: OcrBankHint; score: number } | null = null;
  for (const { bank, patterns } of FINGERPRINTS) {
    const score = patterns.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
    if (score > 0 && (best == null || score > best.score)) {
      best = { bank, score };
    }
  }
  return best?.bank ?? null;
}

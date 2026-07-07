import type { BankHint, Extracted, OcrBankHint } from './types';
import { detectBank } from './detect';
import { extractVietcombank } from './vietcombank';
import { extractTechcombank } from './techcombank';
import { extractMomo } from './momo';
import { extractZaloPay } from './zalopay';
import { extractReceipt } from './receipt';

const BANK_EXTRACTORS: Record<OcrBankHint, (text: string) => Partial<Extracted>> = {
  vietcombank: extractVietcombank,
  techcombank: extractTechcombank,
  momo: extractMomo,
  zalopay: extractZaloPay,
};

export function runExtractors(text: string):
  { fields: Partial<Extracted>; bankHint: BankHint | null }
{
  const bank = detectBank(text);
  if (bank) {
    const fields = BANK_EXTRACTORS[bank](text);
    if (fields.amount != null) return { fields, bankHint: bank };
    // Bank detected but extractor returned no amount.
    // Fall back to receipt for amount/date, but drop merchant — the receipt
    // extractor's "first line" heuristic would otherwise return the bank name.
    const receiptFields = extractReceipt(text);
    return { fields: { ...receiptFields, merchant: undefined }, bankHint: null };
  }
  return { fields: extractReceipt(text), bankHint: null };
}

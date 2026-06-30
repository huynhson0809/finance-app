import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runExtractors } from '../../src/extractors/pipeline';

function fixture(rel: string): string {
  return readFileSync(join(__dirname, '../fixtures/ocr', rel), 'utf8');
}

describe('runExtractors', () => {
  it('routes Vietcombank text to the Vietcombank extractor', () => {
    const { fields, bankHint } = runExtractors(fixture('vietcombank/sample-1.txt'));
    expect(bankHint).toBe('vietcombank');
    expect(fields.amount).toBe(250000);
  });

  it('falls back to receipt for unrecognized text', () => {
    const { fields, bankHint } = runExtractors(fixture('receipt/sample-1.txt'));
    expect(bankHint).toBeNull();
    expect(fields.amount).toBe(37000);
    expect(fields.merchant).toBe('Co.opmart Quan 5');
  });

  it('falls back to receipt when bank is detected but extractor produces no amount', () => {
    const noisy = 'Vietcombank but nothing else parseable here';
    const { fields, bankHint } = runExtractors(noisy);
    expect(bankHint).toBeNull(); // fell through
    expect(fields.amount).toBeUndefined();
  });

  it('returns empty fields for empty input', () => {
    const { fields, bankHint } = runExtractors('');
    expect(fields).toEqual({});
    expect(bankHint).toBeNull();
  });
});

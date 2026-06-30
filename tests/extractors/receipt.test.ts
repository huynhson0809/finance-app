import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractReceipt } from '../../src/extractors/receipt';

const FIXTURE = readFileSync(
  join(__dirname, '../fixtures/ocr/receipt/sample-1.txt'),
  'utf8',
);

describe('extractReceipt', () => {
  it('extracts amount from the largest VND-formatted total', () => {
    expect(extractReceipt(FIXTURE).amount).toBe(37000);
  });
  it('extracts merchant from the first non-empty line', () => {
    expect(extractReceipt(FIXTURE).merchant).toBe('Co.opmart Quan 5');
  });
  it('extracts occurredAt at local midnight when only date is present', () => {
    expect(extractReceipt(FIXTURE).occurredAt).toBe(
      new Date(2026, 5, 15, 0, 0).toISOString(),
    );
  });
  it('returns empty object for blank input', () => {
    expect(extractReceipt('')).toEqual({});
  });
});

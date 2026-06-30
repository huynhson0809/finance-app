import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractVietcombank } from '../../src/extractors/vietcombank';

const FIXTURE = readFileSync(
  join(__dirname, '../fixtures/ocr/vietcombank/sample-1.txt'),
  'utf8',
);

describe('extractVietcombank', () => {
  it('extracts amount as positive integer VND', () => {
    expect(extractVietcombank(FIXTURE).amount).toBe(250000);
  });
  it('extracts merchant from Noi dung line', () => {
    expect(extractVietcombank(FIXTURE).merchant).toBe('Thanh toan Highlands Coffee Hanoi');
  });
  it('extracts occurredAt as ISO 8601', () => {
    const out = extractVietcombank(FIXTURE);
    expect(out.occurredAt).toBe(new Date(2026, 5, 15, 14, 32).toISOString());
  });
  it('returns empty object for unrelated text', () => {
    expect(extractVietcombank('Hello world')).toEqual({});
  });
});

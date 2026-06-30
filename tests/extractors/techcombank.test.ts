import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractTechcombank } from '../../src/extractors/techcombank';

const FIXTURE = readFileSync(
  join(__dirname, '../fixtures/ocr/techcombank/sample-1.txt'),
  'utf8',
);

describe('extractTechcombank', () => {
  it('extracts amount', () => {
    expect(extractTechcombank(FIXTURE).amount).toBe(120000);
  });
  it('extracts merchant from "Diem den" line', () => {
    expect(extractTechcombank(FIXTURE).merchant).toBe('Circle K Quan 1');
  });
  it('extracts occurredAt', () => {
    expect(extractTechcombank(FIXTURE).occurredAt).toBe(
      new Date(2026, 5, 20, 9, 15).toISOString(),
    );
  });
  it('returns empty object for unrelated text', () => {
    expect(extractTechcombank('Hello world')).toEqual({});
  });
});

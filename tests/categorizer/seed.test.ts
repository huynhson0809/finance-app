import { describe, it, expect } from 'vitest';
import { SEED_RULES } from '../../src/categorizer/seed';
import { classify } from '../../src/categorizer/match';

describe('SEED_RULES', () => {
  it('has at least 30 entries', () => {
    expect(SEED_RULES.length).toBeGreaterThanOrEqual(30);
  });
  it('all patterns are pre-normalized (lowercase, no diacritics)', () => {
    for (const r of SEED_RULES) {
      expect(r.pattern).toBe(r.pattern.toLowerCase());
      expect(r.pattern).not.toMatch(/[̀-ͯ]/);
      expect(r.pattern).not.toMatch(/[đĐ]/);
    }
  });
  it('all rules are seed rules (learned=false, weight=1)', () => {
    for (const r of SEED_RULES) {
      expect(r.learned).toBe(false);
      expect(r.weight).toBe(1);
      expect(r.createdAt).toBe('1970-01-01T00:00:00.000Z');
    }
  });
  it('classifies common VN merchants correctly', () => {
    expect(classify('Highlands Coffee Hà Nội', SEED_RULES)?.category).toBe('coffee-bubble-tea');
    expect(classify('Grab Bike', SEED_RULES)?.category).toBe('transportation');
    expect(classify('MoMo transfer', SEED_RULES)?.category).toBe('transfers-debt');
    expect(classify('Shopee', SEED_RULES)?.category).toBe('shopping');
    expect(classify('EVN tiền điện', SEED_RULES)?.category).toBe('bills-utilities');
    expect(classify('Pharmacity', SEED_RULES)?.category).toBe('healthcare');
    expect(classify('Netflix subscription', SEED_RULES)?.category).toBe('entertainment');
  });
});

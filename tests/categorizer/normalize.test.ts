import { describe, it, expect } from 'vitest';
import { normalizeMerchant } from '../../src/categorizer/normalize';

describe('normalizeMerchant', () => {
  it('lowercases', () => {
    expect(normalizeMerchant('Highlands COFFEE')).toBe('highlands coffee');
  });
  it('strips Vietnamese diacritics', () => {
    expect(normalizeMerchant('Cà Phê Sữa Đá')).toBe('ca phe sua da');
  });
  it('maps đ/Đ to d', () => {
    expect(normalizeMerchant('Điện Máy Xanh')).toBe('dien may xanh');
  });
  it('collapses whitespace and trims', () => {
    expect(normalizeMerchant('  Highlands\t\tCoffee \n')).toBe('highlands coffee');
  });
  it('returns empty string unchanged', () => {
    expect(normalizeMerchant('')).toBe('');
  });
  it('handles em dash and punctuation conservatively', () => {
    expect(normalizeMerchant('Highlands — Hà Nội')).toBe('highlands — ha noi');
  });
});

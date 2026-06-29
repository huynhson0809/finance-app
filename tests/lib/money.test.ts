import { describe, it, expect } from 'vitest';
import { formatVND, parseVNDInput } from '../../src/lib/money';

describe('formatVND', () => {
  it('formats vi locale with dot thousands and trailing đ', () => {
    expect(formatVND(45000, 'vi')).toBe("45.000 ₫");
  });
  it('formats en locale with comma thousands and leading ₫', () => {
    expect(formatVND(45000, 'en')).toBe("₫45,000");
  });
  it('handles zero', () => {
    expect(formatVND(0, 'vi')).toBe("0 ₫");
  });
});

describe('parseVNDInput', () => {
  it.each([
    ['45000', 45000],
    ['45.000', 45000],
    ['45,000', 45000],
    ['1.234.567', 1234567],
    ['', NaN],
    ['abc', NaN],
  ])('parses %s → %s', (input, expected) => {
    const got = parseVNDInput(input);
    if (Number.isNaN(expected)) expect(Number.isNaN(got)).toBe(true);
    else expect(got).toBe(expected);
  });
});

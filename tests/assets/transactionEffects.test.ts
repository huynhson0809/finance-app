import { describe, expect, it } from 'vitest';
import {
  creditCardExpenseEffect,
  creditCardRefundEffect,
  expenseEffect,
  incomeEffect,
  transferInEffect,
  transferOutEffect,
} from '../../src/assets/transactionEffects';

const amount = 125_000;

describe('transaction effects', () => {
  it('decreases cash-like balances for expenses', () => {
    expect(expenseEffect(amount)).toBe(-amount);
  });

  it('increases cash-like balances for income', () => {
    expect(incomeEffect(amount)).toBe(amount);
  });

  it('increases credit-card debt for expenses', () => {
    expect(creditCardExpenseEffect(amount)).toBe(amount);
  });

  it('decreases credit-card debt for refunds', () => {
    expect(creditCardRefundEffect(amount)).toBe(-amount);
  });

  it('creates offsetting transfer effects that leave total assets unchanged', () => {
    const transferOut = transferOutEffect(amount);
    const transferIn = transferInEffect(amount);

    expect(transferOut).toBe(-amount);
    expect(transferIn).toBe(amount);
    expect(transferOut + transferIn).toBe(0);
  });

  it.each([
    ['expenseEffect', expenseEffect],
    ['incomeEffect', incomeEffect],
    ['creditCardExpenseEffect', creditCardExpenseEffect],
    ['creditCardRefundEffect', creditCardRefundEffect],
    ['transferOutEffect', transferOutEffect],
    ['transferInEffect', transferInEffect],
  ])('returns canonical zero from %s', (_name, effect) => {
    expect(effect(0)).toBe(0);
    expect(Object.is(effect(0), -0)).toBe(false);
  });

  it.each([
    ['expenseEffect', expenseEffect, -amount],
    ['incomeEffect', incomeEffect, amount],
    ['creditCardExpenseEffect', creditCardExpenseEffect, amount],
    ['creditCardRefundEffect', creditCardRefundEffect, -amount],
    ['transferOutEffect', transferOutEffect, -amount],
    ['transferInEffect', transferInEffect, amount],
  ])('normalizes a negative input before applying %s', (_name, effect, expected) => {
    expect(effect(-amount)).toBe(expected);
  });
});

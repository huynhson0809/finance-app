import { describe, expect, it } from 'vitest';
import { classify } from '../../src/categorizer/match';
import { SEED_RULES } from '../../src/categorizer/seed';
import { classifyEmailContent } from '../../supabase/functions/_shared/category';

describe('classifyEmailContent', () => {
  it('classifies known merchant content from bank emails', () => {
    expect(classifyEmailContent('Grab* BWCFLJMBDWRJ-G-1')).toBe('food-drinks');
    expect(classifyEmailContent('Thanh toan Shopee 12345')).toBe('shopping');
    expect(classifyEmailContent('Highlands Coffee Pasteur')).toBe('coffee-bubble-tea');
    expect(classifyEmailContent('HUYNH NGOC SON chuyen tien an uong trua')).toBe('food-drinks');
  });

  it('does not classify generic bank transfer wording as debt', () => {
    expect(classifyEmailContent('HUYNH NGOC SON CHUYEN KHOAN-060726-14:47:32 6187ASCB028NLNNA')).toBe('others');
    expect(classifyEmailContent('MB transfer ref 159287 1PEV8')).toBe('others');
  });

  it('does not let generic bank names override merchant matches in email content', () => {
    expect(classifyEmailContent('Thanh toan Shopee qua Techcombank')).toBe('shopping');
    expect(classifyEmailContent('Grab trip paid by Vietcombank')).toBe('food-drinks');
  });

  it('does not classify bank-name-only transfer content as debt', () => {
    expect(classifyEmailContent('Techcombank transfer notice')).toBe('others');
    expect(classifyEmailContent('Vietcombank transfer notice')).toBe('others');
  });

  it('matches the client seed categorizer for representative non-excluded merchants', () => {
    const samples = [
      'Highlands Coffee Pasteur',
      'Grab* BWCFLJMBDWRJ-G-1',
      'Thanh toan Shopee 12345',
      'Netflix monthly subscription',
      'Pharmacity Nguyen Trai',
    ];

    for (const sample of samples) {
      expect(classifyEmailContent(sample)).toBe(classify(sample, SEED_RULES)?.category ?? 'others');
    }
  });
});

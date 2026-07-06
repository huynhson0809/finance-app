import { describe, expect, it } from 'vitest';
import { classifyEmailContent } from '../../supabase/functions/_shared/category';

describe('classifyEmailContent', () => {
  it('classifies known merchant content from bank emails', () => {
    expect(classifyEmailContent('Grab* BWCFLJMBDWRJ-G-1')).toBe('transportation');
    expect(classifyEmailContent('Thanh toan Shopee 12345')).toBe('shopping');
    expect(classifyEmailContent('Highlands Coffee Pasteur')).toBe('coffee-bubble-tea');
  });

  it('does not classify generic bank transfer wording as debt', () => {
    expect(classifyEmailContent('HUYNH NGOC SON CHUYEN KHOAN-060726-14:47:32 6187ASCB028NLNNA')).toBe('others');
    expect(classifyEmailContent('MB transfer ref 159287 1PEV8')).toBe('others');
  });
});

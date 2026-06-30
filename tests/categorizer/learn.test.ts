import { describe, it, expect } from 'vitest';
import { shouldLearn } from '../../src/categorizer/learn';

const clock = () => new Date('2026-06-30T12:00:00.000Z');

describe('shouldLearn', () => {
  it('returns null when merchant is empty', () => {
    expect(shouldLearn('coffee-bubble-tea', 'food-drinks', '', clock)).toBeNull();
  });
  it('returns null when there was no suggestion', () => {
    expect(shouldLearn(null, 'food-drinks', 'Highlands', clock)).toBeNull();
  });
  it('returns null when chosen matches suggestion', () => {
    expect(shouldLearn('coffee-bubble-tea', 'coffee-bubble-tea', 'Highlands', clock)).toBeNull();
  });
  it('returns a learned rule on override', () => {
    const rule = shouldLearn('coffee-bubble-tea', 'food-drinks', 'Highlands Coffee', clock);
    expect(rule).not.toBeNull();
    expect(rule!.pattern).toBe('highlands coffee');
    expect(rule!.category).toBe('food-drinks');
    expect(rule!.learned).toBe(true);
    expect(rule!.weight).toBe(10);
    expect(rule!.createdAt).toBe('2026-06-30T12:00:00.000Z');
    expect(typeof rule!.id).toBe('string');
    expect(rule!.id.length).toBeGreaterThan(0);
  });
});

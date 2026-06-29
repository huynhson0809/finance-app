import { describe, it, expect } from 'vitest';
import { getSetting, setSetting } from '../../src/db/settings';

describe('settings store', () => {
  it('returns undefined for missing keys', async () => {
    expect(await getSetting('locale')).toBeUndefined();
  });
  it('round-trips string values', async () => {
    await setSetting('locale', 'vi');
    expect(await getSetting<string>('locale')).toBe('vi');
  });
  it('round-trips object values', async () => {
    await setSetting('flags', { foo: true });
    expect(await getSetting('flags')).toEqual({ foo: true });
  });
});

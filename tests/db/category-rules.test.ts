import { beforeEach, describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { __resetDBForTests } from '../../src/db';
import { getAllRules, upsertLearnedRule } from '../../src/db/category-rules';
import type { CategoryRule } from '../../src/types';

function rule(overrides: Partial<CategoryRule> = {}): CategoryRule {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    pattern: overrides.pattern ?? 'highlands',
    category: overrides.category ?? 'coffee-bubble-tea',
    weight: overrides.weight ?? 10,
    learned: overrides.learned ?? true,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  };
}

beforeEach(async () => {
  await __resetDBForTests();
  indexedDB.deleteDatabase('finance-app');
});

describe('category-rules db', () => {
  it('returns empty when nothing has been written', async () => {
    expect(await getAllRules()).toEqual([]);
  });
  it('persists a rule via upsertLearnedRule', async () => {
    const r = rule({ pattern: 'foo' });
    await upsertLearnedRule(r);
    const all = await getAllRules();
    expect(all).toHaveLength(1);
    expect(all[0].pattern).toBe('foo');
  });
  it('idempotent on same id (upsert)', async () => {
    const r = rule({ id: 'fixed', pattern: 'foo', category: 'food-drinks' });
    await upsertLearnedRule(r);
    await upsertLearnedRule({ ...r, category: 'shopping' });
    const all = await getAllRules();
    expect(all).toHaveLength(1);
    expect(all[0].category).toBe('shopping');
  });
});

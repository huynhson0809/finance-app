import type { Category, CategoryRule } from '../types';
import { normalizeMerchant } from './normalize';

export function shouldLearn(
  suggestion: Category | null,
  chosen: Category,
  merchant: string,
  clock: () => Date = () => new Date(),
): CategoryRule | null {
  if (!merchant.trim()) return null;
  if (suggestion == null) return null;
  if (suggestion === chosen) return null;
  return {
    id: crypto.randomUUID(),
    pattern: normalizeMerchant(merchant),
    category: chosen,
    weight: 10,
    learned: true,
    createdAt: clock().toISOString(),
  };
}

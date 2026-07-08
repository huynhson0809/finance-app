export type Category =
  | 'food-drinks'
  | 'coffee-bubble-tea'
  | 'transportation'
  | 'shopping'
  | 'bills-utilities'
  | 'healthcare'
  | 'entertainment'
  | 'transfers-debt'
  | 'others'
  | 'salary'
  | 'allowance'
  | 'bonus'
  | 'side-income'
  | 'investment'
  | 'temporary-income';

interface CategoryRule {
  id: string;
  pattern: string;
  category: Category;
  weight: number;
  learned: boolean;
  createdAt: string;
}

const FIXED_DATE = '1970-01-01T00:00:00.000Z';
const LEARNED_BONUS = 100;

function seed(pattern: string, category: Category): Omit<CategoryRule, 'id'> {
  return { pattern, category, weight: 1, learned: false, createdAt: FIXED_DATE };
}

const ENTRIES: Array<Omit<CategoryRule, 'id'>> = [
  seed('coffee', 'coffee-bubble-tea'),
  seed('cafe', 'coffee-bubble-tea'),
  seed('ca phe', 'coffee-bubble-tea'),
  seed('highlands', 'coffee-bubble-tea'),
  seed('starbucks', 'coffee-bubble-tea'),
  seed('phuc long', 'coffee-bubble-tea'),
  seed('trung nguyen', 'coffee-bubble-tea'),
  seed('the coffee house', 'coffee-bubble-tea'),
  seed('tocotoco', 'coffee-bubble-tea'),
  seed('gong cha', 'coffee-bubble-tea'),
  seed('koi', 'coffee-bubble-tea'),
  seed('grab', 'transportation'),
  seed('gojek', 'transportation'),
  seed('xanh sm', 'transportation'),
  seed('be ', 'transportation'),
  seed('taxi', 'transportation'),
  seed('xe om', 'transportation'),
  seed('petrolimex', 'transportation'),
  seed('circle k', 'food-drinks'),
  seed('family mart', 'food-drinks'),
  seed('winmart', 'food-drinks'),
  seed('vinmart', 'food-drinks'),
  seed('co.opmart', 'food-drinks'),
  seed('bach hoa xanh', 'food-drinks'),
  seed('lotteria', 'food-drinks'),
  seed('kfc', 'food-drinks'),
  seed('pho ', 'food-drinks'),
  seed('dien', 'bills-utilities'),
  seed('nuoc', 'bills-utilities'),
  seed('internet', 'bills-utilities'),
  seed('evn', 'bills-utilities'),
  seed('vnpt', 'bills-utilities'),
  seed('viettel', 'bills-utilities'),
  seed('fpt', 'bills-utilities'),
  seed('momo', 'transfers-debt'),
  seed('zalopay', 'transfers-debt'),
  seed('chuyen khoan', 'transfers-debt'),
  seed('transfer', 'transfers-debt'),
  seed('vietcombank', 'transfers-debt'),
  seed('techcombank', 'transfers-debt'),
  seed('shopee', 'shopping'),
  seed('lazada', 'shopping'),
  seed('tiki', 'shopping'),
  seed('sendo', 'shopping'),
  seed('netflix', 'entertainment'),
  seed('spotify', 'entertainment'),
  seed('cgv', 'entertainment'),
  seed('lotte cinema', 'entertainment'),
  seed('galaxy cinema', 'entertainment'),
  seed('pharmacity', 'healthcare'),
  seed('long chau', 'healthcare'),
  seed('medicare', 'healthcare'),
];

const SEED_RULES: CategoryRule[] = ENTRIES.map((entry, index) => ({
  ...entry,
  id: `seed-${index}`,
}));

// Email classification scans full bank email content, so generic transfer and
// bank-name seeds are too broad here even though they remain useful on client-entered merchants.
const EMAIL_EXCLUDED_PATTERNS = new Set([
  'transfer',
  'chuyen khoan',
  'vietcombank',
  'techcombank',
]);

const EMAIL_RULES = SEED_RULES.filter(rule =>
  !EMAIL_EXCLUDED_PATTERNS.has(rule.pattern),
);

export function classifyEmailContent(content: string): Category {
  return classify(content, EMAIL_RULES)?.category ?? 'others';
}

function classify(
  content: string,
  rules: CategoryRule[],
): { category: Category; ruleId: string } | null {
  if (!content.trim()) return null;
  const normalized = normalizeEmailContent(content);
  const candidates = rules.filter(rule => normalized.includes(rule.pattern));
  if (candidates.length === 0) return null;

  let best = candidates[0];
  for (const rule of candidates.slice(1)) {
    if (compare(rule, best) > 0) best = rule;
  }
  return { category: best.category, ruleId: best.id };
}

function compare(a: CategoryRule, b: CategoryRule): number {
  const scoreA = a.weight + (a.learned ? LEARNED_BONUS : 0);
  const scoreB = b.weight + (b.learned ? LEARNED_BONUS : 0);
  if (scoreA !== scoreB) return scoreA - scoreB;
  if (a.learned && b.learned) return a.createdAt.localeCompare(b.createdAt);
  return 0;
}

function normalizeEmailContent(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s.*-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

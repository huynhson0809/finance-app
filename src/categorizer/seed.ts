import type { CategoryRule, Category } from "../types";

const FIXED_DATE = "1970-01-01T00:00:00.000Z";

function seed(pattern: string, category: Category): Omit<CategoryRule, "id"> {
  return {
    pattern,
    category,
    weight: 1,
    learned: false,
    createdAt: FIXED_DATE,
  };
}

const ENTRIES: Array<Omit<CategoryRule, "id">> = [
  // category-label aliases
  seed("an uong", "food-drinks"),
  seed("food drinks", "food-drinks"),
  seed("ca phe tra sua", "coffee-bubble-tea"),
  seed("coffee bubble tea", "coffee-bubble-tea"),
  seed("di lai", "transportation"),
  seed("mua sam", "shopping"),
  seed("hoa don tien ich", "bills-utilities"),
  seed("hoa don", "bills-utilities"),
  seed("tien ich", "bills-utilities"),
  seed("suc khoe", "healthcare"),
  seed("y te", "healthcare"),
  seed("giai tri", "entertainment"),
  seed("chuyen khoan tra no", "transfers-debt"),
  // coffee-bubble-tea
  seed("coffee", "coffee-bubble-tea"),
  seed("cafe", "coffee-bubble-tea"),
  seed("ca phe", "coffee-bubble-tea"),
  seed("highlands", "coffee-bubble-tea"),
  seed("starbucks", "coffee-bubble-tea"),
  seed("phuc long", "coffee-bubble-tea"),
  seed("trung nguyen", "coffee-bubble-tea"),
  seed("the coffee house", "coffee-bubble-tea"),
  seed("tocotoco", "coffee-bubble-tea"),
  seed("gong cha", "coffee-bubble-tea"),
  seed("koi", "coffee-bubble-tea"),
  // transportation
  seed("grab", "food-drinks"),
  seed("gojek", "transportation"),
  seed("xanh sm", "transportation"),
  seed("be ", "transportation"), // trailing space to avoid clashing with words containing "be"
  seed("taxi", "transportation"),
  seed("xe om", "transportation"),
  seed("petrolimex", "transportation"),
  // food-drinks
  seed("circle k", "food-drinks"),
  seed("family mart", "food-drinks"),
  seed("winmart", "food-drinks"),
  seed("vinmart", "food-drinks"),
  seed("co.opmart", "food-drinks"),
  seed("co.op", "food-drinks"),
  seed("bach hoa xanh", "food-drinks"),
  seed("lotteria", "food-drinks"),
  seed("kfc", "food-drinks"),
  seed("pho ", "food-drinks"), // trailing space, avoid matching "phone" etc.
  // bills-utilities
  seed("dien", "bills-utilities"), // normalized "điện"
  seed("nuoc", "bills-utilities"),
  seed("internet", "bills-utilities"),
  seed("evn", "bills-utilities"),
  seed("vnpt", "bills-utilities"),
  seed("viettel", "bills-utilities"),
  seed("fpt", "bills-utilities"),
  // transfers-debt
  seed("momo", "transfers-debt"),
  seed("zalopay", "transfers-debt"),
  seed("chuyen khoan", "transfers-debt"),
  seed("transfer", "transfers-debt"),
  seed("vietcombank", "transfers-debt"),
  seed("techcombank", "transfers-debt"),
  // shopping
  seed("shopee", "shopping"),
  seed("lazada", "shopping"),
  seed("tiki", "shopping"),
  seed("sendo", "shopping"),
  // entertainment
  seed("netflix", "entertainment"),
  seed("spotify", "entertainment"),
  seed("cgv", "entertainment"),
  seed("lotte cinema", "entertainment"),
  seed("galaxy cinema", "entertainment"),
  // healthcare
  seed("pharmacity", "healthcare"),
  seed("long chau", "healthcare"),
  seed("medicare", "healthcare"),
];

export const SEED_RULES: CategoryRule[] = ENTRIES.map((e, i) => ({
  ...e,
  id: `seed-${i}`,
}));

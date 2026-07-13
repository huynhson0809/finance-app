import { describe, it, expect } from "vitest";
import { upsertBudget, getBudgetForMonth } from "../../src/db/budgets";

describe("budgets store", () => {
  it("upserts and reads back by month", async () => {
    await upsertBudget("2026-06", 5_000_000);
    const got = await getBudgetForMonth("2026-06");
    expect(got?.total).toBe(5_000_000);
    expect(got?.caps).toEqual({});
  });

  it("overwrites existing budget for the same month", async () => {
    await upsertBudget("2026-06", 5_000_000);
    await upsertBudget("2026-06", 6_000_000, { "coffee-bubble-tea": 200_000 });
    const got = await getBudgetForMonth("2026-06");
    expect(got?.total).toBe(6_000_000);
    expect(got?.caps).toEqual({ "coffee-bubble-tea": 200_000 });
  });

  it("returns undefined when no budget exists", async () => {
    expect(await getBudgetForMonth("2030-01")).toBeUndefined();
  });
});

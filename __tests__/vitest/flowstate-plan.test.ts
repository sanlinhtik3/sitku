import { describe, expect, it } from "vitest";
import {
  computePlannedExpenseSummary,
  derivePlannedExpenseStatus,
  nextPlannedExpenseDueDate,
  plannedExpenseDisplayStatus,
  type PlannedExpense,
} from "@/lib/flowstate/plan";

function item(overrides: Partial<PlannedExpense> = {}): PlannedExpense {
  return {
    id: "plan-1",
    user_id: "local-user",
    title: "Office rent",
    amount: 1_000,
    paid_amount: 0,
    currency: "THB",
    due_date: "2026-07-30",
    category_id: null,
    account_id: null,
    subscription_id: null,
    recurrence: "none",
    series_id: null,
    priority: "normal",
    status: "planned",
    notes: null,
    linked_transaction_ids: [],
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Personal CFO planned expenses", () => {
  it("calculates planned, paid, remaining, due, overdue, and projected balance", () => {
    const summary = computePlannedExpenseSummary([
      item({ id: "paid", amount: 1_000, paid_amount: 1_000, due_date: "2026-07-20", status: "paid" }),
      item({ id: "due", amount: 2_000, paid_amount: 500, due_date: "2026-07-31", status: "partially_paid" }),
      item({ id: "overdue", amount: 500, due_date: "2026-07-28" }),
      item({ id: "skipped", amount: 9_000, due_date: "2026-07-30", status: "skipped" }),
    ], (amount) => amount, 10_000, "2026-07-29");

    expect(summary).toEqual({
      totalPlanned: 3_500,
      paid: 1_500,
      remaining: 2_000,
      dueThisWeek: 1,
      overdue: 1,
      projectedBalance: 8_000,
      progressPct: (1_500 / 3_500) * 100,
    });
  });

  it("derives payment and calendar statuses without mutating stored status", () => {
    expect(derivePlannedExpenseStatus(item({ paid_amount: 500 }))).toBe("partially_paid");
    expect(derivePlannedExpenseStatus(item({ paid_amount: 1_000 }))).toBe("paid");
    expect(plannedExpenseDisplayStatus(item({ due_date: "2026-07-28" }), "2026-07-29")).toBe("overdue");
    expect(plannedExpenseDisplayStatus(item({ due_date: "2026-08-02" }), "2026-07-29")).toBe("due_soon");
  });

  it("advances recurring commitments deterministically", () => {
    expect(nextPlannedExpenseDueDate("2026-07-31", "weekly")).toBe("2026-08-07");
    expect(nextPlannedExpenseDueDate("2026-07-15", "monthly")).toBe("2026-08-15");
    expect(nextPlannedExpenseDueDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextPlannedExpenseDueDate("2026-07-15", "yearly")).toBe("2027-07-15");
    expect(nextPlannedExpenseDueDate("2026-07-15", "none")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  answerLocalFinanceQuestion,
  buildLocalFinanceInsights,
} from "@/lib/flowstate/aiInsights";
import type { FlowStateStats } from "@/hooks/useFlowState";

function stats(overrides: Partial<FlowStateStats> = {}): FlowStateStats {
  const zero = { THB: 0, USD: 0, MMK: 0 };
  return {
    incomeThisMonth: 0,
    expensesThisMonth: 0,
    netBalance: 0,
    totalBalance: 0,
    subscriptionsMonthly: 0,
    incomeLastMonth: 0,
    expensesLastMonth: 0,
    incomeChange: 0,
    expenseChange: 0,
    netBalanceMulti: zero,
    incomeMulti: zero,
    expenseMulti: zero,
    totalBalanceMulti: zero,
    subscriptionsMulti: zero,
    ...overrides,
  };
}

describe("local FlowState financial analysis", () => {
  it("builds useful forecasts without a network backend", () => {
    const result = buildLocalFinanceInsights(
      stats({
        incomeThisMonth: 100_000,
        expensesThisMonth: 60_000,
        expensesLastMonth: 50_000,
      }),
      [{
        category: "Rent",
        categoryMy: null,
        icon: "home",
        color: "#fff",
        amount: 30_000,
        percentage: 50,
      }],
      "THB",
    );

    expect(result.budgetRecommendation).toBe(60_000);
    expect(result.savingsPrediction).toBe(480_000);
    expect(result.monthlyForecast).toBe(55_000);
    expect(result.insights.some((insight) => insight.title === "Rent leads spending")).toBe(true);
  });

  it("does not invent a budget when income data is missing", () => {
    const result = buildLocalFinanceInsights(
      stats({ expensesThisMonth: 10_000 }),
      [],
      "THB",
    );

    expect(result.budgetRecommendation).toBeNull();
    expect(result.insights[0]?.title).toBe("Income data needed");
  });

  it("answers common questions from local financial data", () => {
    const answer = answerLocalFinanceQuestion(
      "How can I reduce my expenses?",
      stats({ incomeThisMonth: 50_000, expensesThisMonth: 30_000 }),
      [{
        category: "Food",
        categoryMy: null,
        icon: "food",
        color: "#fff",
        amount: 15_000,
        percentage: 50,
      }],
      "THB",
    );

    expect(answer).toContain("Food");
    expect(answer).toContain("15,000");
  });
});

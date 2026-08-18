import type { CategoryBreakdown, FlowStateStats } from "@/hooks/useFlowState";

export interface FinanceInsight {
  type: "warning" | "success" | "tip" | "prediction";
  title: string;
  description: string;
  icon: string;
}

export interface FinanceInsightResponse {
  insights: FinanceInsight[];
  budgetRecommendation: number | null;
  savingsPrediction: number | null;
  monthlyForecast: number | null;
}

function money(value: number, currency: string): string {
  return `${currency} ${Math.round(value).toLocaleString()}`;
}

export function buildLocalFinanceInsights(
  stats: FlowStateStats,
  categoryBreakdown: CategoryBreakdown[],
  currency: string,
): FinanceInsightResponse {
  const income = Math.max(0, Number(stats.incomeThisMonth) || 0);
  const expenses = Math.max(0, Number(stats.expensesThisMonth) || 0);
  const net = income - expenses;
  const expenseRatio = income > 0 ? expenses / income : null;
  const topCategory = [...categoryBreakdown]
    .filter((item) => Number(item.amount) > 0)
    .sort((a, b) => Number(b.amount) - Number(a.amount))[0];
  const insights: FinanceInsight[] = [];

  if (income <= 0) {
    insights.push({
      type: "tip",
      title: "Income data needed",
      description: "Add this month's income to calculate a reliable budget and savings forecast.",
      icon: "wallet",
    });
  } else if (net >= 0) {
    insights.push({
      type: "success",
      title: "Positive monthly cash flow",
      description: `${money(net, currency)} remains after recorded expenses this month.`,
      icon: "trending-up",
    });
  } else {
    insights.push({
      type: "warning",
      title: "Expenses exceed income",
      description: `Recorded expenses are ${money(Math.abs(net), currency)} above this month's income.`,
      icon: "alert",
    });
  }

  if (expenseRatio !== null) {
    if (expenseRatio > 0.85) {
      insights.push({
        type: "warning",
        title: "Low spending headroom",
        description: `${Math.round(expenseRatio * 100)}% of recorded income has already been committed.`,
        icon: "gauge",
      });
    } else {
      insights.push({
        type: "tip",
        title: "Budget headroom available",
        description: `${Math.round((1 - expenseRatio) * 100)}% of recorded income remains unspent.`,
        icon: "target",
      });
    }
  }

  if (topCategory) {
    insights.push({
      type: "prediction",
      title: `${topCategory.category} leads spending`,
      description: `${money(topCategory.amount, currency)} accounts for ${Math.round(topCategory.percentage)}% of categorized expenses.`,
      icon: "chart",
    });
  }

  const previousExpenses = Math.max(0, Number(stats.expensesLastMonth) || 0);
  const monthlyForecast = expenses > 0
    ? Math.round(previousExpenses > 0 ? (expenses + previousExpenses) / 2 : expenses)
    : previousExpenses || null;
  const budgetRecommendation = income > 0
    ? Math.max(0, Math.round(Math.min(income * 0.8, Math.max(expenses, income * 0.5))))
    : null;

  return {
    insights,
    budgetRecommendation,
    savingsPrediction: income > 0 ? Math.round(net * 12) : null,
    monthlyForecast,
  };
}

export function answerLocalFinanceQuestion(
  message: string,
  stats: FlowStateStats,
  categoryBreakdown: CategoryBreakdown[],
  currency: string,
): string {
  const normalized = message.toLowerCase();
  const local = buildLocalFinanceInsights(stats, categoryBreakdown, currency);
  const topCategory = [...categoryBreakdown]
    .filter((item) => Number(item.amount) > 0)
    .sort((a, b) => Number(b.amount) - Number(a.amount))[0];

  if (normalized.includes("save") || normalized.includes("saving")) {
    if (stats.incomeThisMonth <= 0) return "Add this month's income first so I can calculate a reliable savings target.";
    const available = Math.max(0, stats.incomeThisMonth - stats.expensesThisMonth);
    return `Your current recorded headroom is ${money(available, currency)}. Protect part of it first, then review the largest expense category.`;
  }
  if (normalized.includes("reduce") || normalized.includes("expense")) {
    if (!topCategory) return "Add categorized expenses first. I will then identify the largest area to review.";
    return `${topCategory.category} is currently the largest category at ${money(topCategory.amount, currency)}. Review that category first for the highest impact.`;
  }
  if (normalized.includes("budget")) {
    return local.budgetRecommendation === null
      ? "Add income and expense data first so I can calculate a reliable monthly budget."
      : `A conservative budget based on current records is ${money(local.budgetRecommendation, currency)}.`;
  }
  return local.insights[0]?.description || "Add more transactions to unlock a useful local financial analysis.";
}

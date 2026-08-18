export type PlannedExpenseRecurrence = "none" | "weekly" | "monthly" | "yearly";
export type PlannedExpensePriority = "normal" | "high";
export type PlannedExpenseStatus = "planned" | "partially_paid" | "paid" | "skipped";

export interface PlannedExpense {
  id: string;
  user_id: string;
  title: string;
  amount: number;
  paid_amount: number;
  currency: string;
  due_date: string;
  category_id: string | null;
  account_id: string | null;
  subscription_id: string | null;
  recurrence: PlannedExpenseRecurrence;
  series_id: string | null;
  priority: PlannedExpensePriority;
  status: PlannedExpenseStatus;
  notes: string | null;
  linked_transaction_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface PlannedExpenseSummary {
  totalPlanned: number;
  paid: number;
  remaining: number;
  dueThisWeek: number;
  overdue: number;
  projectedBalance: number;
  progressPct: number;
}

const DAY_MS = 86_400_000;

function parseLocalDay(value: string): number {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, Math.max(0, (month || 1) - 1), day || 1);
}

export function plannedExpenseRemaining(item: PlannedExpense): number {
  if (item.status === "skipped") return 0;
  return Math.max(0, Number(item.amount || 0) - Number(item.paid_amount || 0));
}

export function derivePlannedExpenseStatus(
  item: Pick<PlannedExpense, "amount" | "paid_amount" | "status">,
): PlannedExpenseStatus {
  if (item.status === "skipped") return "skipped";
  const amount = Math.max(0, Number(item.amount) || 0);
  const paid = Math.max(0, Number(item.paid_amount) || 0);
  if (amount > 0 && paid >= amount) return "paid";
  if (paid > 0) return "partially_paid";
  return "planned";
}

export function plannedExpenseDisplayStatus(
  item: PlannedExpense,
  today: string,
): PlannedExpenseStatus | "overdue" | "due_soon" {
  const status = derivePlannedExpenseStatus(item);
  if (status !== "planned" && status !== "partially_paid") return status;
  const dueDay = parseLocalDay(item.due_date);
  const todayDay = parseLocalDay(today);
  if (dueDay < todayDay) return "overdue";
  if (dueDay <= todayDay + (7 * DAY_MS)) return "due_soon";
  return status;
}

export function computePlannedExpenseSummary(
  items: PlannedExpense[],
  convertToPrimary: (amount: number, currency: string) => number,
  currentBalance: number,
  today: string,
): PlannedExpenseSummary {
  const todayDay = parseLocalDay(today);
  const weekEnd = todayDay + (7 * DAY_MS);
  let totalPlanned = 0;
  let paid = 0;
  let remaining = 0;
  let dueThisWeek = 0;
  let overdue = 0;

  for (const item of items) {
    if (item.status === "skipped") continue;
    const plannedPrimary = convertToPrimary(Math.max(0, Number(item.amount) || 0), item.currency);
    const paidPrimary = convertToPrimary(
      Math.min(Math.max(0, Number(item.paid_amount) || 0), Math.max(0, Number(item.amount) || 0)),
      item.currency,
    );
    const remainingPrimary = Math.max(0, plannedPrimary - paidPrimary);
    const dueDay = parseLocalDay(item.due_date);

    totalPlanned += plannedPrimary;
    paid += paidPrimary;
    remaining += remainingPrimary;
    if (remainingPrimary > 0 && dueDay < todayDay) overdue += 1;
    if (remainingPrimary > 0 && dueDay >= todayDay && dueDay <= weekEnd) dueThisWeek += 1;
  }

  return {
    totalPlanned,
    paid,
    remaining,
    dueThisWeek,
    overdue,
    projectedBalance: currentBalance - remaining,
    progressPct: totalPlanned > 0 ? Math.min(100, (paid / totalPlanned) * 100) : 0,
  };
}

export function nextPlannedExpenseDueDate(
  dueDate: string,
  recurrence: PlannedExpenseRecurrence,
): string | null {
  if (recurrence === "none") return null;
  const [year, month, day] = dueDate.slice(0, 10).split("-").map(Number);
  const sourceMonth = Math.max(0, (month || 1) - 1);
  const sourceDay = day || 1;
  let date = new Date(year, sourceMonth, sourceDay);
  if (recurrence === "weekly") date.setDate(date.getDate() + 7);
  if (recurrence === "monthly") {
    const targetMonthStart = new Date(year, sourceMonth + 1, 1);
    const lastDay = new Date(targetMonthStart.getFullYear(), targetMonthStart.getMonth() + 1, 0).getDate();
    date = new Date(targetMonthStart.getFullYear(), targetMonthStart.getMonth(), Math.min(sourceDay, lastDay));
  }
  if (recurrence === "yearly") {
    const targetYear = year + 1;
    const lastDay = new Date(targetYear, sourceMonth + 1, 0).getDate();
    date = new Date(targetYear, sourceMonth, Math.min(sourceDay, lastDay));
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

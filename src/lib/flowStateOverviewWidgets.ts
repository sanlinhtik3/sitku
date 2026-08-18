export const FLOWSTATE_WIDGETS = [
  { key: "net", label: "Net summary", description: "Net · this month hero + currency chips" },
  { key: "income", label: "Income timeline", description: "Daily income · expense · net" },
  { key: "incomeIntel", label: "Income intelligence", description: "Source flow · top sources · brief" },
  { key: "spending", label: "Spending by category", description: "Expense breakdown donut" },
  { key: "trend", label: "Monthly trend", description: "6-month income vs expense" },
  { key: "goal", label: "Savings goal", description: "Goal progress + source split" },
  { key: "subs", label: "Subscriptions", description: "Recurring payments summary" },
  { key: "txns", label: "Recent transactions", description: "Latest entries + comparison" },
  { key: "calendar", label: "Cash-flow calendar", description: "Daily heatmap" },
] as const;

export type FlowStateWidgetKey = typeof FLOWSTATE_WIDGETS[number]["key"];
export type FlowStateWidgetVisibility = Record<FlowStateWidgetKey, boolean>;

const STORAGE_KEY = "sitku.flowstate.overview-widgets.v1";
export const FLOWSTATE_WIDGETS_CHANGED = "sitku:flowstate-widgets-changed";

export const DEFAULT_FLOWSTATE_WIDGETS = Object.fromEntries(
  FLOWSTATE_WIDGETS.map(({ key }) => [key, true]),
) as FlowStateWidgetVisibility;

export function readFlowStateWidgetVisibility(): FlowStateWidgetVisibility {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as Partial<FlowStateWidgetVisibility> | null;
    return { ...DEFAULT_FLOWSTATE_WIDGETS, ...(stored || {}) };
  } catch {
    return { ...DEFAULT_FLOWSTATE_WIDGETS };
  }
}

export function writeFlowStateWidgetVisibility(value: FlowStateWidgetVisibility) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(FLOWSTATE_WIDGETS_CHANGED, { detail: value }));
}

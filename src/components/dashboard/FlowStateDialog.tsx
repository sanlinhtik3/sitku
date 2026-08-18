import { lazy, Suspense, useState, useMemo, useRef, useEffect, type CSSProperties } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet, Plus, TrendingUp, TrendingDown, CreditCard, PiggyBank, Loader2, Repeat2, Search, X, Minus } from "@/components/flowstate/solarIcons";
import {
  Widget as SolarWidget,
  List as SolarList,
  Wallet as SolarWallet,
  CalendarMark as SolarCalendarMark,
  RefreshCircle as SolarRefreshCircle,
  Card as SolarCard,
  MagicStick3 as SolarMagicStick3,
  History as SolarHistory,
  Settings as SolarSettings,
} from "@solar-icons/react";
import { useQuery } from "@tanstack/react-query";
import { financeStore } from "@/repositories/local/financeStore";
import { useFlowState, useFlowStateMonthlyTrend, type Transaction } from "@/hooks/useFlowState";
import { StatCard } from "@/components/flowstate/ui/StatCard";
import { SpendingDonutChart } from "@/components/flowstate/ui/SpendingDonutChart";
import { MonthlyTrendChart } from "@/components/flowstate/ui/MonthlyTrendChart";
import { VirtualTransactionList } from "@/components/flowstate/ui/VirtualTransactionList";
import { CurrencyDisplay } from "@/components/flowstate/ui/CurrencyDisplay";
import { SpendingCalendar } from "@/components/flowstate/ui/SpendingCalendar";
import { HistoryComparisonChart } from "@/components/flowstate/ui/HistoryComparisonChart";
import { TransactionRow } from "@/components/flowstate/ui/TransactionRow";
import { useNavigate } from "react-router-dom";
import { FinanceRangeSelector } from "@/components/flowstate/intelligence/FinanceRangeSelector";
import { FinancialGoalCard } from "@/components/flowstate/goal/FinancialGoalCard";
import { type ConsultantRangePreset } from "@/hooks/useConsultantData";
import { cn } from "@/lib/utils";
import { format, subMonths } from "date-fns";
import { FLOWSTATE_WIDGETS_CHANGED, readFlowStateWidgetVisibility, type FlowStateWidgetVisibility } from "@/lib/flowStateOverviewWidgets";
import { FuiLabel, FuiMetric, FuiPanel, FuiStatus } from "@/design-system/fui";

const loadFlowStateAccounts = () => import("@/components/flowstate/FlowStateAccounts");
const loadFlowStatePlan = () => import("@/components/flowstate/FlowStatePlan");
const loadFlowStateSubscriptions = () => import("@/components/flowstate/FlowStateSubscriptions");
const loadFlowStateAIInsights = () => import("@/components/flowstate/FlowStateAIInsights");
const loadFlowStateCFO = () => import("@/components/flowstate/FlowStateCFO");
const loadFlowStateHistory = () => import("@/components/flowstate/FlowStateHistory");
const loadFlowStateManage = () => import("@/components/flowstate/FlowStateManage");

const FlowStateAccounts = lazy(() => loadFlowStateAccounts().then((module) => ({ default: module.FlowStateAccounts })));
const FlowStatePlan = lazy(() => loadFlowStatePlan().then((module) => ({ default: module.FlowStatePlan })));
const FlowStateSubscriptions = lazy(() => loadFlowStateSubscriptions().then((module) => ({ default: module.FlowStateSubscriptions })));
const FlowStateAIInsights = lazy(() => loadFlowStateAIInsights().then((module) => ({ default: module.FlowStateAIInsights })));
const FlowStateCFO = lazy(() => loadFlowStateCFO().then((module) => ({ default: module.FlowStateCFO })));
const FlowStateHistory = lazy(() => loadFlowStateHistory().then((module) => ({ default: module.FlowStateHistory })));
const FlowStateManage = lazy(() => loadFlowStateManage().then((module) => ({ default: module.FlowStateManage })));
const AddTransactionDialog = lazy(() => import("@/components/flowstate/AddTransactionDialog").then((module) => ({ default: module.AddTransactionDialog })));
const EditTransactionDialog = lazy(() => import("@/components/flowstate/EditTransactionDialog").then((module) => ({ default: module.EditTransactionDialog })));

const tabModuleLoaders: Partial<Record<string, () => Promise<unknown>>> = {
  overview: loadFlowStateCFO,
  plan: loadFlowStatePlan,
  subscriptions: loadFlowStateSubscriptions,
  accounts: loadFlowStateAccounts,
  "ai-insights": loadFlowStateAIInsights,
  history: loadFlowStateHistory,
  manage: loadFlowStateManage,
};

function preloadFlowStateTab(tab: string) {
  void tabModuleLoaders[tab]?.();
}

function FlowStateModuleFallback() {
  return (
    <div className="flex min-h-48 items-center justify-center" role="status" aria-label="Loading section">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

const flowStateTabs = [
  ["overview", "Overview", SolarWidget],
  ["transactions", "Transactions", SolarList],
  ["plan", "Plan", SolarCalendarMark],
  ["subscriptions", "Subscriptions", SolarRefreshCircle],
  ["accounts", "Accounts", SolarCard],
  ["ai-insights", "AI Insights", SolarMagicStick3],
  ["history", "History", SolarHistory],
  ["manage", "Manage", SolarSettings],
] as const;

interface FlowStateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

export function FlowStateDialog({ open, onOpenChange, userId }: FlowStateDialogProps) {
  const [activeTab, setActiveTab] = useState("overview");

  const navigate = useNavigate();
  const openInSitku = (prompt: string) => {
    try { sessionStorage.setItem("sitku_prefill", prompt); } catch { /* storage can be unavailable in private contexts */ }
    navigate("/sitku");
    onOpenChange(false);
  };
  const [addTransactionOpen, setAddTransactionOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [transactionQuery, setTransactionQuery] = useState("");
  const [transactionFilter, setTransactionFilter] = useState<"all" | "income" | "expense">("all");
  const [visibleWidgets, setVisibleWidgets] = useState<FlowStateWidgetVisibility>(readFlowStateWidgetVisibility);
  // Shared tabs scroller — the virtualized Transactions list scrolls against this.
  const tabScrollRef = useRef<HTMLDivElement>(null);

  // Overview "Source Flow" chart range — independent (Today / Week / Month / 28D / 90D).
  const [flowRangePreset, setFlowRangePreset] = useState<ConsultantRangePreset>("this_month");
  // Lightweight settings read just to learn primaryCurrency. Shares the SAME query
  // key as useFlowState's internal settings query → deduped, no extra IO. Previously
  // this was a SECOND full useFlowState(userId, "THB") call, which re-ran the entire
  // stats aggregation a second time on every open — pure waste.
  const { data: settingsRow } = useQuery({
    queryKey: ["flowstate-settings", userId],
    queryFn: () => (userId ? financeStore.getSettings(userId) : null),
    enabled: !!userId,
  });
  const primaryCurrency = settingsRow?.primary_currency || "THB";
  const periodSubtitle = useMemo(() => {
    const now = new Date();
    const previous = subMonths(now, 1);
    const currentLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(now);
    const previousLabel = new Intl.DateTimeFormat(undefined, { month: "long" }).format(previous);
    return `${currentLabel} · vs ${previousLabel} baseline · ${primaryCurrency} primary`;
  }, [primaryCurrency]);

  const flowStateWithPrimary = useFlowState(userId, primaryCurrency);

  const { data: monthlyTrend = [], isLoading: trendLoading } = useFlowStateMonthlyTrend(userId, primaryCurrency);

  const {
    stats,
    transactions,
    accounts,
    categories,
    subscriptions,
    settings,
    categoryBreakdown,

    isLoading,
    addTransaction,
    isAddingTransaction,
    deleteTransaction,
    isDeletingTransaction,
    updateTransaction,
    isUpdatingTransaction,
    addAccount,
    isAddingAccount,
    deleteAccount,
    isDeletingAccount,
    setDefaultAccount,
    isSettingDefaultAccount,
    addSubscription,
    isAddingSubscription,
    deleteSubscription,
    updateSubscription,
    refetch,
  } = flowStateWithPrimary;

  useEffect(() => {
    const refreshFromVoice = () => { void refetch(); };
    window.addEventListener("beebot:finance-changed", refreshFromVoice);
    return () => window.removeEventListener("beebot:finance-changed", refreshFromVoice);
  }, [refetch]);

  useEffect(() => {
    const syncWidgets = (event: Event) => {
      setVisibleWidgets((event as CustomEvent<FlowStateWidgetVisibility>).detail || readFlowStateWidgetVisibility());
    };
    window.addEventListener(FLOWSTATE_WIDGETS_CHANGED, syncWidgets);
    return () => window.removeEventListener(FLOWSTATE_WIDGETS_CHANGED, syncWidgets);
  }, []);


  const handleAddTransaction = (data: {
    type: "income" | "expense";
    amount: number;
    currency: string;
    account_id: string;
    category_id: string;
    description: string;
    notes: string;
    transaction_date: string;
    source?: string | null;
  }) => {
    addTransaction({
      type: data.type,
      amount: data.amount,
      currency: data.currency,
      account_id: data.account_id,
      category_id: data.category_id,
      description: data.description,
      notes: data.notes,
      transaction_date: data.transaction_date,
      source: data.source ?? null,
    });
  };

  // Distinct prior income sources per category — feeds the Add/Edit dialog autocomplete.
  const sourceSuggestions = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const t of transactions) {
      if (t.type !== "income" || !t.category_id || !t.source) continue;
      (map[t.category_id] ||= new Set()).add(t.source);
    }
    const out: Record<string, string[]> = {};
    for (const k of Object.keys(map)) out[k] = [...map[k]].sort();
    return out;
  }, [transactions]);

  const visibleTransactions = useMemo(() => {
    const query = transactionQuery.trim().toLocaleLowerCase();
    return transactions.filter((transaction) => {
      if (transactionFilter !== "all" && transaction.type !== transactionFilter) return false;
      if (!query) return true;
      return [transaction.description, transaction.notes, transaction.source]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(query));
    });
  }, [transactionFilter, transactionQuery, transactions]);

  const comparisonTrend = useMemo(() => monthlyTrend.map((month, index) => ({
    month: format(subMonths(new Date(), monthlyTrend.length - 1 - index), "yyyy-MM"),
    income: month.income,
    expense: month.expense,
    net: month.income - month.expense,
  })), [monthlyTrend]);

  const netState = stats.netBalance < 0 ? "loss" : stats.netBalance > 0 ? "profit" : "neutral";
  const currentMonthLabel = format(new Date(), "MMM");
  const previousMonthLabel = format(subMonths(new Date(), 1), "MMM");
  const topIncomeSource = useMemo(() => {
    const totals = new Map<string, number>();
    for (const transaction of transactions) {
      if (transaction.type !== "income") continue;
      const label = transaction.source || transaction.category?.name || "Unattributed";
      totals.set(label, (totals.get(label) || 0) + Number(transaction.amount));
    }
    return [...totals].sort((a, b) => b[1] - a[1])[0]?.[0];
  }, [transactions]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layout="fullscreen" className="flowstate-app !inset-0 !translate-x-0 !translate-y-0 !max-w-none !w-screen !h-dvh !max-h-dvh flex flex-col !p-0 !gap-0 !rounded-none !border-0 overflow-hidden [&>button:last-child]:hidden">
        {/* Header */}
        <DialogHeader
          className="flowstate-header native-titlebar-safe native-titlebar-drag shrink-0"
          // Reserve the macOS traffic-light gutter (mac desktop only; 0 elsewhere) so the
          // OS lights don't overlap the wallet icon / title. Drag the window by this bar.
          style={{ WebkitAppRegion: "drag" } as CSSProperties}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flowstate-wallet-badge">
                <Wallet className="h-[19px] w-[19px]" />
              </div>
              <div>
                <DialogTitle className="flowstate-title">Personal CFO</DialogTitle>
                <p className="flowstate-subtitle">{periodSubtitle}</p>
              </div>
            </div>
            <div className="flowstate-header-actions native-titlebar-interactive">
              <FinanceRangeSelector value={flowRangePreset} onChange={setFlowRangePreset} />
              <Button
                size="sm"
                className="flowstate-add-button gap-1.5"
                onClick={() => setAddTransactionOpen(true)}
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline font-medium">Add entry</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="flowstate-close h-9 w-9"
                aria-label="Close Personal CFO"
                title="Close Personal CFO"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <nav className="flowstate-primary-tabs" aria-label="Personal CFO sections">
          {flowStateTabs.map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              data-active={activeTab === value}
              onPointerEnter={() => preloadFlowStateTab(value)}
              onFocus={() => preloadFlowStateTab(value)}
              onClick={() => setActiveTab(value)}
            >
              <Icon className="h-3.5 w-3.5" weight="Linear" aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className={cn("flowstate-hero grid gap-[14px]", !visibleWidgets.net && "flowstate-hero-no-net")}>
          {/* Net Balance Hero */}
          {visibleWidgets.net && <div>
            <FuiPanel tone="primary" className="flowstate-glass flowstate-net-card h-full" data-balance={netState}>
              <div className="flowstate-net-heading">
                <div>
                  <FuiLabel className="flowstate-eyebrow mb-2 block">
                    Net · This Month
                  </FuiLabel>
                  <FuiMetric className="flowstate-net-value block">
                    {primaryCurrency === "USD" ? "$" : primaryCurrency === "MMK" ? "" : "฿"}
                    {stats.netBalance < 0 ? "-" : ""}
                    {Math.abs(stats.netBalanceMulti[primaryCurrency as keyof typeof stats.netBalanceMulti] ?? stats.netBalanceMulti.THB).toLocaleString(undefined, primaryCurrency === "USD" ? { maximumFractionDigits: 2 } : undefined)}
                    {primaryCurrency === "MMK" ? " Ks" : ""}
                  </FuiMetric>
                  {(() => {
                    const currencies = ["THB", "USD", "MMK"] as const;
                    const secondary = currencies.filter(c => c !== primaryCurrency);
                    const sign = stats.netBalance < 0 ? "-" : "";
                    const formatSec = (c: "THB" | "USD" | "MMK") => {
                      const val = Math.abs(stats.netBalanceMulti[c]);
                      if (c === "THB") return `฿${sign}${val.toLocaleString()}`;
                      if (c === "USD") return `$${sign}${val.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
                      return `${sign}${val.toLocaleString()} Ks`;
                    };
                    return (
                      <p className="flowstate-currency-chips mt-2">
                        <span>{formatSec(secondary[0])}</span><span>{formatSec(secondary[1])}</span>
                      </p>
                    );
                  })()}
                  {stats.incomeThisMonth > 0 && stats.expensesThisMonth > stats.incomeThisMonth && (
                    <div className="flowstate-net-insight">
                      <TrendingDown className="h-4 w-4" aria-hidden="true" />
                      <span>
                        Expenses outpaced income <strong>{Math.max(1, Math.round(stats.expensesThisMonth / stats.incomeThisMonth))}:1</strong>
                        {categoryBreakdown[0]?.category ? ` — ${categoryBreakdown[0].category} drove the deficit.` : "."}
                      </span>
                    </div>
                  )}
                </div>
                <FuiStatus
                  status={netState === "profit" ? "success" : netState === "loss" ? "danger" : "offline"}
                  label={netState === "profit" ? "Positive cash flow" : netState === "loss" ? "Deficit" : "No movement"}
                  className="flowstate-net-status"
                />
              </div>
            </FuiPanel>
          </div>}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-[10px]">
            <StatCard title={`Income · ${currentMonthLabel}`} value={stats.incomeThisMonth} multiValues={stats.incomeMulti} icon={TrendingUp} color="green" percentageChange={stats.incomeChange} previousValue={stats.incomeLastMonth} previousLabel={previousMonthLabel} context={topIncomeSource ? `top: ${topIncomeSource}` : "no income entries"} compact primaryCurrency={primaryCurrency} />
            <StatCard title={`Expenses · ${currentMonthLabel}`} value={stats.expensesThisMonth} multiValues={stats.expenseMulti} icon={TrendingDown} color="red" percentageChange={stats.expenseChange} previousValue={stats.expensesLastMonth} previousLabel={previousMonthLabel} context={categoryBreakdown[0]?.category ? `${categoryBreakdown[0].category}${stats.expenseChange > 0 ? " spike" : " top spend"}` : "no expenses"} increaseIsPositive={false} compact primaryCurrency={primaryCurrency} />
            <StatCard title="Total Balance" value={stats.totalBalance} multiValues={stats.totalBalanceMulti} icon={PiggyBank} color="blue" showTrend={false} context={accounts.length ? `${accounts.length} linked account${accounts.length === 1 ? "" : "s"}` : "no linked accounts yet"} compact primaryCurrency={primaryCurrency} />
            <StatCard title="Subscriptions" value={stats.subscriptionsMonthly} multiValues={stats.subscriptionsMulti} icon={CreditCard} color="purple" showTrend={false} context={`${subscriptions.length} active · monthly`} compact primaryCurrency={primaryCurrency} />
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flowstate-tabs flex-1 flex flex-col min-h-0">
          <div className="flowstate-tabs-bar shrink-0">
            <TabsList className="flowstate-tabs-list w-full justify-start h-auto p-1 overflow-x-auto flex-nowrap scrollbar-hide">
              <TabsTrigger value="overview" className="text-[10px] sm:text-xs whitespace-nowrap rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25 transition-all">Overview</TabsTrigger>
              <TabsTrigger value="transactions" className="text-[10px] sm:text-xs whitespace-nowrap rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25 transition-all">Transactions</TabsTrigger>
              <TabsTrigger value="plan" className="text-[10px] sm:text-xs whitespace-nowrap rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25 transition-all">Plan</TabsTrigger>
              <TabsTrigger value="subscriptions" className="text-[10px] sm:text-xs whitespace-nowrap rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25 transition-all">Subscriptions</TabsTrigger>
              <TabsTrigger value="accounts" className="text-[10px] sm:text-xs whitespace-nowrap rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25 transition-all">Accounts</TabsTrigger>
              <TabsTrigger value="ai-insights" className="text-[10px] sm:text-xs whitespace-nowrap rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25 transition-all">AI Insights</TabsTrigger>
              <TabsTrigger value="history" className="text-[10px] sm:text-xs whitespace-nowrap rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25 transition-all">History</TabsTrigger>
              <TabsTrigger value="manage" className="text-[10px] sm:text-xs whitespace-nowrap rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25 transition-all">Manage</TabsTrigger>
            </TabsList>
          </div>

          <div ref={tabScrollRef} className="flowstate-content flex-1 overflow-y-auto custom-scrollbar">
            <Suspense fallback={<FlowStateModuleFallback />}>
            <TabsContent value="transactions" className="flowstate-transactions-view m-0 space-y-[14px]">
              <div className="flowstate-transaction-tools">
                <label className="flowstate-search">
                  <Search className="h-4 w-4" aria-hidden="true" />
                  <input value={transactionQuery} onChange={(event) => setTransactionQuery(event.target.value)} placeholder="Search transactions…" aria-label="Search transactions" />
                </label>
                <div className="flowstate-filter" role="group" aria-label="Filter transactions">
                  {(["all", "income", "expense"] as const).map((filter) => (
                    <button key={filter} type="button" data-active={transactionFilter === filter} onClick={() => setTransactionFilter(filter)}>
                      {filter[0].toUpperCase() + filter.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flowstate-transaction-summary">
                <div><span>Income</span><CurrencyDisplay amount={stats.incomeThisMonth} currency={primaryCurrency} className="text-emerald-300" /></div>
                <div><span>Expenses</span><CurrencyDisplay amount={stats.expensesThisMonth} currency={primaryCurrency} className="text-rose-400" /></div>
                <div><span>Net</span><CurrencyDisplay amount={stats.netBalance} currency={primaryCurrency} className={stats.netBalance >= 0 ? "text-emerald-300" : "text-rose-400"} /></div>
              </div>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : visibleTransactions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Wallet className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No transactions yet</p>
                  <p className="text-sm">Add your first transaction to get started</p>
                  <Button size="sm" className="mt-4 gap-1.5" onClick={() => setAddTransactionOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Add Transaction
                  </Button>
                </div>
              ) : (
                <VirtualTransactionList
                  transactions={visibleTransactions}
                  scrollParentRef={tabScrollRef}
                  primaryCurrency={primaryCurrency}
                  onDelete={deleteTransaction}
                  onEdit={(t) => setEditingTransaction(t)}
                  isDeleting={isDeletingTransaction}
                />
              )}
            </TabsContent>

            <TabsContent value="subscriptions" className="m-0">
              <FlowStateSubscriptions
                subscriptions={subscriptions}
                monthlyTotal={stats.subscriptionsMonthly}
                isLoading={isLoading}
                primaryCurrency={primaryCurrency}
                onAddSubscription={addSubscription}
                isAddingSubscription={isAddingSubscription}
                onDeleteSubscription={deleteSubscription}
                onUpdateSubscription={updateSubscription}
              />
            </TabsContent>

            <TabsContent value="plan" className="m-0">
              <FlowStatePlan
                userId={userId}
                primaryCurrency={primaryCurrency}
                accounts={accounts}
                categories={categories}
                subscriptions={subscriptions}
              />
            </TabsContent>

            <TabsContent value="accounts" className="m-0">
              <FlowStateAccounts
                accounts={accounts}
                onAddAccount={addAccount}
                onDeleteAccount={deleteAccount}
                onSetDefault={setDefaultAccount}
                isAdding={isAddingAccount}
                isDeleting={isDeletingAccount}
                isSettingDefault={isSettingDefaultAccount}
              />
            </TabsContent>

            <TabsContent value="overview" className="m-0 space-y-[14px]">
              <FlowStateCFO
                userId={userId}
                currency={primaryCurrency}
                rangePreset={flowRangePreset}
                onRangePresetChange={setFlowRangePreset}
                onOpenInBeeBot={openInSitku}
                showIncomeTimeline={visibleWidgets.income}
                showIncomeIntelligence={visibleWidgets.incomeIntel}
              />

              {/* Handoff §5 — Spending by category ‖ Monthly trend (donut pairs with trend). */}
              {(visibleWidgets.spending || visibleWidgets.trend) && <div className={cn("grid grid-cols-1 gap-[14px]", visibleWidgets.spending && visibleWidgets.trend && "md:grid-cols-[1fr_1.25fr]")}>
                {visibleWidgets.spending && <SpendingDonutChart data={categoryBreakdown} currency={primaryCurrency === "MMK" ? "Ks" : primaryCurrency} />}
                {visibleWidgets.trend && <MonthlyTrendChart
                  data={monthlyTrend}
                  isLoading={trendLoading}
                  currency={primaryCurrency === "MMK" ? "Ks" : primaryCurrency}
                />}
              </div>}

              {/* Handoff §6 — Savings goal ‖ subscriptions. */}
              {(visibleWidgets.goal || visibleWidgets.subs) && <div className={cn("grid grid-cols-1 gap-[14px]", visibleWidgets.goal && visibleWidgets.subs && "md:grid-cols-[1.25fr_1fr]")}>
                {visibleWidgets.goal && <FinancialGoalCard userId={userId} currency={primaryCurrency} />}
                {visibleWidgets.subs && <section className="flowstate-glass flowstate-home-card" aria-labelledby="home-subscriptions-title">
                  <div className="flowstate-section-heading">
                    <div>
                      <h3 id="home-subscriptions-title">Subscriptions</h3>
                      <p>{subscriptions.filter((subscription) => subscription.is_active).length} active · monthly commitments</p>
                    </div>
                    <Repeat2 className="h-4 w-4" />
                  </div>
                  <div className="flowstate-home-list">
                    {subscriptions.filter((subscription) => subscription.is_active).slice(0, 3).map((subscription) => (
                      <button key={subscription.id} type="button" className="flowstate-home-row" onClick={() => setActiveTab("subscriptions")}>
                        <span className="flowstate-home-icon" style={{ color: subscription.color || "#c4b5fd", backgroundColor: `${subscription.color || "#c4b5fd"}18` }}>
                          {subscription.icon || <CreditCard className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1 text-left">
                          <strong>{subscription.name}</strong>
                          <small>{subscription.billing_cycle} · next {new Date(`${subscription.next_billing_date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small>
                        </span>
                        <CurrencyDisplay amount={subscription.amount} currency={subscription.currency} size="sm" />
                      </button>
                    ))}
                    {subscriptions.filter((subscription) => subscription.is_active).length === 0 && (
                      <button type="button" className="flowstate-home-empty" onClick={() => setActiveTab("subscriptions")}>No subscriptions yet · add one</button>
                    )}
                  </div>
                </section>}
              </div>}

              {/* Handoff §7 — recent transactions ‖ monthly comparison. */}
              {visibleWidgets.txns && <div className="grid grid-cols-1 md:grid-cols-2 gap-[14px]">
                <section className="flowstate-glass flowstate-home-card flowstate-recent-card" aria-labelledby="recent-transactions-title">
                  <div className="flowstate-section-heading">
                    <h3 id="recent-transactions-title">Recent transactions</h3>
                    <Button variant="ghost" size="sm" className="flowstate-view-all" onClick={() => setActiveTab("transactions")}>View all</Button>
                  </div>
                  <div className="flowstate-home-list">
                    {transactions.slice(0, 3).map((transaction) => (
                      <TransactionRow key={transaction.id} transaction={transaction} primaryCurrency={primaryCurrency} compact onEdit={setEditingTransaction} />
                    ))}
                    {transactions.length === 0 && (
                      <button type="button" className="flowstate-home-empty" onClick={() => setAddTransactionOpen(true)}>No transactions yet · add an entry</button>
                    )}
                  </div>
                </section>
                <HistoryComparisonChart data={comparisonTrend} currency={primaryCurrency} isLoading={trendLoading} variant="home" />
              </div>}

              {/* Handoff §8 — daily cash-flow calendar heatmap (full width). */}
              {visibleWidgets.calendar && <SpendingCalendar userId={userId} primaryCurrency={primaryCurrency} />}
            </TabsContent>

            <TabsContent value="ai-insights" className="m-0">
              <FlowStateAIInsights userId={userId} stats={stats} transactions={transactions} categoryBreakdown={categoryBreakdown} currency={primaryCurrency} />
            </TabsContent>

            <TabsContent value="history" className="m-0">
              <FlowStateHistory userId={userId} currency={primaryCurrency} />
            </TabsContent>

            <TabsContent value="manage" className="m-0">
              <FlowStateManage userId={userId} categories={categories} settings={settings} onRefetch={refetch} />
            </TabsContent>
            </Suspense>
          </div>
        </Tabs>

        {/* Add Transaction Dialog */}
        {addTransactionOpen && (
          <Suspense fallback={null}>
            <AddTransactionDialog
              open
              onOpenChange={setAddTransactionOpen}
              accounts={accounts}
              categories={categories}
              primaryCurrency={primaryCurrency}
              sourceSuggestions={sourceSuggestions}
              onSubmit={handleAddTransaction}
              isSubmitting={isAddingTransaction}
            />
          </Suspense>
        )}

        {/* Edit Transaction Dialog */}
        {editingTransaction && (
          <Suspense fallback={null}>
            <EditTransactionDialog
              open
              onOpenChange={(nextOpen) => !nextOpen && setEditingTransaction(null)}
              transaction={editingTransaction}
              accounts={accounts}
              categories={categories}
              primaryCurrency={primaryCurrency}
              sourceSuggestions={sourceSuggestions}
              onSubmit={(id, data) => updateTransaction(id, data)}
              onDelete={deleteTransaction}
              isSubmitting={isUpdatingTransaction}
              isDeleting={isDeletingTransaction}
            />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}

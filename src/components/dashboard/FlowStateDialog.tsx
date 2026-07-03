import { useState, useMemo, useRef, lazy, Suspense, type CSSProperties } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet, Plus, RefreshCw, TrendingUp, TrendingDown, CreditCard, PiggyBank, Loader2, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { financeStore } from "@/repositories/local/financeStore";
import { useFlowState, useFlowStateMonthlyTrend, useFlowStateDailyTrend, type Transaction } from "@/hooks/useFlowState";
import { StatCard } from "@/components/flowstate/ui/StatCard";
import { SpendingDonutChart } from "@/components/flowstate/ui/SpendingDonutChart";
import { TrendChartSwitcher } from "@/components/flowstate/ui/TrendChartSwitcher";
import { VirtualTransactionList } from "@/components/flowstate/ui/VirtualTransactionList";
import { CurrencyDisplay } from "@/components/flowstate/ui/CurrencyDisplay";
import { SpendingCalendar } from "@/components/flowstate/ui/SpendingCalendar";
import { AddTransactionDialog } from "@/components/flowstate/AddTransactionDialog";
import { EditTransactionDialog } from "@/components/flowstate/EditTransactionDialog";
import { FlowStateAccounts } from "@/components/flowstate/FlowStateAccounts";
import { FlowStateSubscriptions } from "@/components/flowstate/FlowStateSubscriptions";
import { FlowStateAIInsights } from "@/components/flowstate/FlowStateAIInsights";
import { FlowStateCFO } from "@/components/flowstate/FlowStateCFO";
import { useNavigate } from "react-router-dom";
import { FlowStateHistory } from "@/components/flowstate/FlowStateHistory";
import { FlowStateManage } from "@/components/flowstate/FlowStateManage";
import { FinanceRangeSelector } from "@/components/flowstate/intelligence/FinanceRangeSelector";
import { FinancialGoalCard } from "@/components/flowstate/goal/FinancialGoalCard";
import { useFlowStateSourceFlow } from "@/hooks/useFlowStateSourceFlow";
import { consultantRangeForPreset, type ConsultantRangePreset } from "@/hooks/useConsultantData";
import { cn } from "@/lib/utils";

// Recharts (~499KB) — only pulled in when the Overview Source Flow chart renders.
const SourceFlowChart = lazy(() => import("@/components/flowstate/intelligence/SourceFlowChart").then((m) => ({ default: m.SourceFlowChart })));

interface FlowStateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

export function FlowStateDialog({ open, onOpenChange, userId }: FlowStateDialogProps) {
  const [activeTab, setActiveTab] = useState("cfo");
  const navigate = useNavigate();
  const openInSitku = (prompt: string) => {
    try { sessionStorage.setItem("sitku_prefill", prompt); } catch { }
    navigate("/sitku");
    onOpenChange(false);
  };
  const [addTransactionOpen, setAddTransactionOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  // Shared tabs scroller — the virtualized Transactions list scrolls against this.
  const tabScrollRef = useRef<HTMLDivElement>(null);

  // Overview "Source Flow" chart range — independent (Today / Week / Month / 28D / 90D).
  const [flowRangePreset, setFlowRangePreset] = useState<ConsultantRangePreset>("this_week");
  const flowRangeSel = useMemo(() => consultantRangeForPreset(flowRangePreset), [flowRangePreset]);


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

  // Source Flow data for the Overview chart (depends on primaryCurrency + the flow range).
  const { data: sourceFlow } = useFlowStateSourceFlow(userId, flowRangeSel.range, primaryCurrency);

  const flowStateWithPrimary = useFlowState(userId, primaryCurrency);

  const { data: monthlyTrend = [], isLoading: trendLoading } = useFlowStateMonthlyTrend(userId, primaryCurrency);
  const { data: dailyTrend = [], isLoading: dailyLoading } = useFlowStateDailyTrend(userId, primaryCurrency);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!inset-0 !translate-x-0 !translate-y-0 !max-w-[calc(100vw-20px)] !w-[calc(100vw-20px)] !h-[calc(100dvh-20px-env(safe-area-inset-top,0px))] !max-h-[calc(100dvh-20px-env(safe-area-inset-top,0px))] flex flex-col !p-0 !gap-0 !rounded-[16px] border-border/30 overflow-hidden bg-background/95 backdrop-blur-2xl [&>button:last-child]:hidden m-[10px] mt-[max(10px,env(safe-area-inset-top,10px))] pb-[env(safe-area-inset-bottom)]">
        {/* Header */}
        <DialogHeader
          className="px-3 py-2.5 pb-0 shrink-0 border-b border-border/30"
          // Reserve the macOS traffic-light gutter (mac desktop only; 0 elsewhere) so the
          // OS lights don't overlap the wallet icon / title. Drag the window by this bar.
          style={{ paddingLeft: "calc(0.75rem + var(--titlebar-safe))", WebkitAppRegion: "drag" } as CSSProperties}
        >
          <div className="flex items-center justify-between gap-3" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/30 ring-2 ring-primary/20">
                <Wallet className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <DialogTitle className="text-lg sm:text-xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">FlowState</DialogTitle>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Personal Finance Manager</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 hover:border-primary/30 transition-all"
                disabled={isLoading}
                onClick={() => refetch()}
              >
                <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              </Button>
              <Button
                size="sm"
                className="gap-1.5 rounded-xl bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98]"
                onClick={() => setAddTransactionOpen(true)}
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline font-medium">Add</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl border border-border/50 bg-muted/30 hover:bg-destructive/20 hover:border-destructive/30 hover:text-destructive transition-all"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Net Balance Hero */}
          <div className="px-3 py-2 lg:pr-0">
            <div className="h-full rounded-2xl border border-border/30 bg-gradient-to-br from-card via-card/80 to-muted/30 backdrop-blur-xl p-3 relative overflow-hidden group hover:border-primary/20 transition-all duration-300">
              {/* Decorative elements */}
              <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl opacity-50" />

              <div className="flex items-center justify-between relative">
                <div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground font-medium mb-1.5 uppercase tracking-wider">
                    Net This Month
                  </p>
                  <p className={cn(
                    "text-3xl sm:text-4xl font-bold tracking-tight",
                    stats.netBalance >= 0 ? "text-emerald-500" : "text-rose-500"
                  )}>
                    {primaryCurrency === "USD" ? "$" : primaryCurrency === "MMK" ? "" : "฿"}
                    {stats.netBalance < 0 ? "-" : ""}
                    {Math.abs(stats.netBalanceMulti[primaryCurrency as keyof typeof stats.netBalanceMulti] ?? stats.netBalanceMulti.THB).toLocaleString(undefined, primaryCurrency === "USD" ? { maximumFractionDigits: 2 } : undefined)}
                    {primaryCurrency === "MMK" ? " Ks" : ""}
                  </p>
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
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {formatSec(secondary[0])} • {formatSec(secondary[1])}
                      </p>
                    );
                  })()}
                </div>
                <div className={cn(
                  "p-3 sm:p-4 rounded-2xl transition-all duration-300 group-hover:scale-110",
                  stats.netBalance >= 0
                    ? "bg-success/15 ring-2 ring-success/20 shadow-lg shadow-success/10"
                    : "bg-destructive/15 ring-2 ring-destructive/20 shadow-lg shadow-destructive/10"
                )}>
                  {stats.netBalance >= 0
                    ? <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-success" />
                    : <TrendingDown className="h-5 w-5 sm:h-6 sm:w-6 text-destructive" />
                  }
                </div>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-1.5 px-3 lg:pl-0 py-2">
            <StatCard title="Income" value={stats.incomeThisMonth} multiValues={stats.incomeMulti} icon={TrendingUp} color="green" percentageChange={stats.incomeChange} compact primaryCurrency={primaryCurrency} />
            <StatCard title="Expenses" value={stats.expensesThisMonth} multiValues={stats.expenseMulti} icon={TrendingDown} color="red" percentageChange={stats.expenseChange} compact primaryCurrency={primaryCurrency} />
            <StatCard title="Total Balance" value={stats.totalBalance} multiValues={stats.totalBalanceMulti} icon={PiggyBank} color="blue" showTrend={false} compact primaryCurrency={primaryCurrency} />
            <StatCard title="Subscriptions" value={stats.subscriptionsMonthly} multiValues={stats.subscriptionsMulti} icon={CreditCard} color="purple" showTrend={false} compact primaryCurrency={primaryCurrency} />
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 mt-2">
          <div className="px-3 shrink-0">
            <TabsList className="w-full justify-start h-auto p-1 bg-muted/30 border border-border/30 rounded-xl overflow-x-auto flex-nowrap scrollbar-hide backdrop-blur-sm">
              <TabsTrigger value="overview" className="text-[10px] sm:text-xs whitespace-nowrap rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25 transition-all">Overview</TabsTrigger>
              <TabsTrigger value="transactions" className="text-[10px] sm:text-xs whitespace-nowrap rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25 transition-all">Transactions</TabsTrigger>
              <TabsTrigger value="cfo" className="text-[10px] sm:text-xs whitespace-nowrap rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary/70 data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/40 transition-all font-medium">CFO 💼</TabsTrigger>
              <TabsTrigger value="subscriptions" className="text-[10px] sm:text-xs whitespace-nowrap rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25 transition-all">Subscriptions</TabsTrigger>
              <TabsTrigger value="accounts" className="text-[10px] sm:text-xs whitespace-nowrap rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25 transition-all">Accounts</TabsTrigger>
              <TabsTrigger value="ai-insights" className="text-[10px] sm:text-xs whitespace-nowrap rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25 transition-all">AI Insights</TabsTrigger>
              <TabsTrigger value="history" className="text-[10px] sm:text-xs whitespace-nowrap rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25 transition-all">History</TabsTrigger>
              <TabsTrigger value="manage" className="text-[10px] sm:text-xs whitespace-nowrap rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25 transition-all">Manage</TabsTrigger>
            </TabsList>
          </div>

          <div ref={tabScrollRef} className="flex-1 overflow-y-auto px-3 py-2 custom-scrollbar">
            <TabsContent value="overview" className="m-0 space-y-3 sm:space-y-4">
              {/* Financial Goal — headline progress bar (net savings toward a target). */}
              <FinancialGoalCard userId={userId} currency={primaryCurrency} />

              {/* Source Flow — daily income (by source) & expense (by category). */}
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-[11px] text-muted-foreground">Income sources & expense flow over time</div>
                  <FinanceRangeSelector value={flowRangePreset} onChange={setFlowRangePreset} />
                </div>
                <Suspense fallback={<div className="consultant-card h-[360px] flex items-center justify-center text-xs text-muted-foreground gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading flow…</div>}>
                  <SourceFlowChart data={sourceFlow} currency={primaryCurrency === "MMK" ? "Ks" : primaryCurrency} periodLabel={flowRangeSel.label} />
                </Suspense>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                <SpendingDonutChart data={categoryBreakdown} currency={primaryCurrency === "MMK" ? "Ks" : primaryCurrency} />
                <TrendChartSwitcher
                  monthlyData={monthlyTrend}
                  dailyData={dailyTrend}
                  isMonthlyLoading={trendLoading}
                  isDailyLoading={dailyLoading}
                  currency={primaryCurrency === "MMK" ? "Ks" : primaryCurrency}
                />
                <SpendingCalendar userId={userId} primaryCurrency={primaryCurrency} />
              </div>
            </TabsContent>

            <TabsContent value="transactions" className="m-0 space-y-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : transactions.length === 0 ? (
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
                  transactions={transactions}
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

            <TabsContent value="cfo" className="m-0">
              <FlowStateCFO userId={userId} currency={primaryCurrency} onOpenInBeeBot={openInSitku} />
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
          </div>
        </Tabs>

        {/* Add Transaction Dialog */}
        <AddTransactionDialog
          open={addTransactionOpen}
          onOpenChange={setAddTransactionOpen}
          accounts={accounts}
          categories={categories}
          primaryCurrency={primaryCurrency}
          sourceSuggestions={sourceSuggestions}
          onSubmit={handleAddTransaction}
          isSubmitting={isAddingTransaction}
        />

        {/* Edit Transaction Dialog */}
        <EditTransactionDialog
          open={!!editingTransaction}
          onOpenChange={(open) => !open && setEditingTransaction(null)}
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
      </DialogContent>
    </Dialog>
  );
}

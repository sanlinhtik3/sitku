import { useMemo, useState } from "react";
import { addMonths, format, isSameMonth, subMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Loader2,
  Pencil,
  Plus,
  Repeat2,
  Wallet,
} from "@/components/flowstate/solarIcons";
import { PlannedExpenseDialog } from "@/components/flowstate/PlannedExpenseDialog";
import { CurrencyDisplay } from "@/components/flowstate/ui/CurrencyDisplay";
import { useFlowStatePlan } from "@/hooks/useFlowStatePlan";
import type { FinancialAccount, Subscription, TransactionCategory } from "@/hooks/useFlowState";
import { CategoryIcon } from "./CategoryIcon";
import { formatLocalDate } from "@/lib/dateUtils";
import {
  plannedExpenseDisplayStatus,
  plannedExpenseRemaining,
  type PlannedExpense,
} from "@/lib/flowstate/plan";
import { cn } from "@/lib/utils";

interface Props {
  userId: string;
  primaryCurrency: string;
  accounts: FinancialAccount[];
  categories: TransactionCategory[];
  subscriptions: Subscription[];
}

type PlanFilter = "all" | "upcoming" | "paid" | "recurring";

const statusLabels = {
  planned: "Planned",
  partially_paid: "Part paid",
  paid: "Paid",
  skipped: "Skipped",
  overdue: "Overdue",
  due_soon: "Due soon",
} as const;

export function FlowStatePlan({ userId, primaryCurrency, accounts, categories, subscriptions }: Props) {
  const [month, setMonth] = useState(() => new Date());
  const [filter, setFilter] = useState<PlanFilter>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PlannedExpense | null>(null);
  const [paymentItem, setPaymentItem] = useState<PlannedExpense | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(formatLocalDate());
  const [paymentAccountId, setPaymentAccountId] = useState("none");

  const plan = useFlowStatePlan(userId, month, primaryCurrency, accounts);
  const today = formatLocalDate();
  const expenseCategories = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const items = useMemo(() => plan.items.filter((item) => {
    const status = plannedExpenseDisplayStatus(item, today);
    if (filter === "paid") return status === "paid";
    if (filter === "recurring") return item.recurrence !== "none";
    if (filter === "upcoming") return status === "planned" || status === "partially_paid" || status === "due_soon" || status === "overdue";
    return true;
  }), [filter, plan.items, today]);

  const openCreate = () => {
    setEditingItem(null);
    setEditorOpen(true);
  };

  const openEdit = (item: PlannedExpense) => {
    setEditingItem(item);
    setEditorOpen(true);
  };

  const openPayment = (item: PlannedExpense) => {
    setPaymentItem(item);
    setPaymentAmount(String(plannedExpenseRemaining(item)));
    setPaymentDate(formatLocalDate());
    setPaymentAccountId(item.account_id || accounts.find((account) => account.is_default)?.id || accounts[0]?.id || "none");
  };

  const submitPayment = (event: React.FormEvent) => {
    event.preventDefault();
    if (!paymentItem || Number(paymentAmount) <= 0) return;
    plan.recordPayment.mutate({
      id: paymentItem.id,
      amount: Number(paymentAmount),
      paidDate: paymentDate,
      accountId: paymentAccountId === "none" ? null : paymentAccountId,
    }, {
      onSuccess: () => setPaymentItem(null),
    });
  };

  const currentMonth = isSameMonth(month, new Date());

  return (
    <div className="flowstate-plan-view space-y-[14px]">
      <section className="flowstate-glass flowstate-plan-hero">
        <div className="flowstate-plan-heading">
          <div>
            <p className="flowstate-eyebrow">Expense commitments</p>
            <h2>{format(month, "MMMM yyyy")} plan</h2>
            <p>Know what must be paid before the month ends.</p>
          </div>
          <div className="flowstate-plan-heading-actions">
            <div className="flowstate-plan-month-nav" aria-label="Plan month">
              <button type="button" aria-label="Previous month" onClick={() => setMonth((value) => subMonths(value, 1))}><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" onClick={() => setMonth(new Date())} disabled={currentMonth}>{currentMonth ? "This month" : "Go to current"}</button>
              <button type="button" aria-label="Next month" onClick={() => setMonth((value) => addMonths(value, 1))}><ChevronRight className="h-4 w-4" /></button>
            </div>
            <Button size="sm" className="flowstate-add-button gap-2" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add expense
            </Button>
          </div>
        </div>

        <div className="flowstate-plan-summary">
          <article className="flowstate-plan-total">
            <div className="flowstate-plan-total-top">
              <span>Total planned expenses</span>
              <CalendarDays className="h-4 w-4" />
            </div>
            <CurrencyDisplay amount={plan.summary.totalPlanned} currency={primaryCurrency} className="flowstate-plan-total-value" />
            <div className="flowstate-plan-progress" aria-label={`${Math.round(plan.summary.progressPct)}% paid`}>
              <span style={{ width: `${plan.summary.progressPct}%` }} />
            </div>
            <p>{Math.round(plan.summary.progressPct)}% paid · {plan.items.length} commitment{plan.items.length === 1 ? "" : "s"}</p>
          </article>

          <div className="flowstate-plan-kpis">
            <PlanKpi label="Paid" amount={plan.summary.paid} currency={primaryCurrency} icon={CheckCircle2} tone="positive" />
            <PlanKpi label="Remaining" amount={plan.summary.remaining} currency={primaryCurrency} icon={CreditCard} tone="warning" />
            <PlanKpi label="Due this week" value={String(plan.summary.dueThisWeek)} icon={CalendarDays} tone={plan.summary.dueThisWeek ? "warning" : "neutral"} />
            <PlanKpi label="Overdue" value={String(plan.summary.overdue)} icon={AlertTriangle} tone={plan.summary.overdue ? "danger" : "neutral"} />
            <PlanKpi
              label="Projected balance"
              amount={plan.summary.projectedBalance}
              currency={primaryCurrency}
              icon={Wallet}
              tone={plan.summary.projectedBalance < 0 ? "danger" : "positive"}
            />
          </div>
        </div>
      </section>

      <section className="flowstate-glass flowstate-plan-list-card">
        <div className="flowstate-plan-list-header">
          <div>
            <h3>Payment timeline</h3>
            <p>Actual payments create linked transactions and reduce the remaining plan.</p>
          </div>
          <div className="flowstate-filter" role="group" aria-label="Filter planned expenses">
            {(["all", "upcoming", "paid", "recurring"] as PlanFilter[]).map((value) => (
              <button key={value} type="button" data-active={filter === value} onClick={() => setFilter(value)}>
                {value[0].toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {plan.isLoading ? (
          <div className="flowstate-plan-empty"><Loader2 className="h-5 w-5 animate-spin" /> Loading plan…</div>
        ) : items.length === 0 ? (
          <button type="button" className="flowstate-plan-empty" onClick={openCreate}>
            <CalendarDays className="h-8 w-8" />
            <strong>{filter === "all" ? "No planned expenses yet" : `No ${filter} commitments`}</strong>
            <span>Add rent, salary, bills, subscriptions, or any payment due this month.</span>
          </button>
        ) : (
          <div className="flowstate-plan-list">
            {items.map((item) => {
              const status = plannedExpenseDisplayStatus(item, today);
              const category = item.category_id ? expenseCategories.get(item.category_id) : null;
              const remaining = plannedExpenseRemaining(item);
              return (
                <article key={item.id} className="flowstate-plan-row" data-status={status}>
                  <div className="flowstate-plan-date">
                    <span>{format(new Date(`${item.due_date}T00:00:00`), "MMM")}</span>
                    <strong>{format(new Date(`${item.due_date}T00:00:00`), "dd")}</strong>
                  </div>
                  <div className="flowstate-plan-row-main">
                    <div className="flowstate-plan-row-title">
                      {category && (
                        <CategoryIcon
                          icon={category.icon}
                          color={category.color}
                          containerClassName="h-6 w-6 shrink-0 rounded-[var(--radius)]"
                          style={{ backgroundColor: `${category.color}18` }}
                        />
                      )}
                      <strong>{item.title}</strong>
                      {item.priority === "high" && <AlertTriangle className="h-3.5 w-3.5 text-amber-300" aria-label="High priority" />}
                      {item.recurrence !== "none" && <Repeat2 className="h-3.5 w-3.5" aria-label={`${item.recurrence} recurring`} />}
                    </div>
                    <p>
                      {category?.name || "Uncategorized"}
                      {item.recurrence !== "none" ? ` · ${item.recurrence}` : ""}
                      {item.paid_amount > 0 && remaining > 0 ? ` · ${item.paid_amount.toLocaleString()} paid` : ""}
                    </p>
                  </div>
                  <span className="flowstate-plan-status" data-status={status}>{statusLabels[status]}</span>
                  <div className="flowstate-plan-row-amount">
                    <CurrencyDisplay amount={item.amount} currency={item.currency} size="sm" />
                    {remaining > 0 && remaining !== item.amount && <small>{remaining.toLocaleString()} left</small>}
                  </div>
                  <div className="flowstate-plan-row-actions">
                    {status !== "paid" && status !== "skipped" && (
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openPayment(item)}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Record payment
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" aria-label={`Edit ${item.title}`} onClick={() => openEdit(item)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <PlannedExpenseDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        item={editingItem}
        month={month}
        accounts={accounts}
        categories={categories}
        subscriptions={subscriptions}
        primaryCurrency={primaryCurrency}
        isSaving={plan.add.isPending || plan.update.isPending}
        onSave={(input) => {
          if (editingItem) {
            plan.update.mutate({ id: editingItem.id, updates: input }, { onSuccess: () => setEditorOpen(false) });
          } else {
            plan.add.mutate(input, { onSuccess: () => setEditorOpen(false) });
          }
        }}
        onDelete={(id) => plan.remove.mutate(id)}
      />

      <Dialog open={!!paymentItem} onOpenChange={(open) => !open && setPaymentItem(null)}>
        <DialogContent className="flowstate-entry-dialog flowstate-plan-payment-dialog max-w-sm">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
          </DialogHeader>
          {paymentItem && (
            <form className="space-y-4" onSubmit={submitPayment}>
              <div className="flowstate-plan-payment-summary">
                <span>{paymentItem.title}</span>
                <CurrencyDisplay amount={plannedExpenseRemaining(paymentItem)} currency={paymentItem.currency} />
                <small>remaining</small>
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-payment-amount">Amount paid</Label>
                <Input id="plan-payment-amount" type="number" inputMode="decimal" min="0.01" max={plannedExpenseRemaining(paymentItem)} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-payment-date">Payment date</Label>
                <Input id="plan-payment-date" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Payment account</Label>
                <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                  <SelectTrigger><SelectValue placeholder="No linked account" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No linked account</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>{account.account_name} · {account.currency}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="flowstate-plan-payment-note">
                This creates one expense transaction and links it to the plan. It will not be counted twice.
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setPaymentItem(null)}>Cancel</Button>
                <Button type="submit" disabled={plan.recordPayment.isPending || Number(paymentAmount) <= 0} className="gap-2">
                  {plan.recordPayment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Confirm payment
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlanKpi({
  label,
  amount,
  value,
  currency,
  icon: Icon,
  tone,
}: {
  label: string;
  amount?: number;
  value?: string;
  currency?: string;
  icon: typeof Wallet;
  tone: "positive" | "warning" | "danger" | "neutral";
}) {
  return (
    <article className={cn("flowstate-plan-kpi", `is-${tone}`)}>
      <div><span>{label}</span><Icon className="h-4 w-4" /></div>
      {amount !== undefined && currency
        ? <CurrencyDisplay amount={amount} currency={currency} />
        : <strong>{value}</strong>}
    </article>
  );
}

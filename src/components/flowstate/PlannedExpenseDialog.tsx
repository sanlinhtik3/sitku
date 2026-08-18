import { useEffect, useMemo, useState } from "react";
import { endOfMonth, format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle,
  CalendarIcon,
  CreditCard,
  Loader2,
  Repeat2,
  Trash2,
} from "@/components/flowstate/solarIcons";
import type { FinancialAccount, Subscription, TransactionCategory } from "@/hooks/useFlowState";
import { CategoryPicker } from "./CategoryPicker";
import type {
  PlannedExpense,
  PlannedExpensePriority,
  PlannedExpenseRecurrence,
} from "@/lib/flowstate/plan";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: PlannedExpense | null;
  month: Date;
  accounts: FinancialAccount[];
  categories: TransactionCategory[];
  subscriptions: Subscription[];
  primaryCurrency: string;
  isSaving: boolean;
  onSave: (input: Partial<PlannedExpense>) => void;
  onDelete?: (id: string) => void;
}

export function PlannedExpenseDialog({
  open,
  onOpenChange,
  item,
  month,
  accounts,
  categories,
  subscriptions,
  primaryCurrency,
  isSaving,
  onSave,
  onDelete,
}: Props) {
  const expenseCategories = useMemo(
    () => categories.filter((category) => category.type === "expense"),
    [categories],
  );
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(primaryCurrency);
  const [dueDate, setDueDate] = useState(format(endOfMonth(month), "yyyy-MM-dd"));
  const [categoryId, setCategoryId] = useState("none");
  const [accountId, setAccountId] = useState("none");
  const [subscriptionId, setSubscriptionId] = useState("none");
  const [recurrence, setRecurrence] = useState<PlannedExpenseRecurrence>("none");
  const [priority, setPriority] = useState<PlannedExpensePriority>("normal");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(item?.title || "");
    setAmount(item ? String(item.amount) : "");
    setCurrency(item?.currency || primaryCurrency);
    setDueDate(item?.due_date || format(endOfMonth(month), "yyyy-MM-dd"));
    setCategoryId(item?.category_id || expenseCategories[0]?.id || "none");
    setAccountId(item?.account_id || accounts.find((account) => account.is_default)?.id || accounts[0]?.id || "none");
    setSubscriptionId(item?.subscription_id || "none");
    setRecurrence(item?.recurrence || "none");
    setPriority(item?.priority || "normal");
    setNotes(item?.notes || "");
  }, [accounts, expenseCategories, item, month, open, primaryCurrency]);

  const handleSubscription = (value: string) => {
    setSubscriptionId(value);
    if (value === "none") return;
    const subscription = subscriptions.find((candidate) => candidate.id === value);
    if (!subscription) return;
    setTitle(subscription.name);
    setAmount(String(subscription.amount));
    setCurrency(subscription.currency);
    setDueDate(subscription.next_billing_date.slice(0, 10));
    setCategoryId(subscription.category_id || categoryId);
    setAccountId(subscription.account_id || accountId);
    setRecurrence(
      subscription.billing_cycle === "weekly" ||
      subscription.billing_cycle === "yearly" ||
      subscription.billing_cycle === "monthly"
        ? subscription.billing_cycle
        : "monthly",
    );
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!title.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || !dueDate) return;
    onSave({
      title: title.trim(),
      amount: parsedAmount,
      currency,
      due_date: dueDate,
      category_id: categoryId === "none" ? null : categoryId,
      account_id: accountId === "none" ? null : accountId,
      subscription_id: subscriptionId === "none" ? null : subscriptionId,
      recurrence,
      priority,
      notes: notes.trim() || null,
    });
  };

  const handleDelete = () => {
    if (!item || !onDelete) return;
    if (!window.confirm(`Delete "${item.title}" from this plan? Recorded transactions will stay unchanged.`)) return;
    onDelete(item.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flowstate-entry-dialog flowstate-plan-dialog max-w-lg">
        <DialogHeader className="flowstate-entry-header">
          <DialogTitle className="flowstate-entry-title flex items-center gap-2">
            <span className="flowstate-entry-title-icon bg-amber-400/12 text-amber-300">
              <CalendarIcon className="h-5 w-5" />
            </span>
            {item ? "Edit planned expense" : "Add planned expense"}
          </DialogTitle>
        </DialogHeader>

        <form className="flowstate-entry-form space-y-4" onSubmit={handleSubmit}>
          {subscriptions.length > 0 && (
            <div className="space-y-2">
              <Label>Start from a subscription</Label>
              <Select value={subscriptionId} onValueChange={handleSubscription}>
                <SelectTrigger className="h-11 bg-muted/30 border-border/50">
                  <SelectValue placeholder="Choose a recurring commitment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No linked subscription</SelectItem>
                  {subscriptions.map((subscription) => (
                    <SelectItem key={subscription.id} value={subscription.id}>
                      {subscription.name} · {subscription.amount.toLocaleString()} {subscription.currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
            <div className="space-y-2">
              <Label htmlFor="plan-title">Expense name</Label>
              <Input id="plan-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Office rent" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-due-date">Due date</Label>
              <Input id="plan-due-date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-[110px_1fr] gap-3">
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="THB">฿ THB</SelectItem>
                  <SelectItem value="USD">$ USD</SelectItem>
                  <SelectItem value="MMK">Ks MMK</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-amount">Planned amount</Label>
              <Input id="plan-amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <CategoryPicker
                categories={expenseCategories}
                value={categoryId}
                onValueChange={setCategoryId}
                type="expense"
                allowEmpty
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label>Payment account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Choose account" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Choose when paid</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>{account.account_name} · {account.currency}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Repeat2 className="h-3.5 w-3.5" /> Repeat</Label>
              <Select value={recurrence} onValueChange={(value) => setRecurrence(value as PlannedExpenseRecurrence)}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">One time</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Priority</Label>
              <Select value={priority} onValueChange={(value) => setPriority(value as PlannedExpensePriority)}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-notes">Notes</Label>
            <Textarea id="plan-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional details" className="min-h-20 resize-none" />
          </div>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-between">
            <div>
              {item && onDelete && (
                <Button type="button" variant="ghost" className="gap-2 text-rose-400 hover:text-rose-300" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2 sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSaving || !title.trim() || Number(amount) <= 0} className="gap-2">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                {item ? "Save changes" : "Add to plan"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

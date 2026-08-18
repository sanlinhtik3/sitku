import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { toast } from "sonner";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import type { FinancialAccount } from "@/hooks/useFlowState";
import { formatLocalDate } from "@/lib/dateUtils";
import {
  computePlannedExpenseSummary,
  type PlannedExpense,
} from "@/lib/flowstate/plan";
import { financeStore } from "@/repositories/local/financeStore";

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useFlowStatePlan(
  userId: string | undefined,
  month: Date,
  primaryCurrency: string,
  accounts: FinancialAccount[],
) {
  const queryClient = useQueryClient();
  const { convert } = useExchangeRates("USD");
  const monthKey = format(month, "yyyy-MM");
  const fromDate = format(startOfMonth(month), "yyyy-MM-dd");
  const toDate = format(endOfMonth(month), "yyyy-MM-dd");

  const query = useQuery({
    queryKey: ["flowstate-plan", userId, monthKey],
    queryFn: () => userId ? financeStore.listPlannedExpenses(userId, fromDate, toDate) : [],
    enabled: !!userId,
  });

  const convertToPrimary = useMemo(
    () => (amount: number, currency: string) =>
      currency === primaryCurrency ? amount : convert(amount, currency, primaryCurrency),
    [convert, primaryCurrency],
  );

  const currentBalance = useMemo(
    () => accounts.reduce(
      (sum, account) => sum + convertToPrimary(Number(account.current_balance) || 0, account.currency || primaryCurrency),
      0,
    ),
    [accounts, convertToPrimary, primaryCurrency],
  );

  const summary = useMemo(
    () => computePlannedExpenseSummary(query.data || [], convertToPrimary, currentBalance, formatLocalDate()),
    [convertToPrimary, currentBalance, query.data],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["flowstate-plan", userId] });
    queryClient.invalidateQueries({ queryKey: ["flowstate-transactions", userId] });
    queryClient.invalidateQueries({ queryKey: ["flowstate-accounts", userId] });
    queryClient.invalidateQueries({ queryKey: ["flowstate-monthly-trend", userId] });
    queryClient.invalidateQueries({ queryKey: ["spending-calendar", userId] });
  };

  const add = useMutation({
    mutationFn: (input: Partial<PlannedExpense>) => {
      if (!userId) throw new Error("User not available");
      return financeStore.addPlannedExpense(userId, input);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Planned expense added");
    },
    onError: (error) => toast.error(message(error, "Could not add planned expense")),
  });

  const update = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<PlannedExpense> }) =>
      financeStore.updatePlannedExpense(id, updates),
    onSuccess: () => {
      invalidate();
      toast.success("Plan updated");
    },
    onError: (error) => toast.error(message(error, "Could not update plan")),
  });

  const remove = useMutation({
    mutationFn: (id: string) => financeStore.deletePlannedExpense(id),
    onSuccess: () => {
      invalidate();
      toast.success("Planned expense deleted");
    },
    onError: (error) => toast.error(message(error, "Could not delete planned expense")),
  });

  const recordPayment = useMutation({
    mutationFn: ({ id, amount, paidDate, accountId, notes }: {
      id: string;
      amount: number;
      paidDate: string;
      accountId?: string | null;
      notes?: string | null;
    }) => {
      if (!userId) throw new Error("User not available");
      return financeStore.recordPlannedExpensePayment(id, userId, {
        amount,
        paid_date: paidDate,
        account_id: accountId,
        notes,
      });
    },
    onSuccess: ({ nextOccurrence }) => {
      invalidate();
      toast.success(nextOccurrence ? "Payment recorded · next payment planned" : "Payment recorded");
    },
    onError: (error) => toast.error(message(error, "Could not record payment")),
  });

  return {
    items: query.data || [],
    summary,
    isLoading: query.isLoading,
    add,
    update,
    remove,
    recordPayment,
  };
}

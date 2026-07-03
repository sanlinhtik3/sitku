// FlowState hook - Personal Finance Management
import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { financeStore } from "@/repositories/local/financeStore";
import { toast } from "sonner";
import { startOfMonth, endOfMonth, format, subMonths } from "date-fns";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { formatLocalDate } from "@/lib/dateUtils";

// Types
export interface FinancialAccount {
  id: string;
  user_id: string;
  account_name: string;
  account_type: string;
  currency: string;
  current_balance: number;
  icon: string;
  color: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TransactionCategory {
  id: string;
  user_id: string | null;
  name: string;
  name_my: string | null;
  icon: string;
  color: string;
  type: "income" | "expense";
  is_system: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  type: "income" | "expense" | "transfer";
  amount: number;
  currency: string;
  description: string | null;
  notes: string | null;
  transaction_date: string;
  is_recurring: boolean;
  recurring_id: string | null;
  tags: string[] | null;
  attachment_url: string | null;
  // Income sub-source ("Client A", "YouTube", …) — level 2 under the income category.
  // Optional, free-text. Empty/undefined → "Unattributed" in income-intelligence views.
  source?: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  category?: TransactionCategory;
  account?: FinancialAccount;
}

export interface Subscription {
  id: string;
  user_id: string;
  account_id: string | null;
  category_id: string | null;
  name: string;
  amount: number;
  currency: string;
  billing_cycle: string;
  next_billing_date: string;
  icon: string;
  color: string | null;
  is_active: boolean;
  reminder_enabled: boolean;
  reminder_days_before: number;
  created_at: string;
  updated_at: string;
}

// A single active "save toward a target" goal. Progress = net savings
// (income − expense) accrued in [start_date, today], segmented by income source.
export interface FinancialGoal {
  id: string;
  title: string;
  target_amount: number;
  currency: string;
  start_date: string;   // yyyy-mm-dd (today when created)
  end_date: string;     // yyyy-mm-dd deadline
  created_at: string;
}

export interface FlowStateSettings {
  id: string;
  user_id: string;
  primary_currency: string;
  display_currencies: string[];
  monthly_budget: number | null;
  show_balance_on_dashboard: boolean;
  goal?: FinancialGoal | null;
  created_at: string;
  updated_at: string;
}

export interface MultiCurrencyValue {
  THB: number;
  USD: number;
  MMK: number;
}

export interface FlowStateStats {
  incomeThisMonth: number;
  expensesThisMonth: number;
  netBalance: number;
  totalBalance: number;
  subscriptionsMonthly: number;
  incomeLastMonth: number;
  expensesLastMonth: number;
  incomeChange: number;
  expenseChange: number;
  // Multi-currency values
  netBalanceMulti: MultiCurrencyValue;
  incomeMulti: MultiCurrencyValue;
  expenseMulti: MultiCurrencyValue;
  totalBalanceMulti: MultiCurrencyValue;
  subscriptionsMulti: MultiCurrencyValue;
}

export interface CategoryBreakdown {
  category: string;
  categoryMy: string | null;
  icon: string;
  color: string;
  amount: number;
  percentage: number;
}

export interface MonthlyTrend {
  month: string;
  income: number;
  expense: number;
}

// Main hook
export function useFlowState(userId: string | undefined, primaryCurrency: string = "THB") {
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  // Use live exchange rates for accurate conversion
  const { convert } = useExchangeRates("USD");

  const monthStart = useMemo(() => startOfMonth(selectedMonth), [selectedMonth]);
  const monthEnd = useMemo(() => endOfMonth(selectedMonth), [selectedMonth]);
  const lastMonthStart = useMemo(() => startOfMonth(subMonths(selectedMonth, 1)), [selectedMonth]);
  const lastMonthEnd = useMemo(() => endOfMonth(subMonths(selectedMonth, 1)), [selectedMonth]);

  // Fetch accounts
  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["flowstate-accounts", userId],
    queryFn: async () => {
      if (!userId) return [];
      return financeStore.listAccounts(userId);
    },
    enabled: !!userId,
  });

  // Fetch categories
  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ["flowstate-categories", userId],
    queryFn: async () => {
      if (!userId) return [];
      return financeStore.listCategories(userId);
    },
    enabled: !!userId,
  });

  // Fetch transactions for current month
  const { data: transactions = [], isLoading: transactionsLoading } = useQuery({
    queryKey: ["flowstate-transactions", userId, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      if (!userId) return [];
      return financeStore.listTransactions(userId, format(monthStart, "yyyy-MM-dd"), format(monthEnd, "yyyy-MM-dd"));
    },
    enabled: !!userId,
  });

  // [REMOVED] All-time transactions query - dead code after UI simplification

  // Fetch last month transactions for comparison (include currency for conversion)
  const { data: lastMonthTransactions = [] } = useQuery({
    queryKey: ["flowstate-transactions-last", userId, format(lastMonthStart, "yyyy-MM")],
    queryFn: async () => {
      if (!userId) return [];
      const rows = await financeStore.listTransactions(userId, format(lastMonthStart, "yyyy-MM-dd"), format(lastMonthEnd, "yyyy-MM-dd"));
      return rows.map((t) => ({ type: t.type, amount: t.amount, currency: t.currency }));
    },
    enabled: !!userId,
  });

  // Fetch subscriptions
  const { data: subscriptions = [], isLoading: subscriptionsLoading } = useQuery({
    queryKey: ["flowstate-subscriptions", userId],
    queryFn: async () => {
      if (!userId) return [];
      return financeStore.listSubscriptions(userId);
    },
    enabled: !!userId,
  });

  // Fetch settings
  const { data: settings } = useQuery({
    queryKey: ["flowstate-settings", userId],
    queryFn: async () => {
      if (!userId) return null;
      return financeStore.getSettings(userId);
    },
    enabled: !!userId,
  });

  // Calculate stats with PROPER currency conversion using live rates
  const stats: FlowStateStats = useMemo(() => {
    // Helper: Convert any amount to primary currency using live rates
    const convertToPrimary = (amount: number, fromCurrency: string): number => {
      if (fromCurrency === primaryCurrency) return amount;
      return convert(amount, fromCurrency, primaryCurrency);
    };

    // Helper: Convert from primary to other currencies
    const convertToMultiCurrency = (amountInPrimary: number): MultiCurrencyValue => {
      return {
        THB: primaryCurrency === "THB" ? amountInPrimary : convert(amountInPrimary, primaryCurrency, "THB"),
        USD: primaryCurrency === "USD" ? amountInPrimary : convert(amountInPrimary, primaryCurrency, "USD"),
        MMK: primaryCurrency === "MMK" ? amountInPrimary : convert(amountInPrimary, primaryCurrency, "MMK"),
      };
    };

    // Convert each transaction to primary currency BEFORE summing
    const incomeThisMonth = transactions
      .filter(t => t.type === "income")
      .reduce((sum, t) => {
        const txCurrency = t.currency || "USD";
        const amountInPrimary = convertToPrimary(Number(t.amount), txCurrency);
        return sum + amountInPrimary;
      }, 0);

    const expensesThisMonth = transactions
      .filter(t => t.type === "expense")
      .reduce((sum, t) => {
        const txCurrency = t.currency || "USD";
        const amountInPrimary = convertToPrimary(Number(t.amount), txCurrency);
        return sum + amountInPrimary;
      }, 0);

    // Convert last month transactions with proper currency handling
    const incomeLastMonth = lastMonthTransactions
      .filter(t => t.type === "income")
      .reduce((sum, t) => {
        const txCurrency = t.currency || "USD";
        const amountInPrimary = convertToPrimary(Number(t.amount), txCurrency);
        return sum + amountInPrimary;
      }, 0);

    const expensesLastMonth = lastMonthTransactions
      .filter(t => t.type === "expense")
      .reduce((sum, t) => {
        const txCurrency = t.currency || "USD";
        const amountInPrimary = convertToPrimary(Number(t.amount), txCurrency);
        return sum + amountInPrimary;
      }, 0);

    const netBalance = incomeThisMonth - expensesThisMonth;
    
    // Convert account balances to primary currency
    const totalBalance = accounts.reduce((sum, a) => {
      const accCurrency = a.currency || "USD";
      const balanceInPrimary = convertToPrimary(Number(a.current_balance), accCurrency);
      return sum + balanceInPrimary;
    }, 0);

    // Convert subscriptions to primary currency (including weekly)
    const subscriptionsMonthly = subscriptions.reduce((sum, s) => {
      const subCurrency = s.currency || "USD";
      const amountInPrimary = convertToPrimary(Number(s.amount), subCurrency);
      if (s.billing_cycle === "monthly") return sum + amountInPrimary;
      if (s.billing_cycle === "yearly") return sum + amountInPrimary / 12;
      if (s.billing_cycle === "weekly") return sum + amountInPrimary * 4.33;
      return sum + amountInPrimary; // default treat as monthly
    }, 0);

    // Fix: Handle 0 → nonzero transition (show 100% instead of 0%)
    const incomeChange = incomeLastMonth > 0 
      ? ((incomeThisMonth - incomeLastMonth) / incomeLastMonth) * 100 
      : incomeThisMonth > 0 ? 100 : 0;

    const expenseChange = expensesLastMonth > 0 
      ? ((expensesThisMonth - expensesLastMonth) / expensesLastMonth) * 100 
      : expensesThisMonth > 0 ? 100 : 0;

    return {
      incomeThisMonth,
      expensesThisMonth,
      netBalance,
      totalBalance,
      subscriptionsMonthly,
      incomeLastMonth,
      expensesLastMonth,
      incomeChange,
      expenseChange,
      // Multi-currency values (derived from primary currency totals)
      netBalanceMulti: convertToMultiCurrency(netBalance),
      incomeMulti: convertToMultiCurrency(incomeThisMonth),
      expenseMulti: convertToMultiCurrency(expensesThisMonth),
      totalBalanceMulti: convertToMultiCurrency(totalBalance),
      subscriptionsMulti: convertToMultiCurrency(subscriptionsMonthly),
    };
  }, [transactions, lastMonthTransactions, accounts, subscriptions, primaryCurrency, convert]);

  // [REMOVED] All-time stats - dead code after UI simplification

  // Category breakdown for expenses (this month) - with proper currency conversion
  const categoryBreakdown: CategoryBreakdown[] = useMemo(() => {
    const convertToPrimary = (amount: number, fromCurrency: string): number => {
      if (fromCurrency === primaryCurrency) return amount;
      return convert(amount, fromCurrency, primaryCurrency);
    };

    const expenseTransactions = transactions.filter(t => t.type === "expense");
    
    const breakdown = expenseTransactions.reduce((acc, t) => {
      const categoryId = t.category_id || "uncategorized";
      if (!acc[categoryId]) {
        acc[categoryId] = {
          category: t.category?.name || "Uncategorized",
          categoryMy: t.category?.name_my || null,
          icon: t.category?.icon || "MoreHorizontal",
          color: t.category?.color || "#6B7280",
          amount: 0,
          percentage: 0,
        };
      }
      // Fix Bug 1: Convert to primary currency before summing
      const txCurrency = t.currency || "USD";
      acc[categoryId].amount += convertToPrimary(Number(t.amount), txCurrency);
      return acc;
    }, {} as Record<string, CategoryBreakdown>);

    const totalExpenses = Object.values(breakdown).reduce((sum, item) => sum + item.amount, 0);

    return Object.values(breakdown)
      .map(item => ({
        ...item,
        percentage: totalExpenses > 0 ? (item.amount / totalExpenses) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [transactions, primaryCurrency, convert]);

  // Add transaction mutation
  const addTransactionMutation = useMutation({
    mutationFn: async (newTransaction: Partial<Transaction>) => {
      if (!userId) throw new Error("User not authenticated");
      // financeStore.addTransaction also adjusts the linked account's balance.
      return financeStore.addTransaction(userId, {
        ...newTransaction,
        currency: newTransaction.currency || "MMK",
        transaction_date: newTransaction.transaction_date || formatLocalDate(),
        is_recurring: newTransaction.is_recurring || false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flowstate-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["flowstate-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["flowstate-income-intel"] });
      queryClient.invalidateQueries({ queryKey: ["flowstate-source-flow"] });      queryClient.invalidateQueries({ queryKey: ["flowstate-goal"] });
      queryClient.invalidateQueries({ queryKey: ["spending-calendar"] });
      toast.success("Transaction added successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to add transaction");
    },
  });

  // Add account mutation
  const addAccountMutation = useMutation({
    mutationFn: async (newAccount: Partial<FinancialAccount>) => {
      if (!userId) throw new Error("User not authenticated");
      return financeStore.addAccount(userId, newAccount);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flowstate-accounts"] });
      toast.success("Account added successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to add account");
    },
  });

  // Delete transaction mutation
  const deleteTransactionMutation = useMutation({
    mutationFn: async (transactionId: string) => {
      // financeStore.deleteTransaction reverts the linked account's balance.
      await financeStore.deleteTransaction(transactionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flowstate-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["flowstate-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["flowstate-income-intel"] });
      queryClient.invalidateQueries({ queryKey: ["flowstate-source-flow"] });      queryClient.invalidateQueries({ queryKey: ["flowstate-goal"] });
      queryClient.invalidateQueries({ queryKey: ["spending-calendar"] });
      toast.success("Transaction deleted");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete transaction");
    },
  });

  // Delete account mutation
  const deleteAccountMutation = useMutation({
    mutationFn: async (accountId: string) => {
      await financeStore.deleteAccount(accountId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flowstate-accounts"] });
      toast.success("Account deleted");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete account");
    },
  });

  // Set default account mutation
  const setDefaultAccountMutation = useMutation({
    mutationFn: async (accountId: string) => {
      if (!userId) throw new Error("User not authenticated");
      await financeStore.setDefaultAccount(userId, accountId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flowstate-accounts"] });
      toast.success("Default account updated");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to set default account");
    },
  });

  // Add subscription mutation
  const addSubscriptionMutation = useMutation({
    mutationFn: async (newSub: Partial<Subscription>) => {
      if (!userId) throw new Error("User not authenticated");
      return financeStore.addSubscription(userId, {
        ...newSub,
        currency: newSub.currency || primaryCurrency,
        next_billing_date: newSub.next_billing_date || formatLocalDate(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flowstate-subscriptions"] });
      toast.success("Subscription added");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to add subscription");
    },
  });

  // Update subscription mutation
  const updateSubscriptionMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Subscription> }) => {
      await financeStore.updateSubscription(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flowstate-subscriptions"] });
      toast.success("Subscription updated");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update subscription");
    },
  });

  // Delete subscription mutation
  const deleteSubscriptionMutation = useMutation({
    mutationFn: async (subId: string) => {
      await financeStore.deleteSubscription(subId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flowstate-subscriptions"] });
      toast.success("Subscription deleted");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete subscription");
    },
  });

  // Update transaction mutation
  const updateTransactionMutation = useMutation({
    mutationFn: async ({ 
      id, 
      updates, 
      oldTransaction 
    }: { 
      id: string; 
      updates: Partial<Transaction>; 
      oldTransaction: Transaction;
    }) => {
      // financeStore.updateTransaction recomputes + reapplies the balance delta
      // (handles same-account net change and account-change moves).
      void oldTransaction;
      await financeStore.updateTransaction(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flowstate-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["flowstate-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["flowstate-income-intel"] });
      queryClient.invalidateQueries({ queryKey: ["flowstate-source-flow"] });      queryClient.invalidateQueries({ queryKey: ["flowstate-goal"] });
      queryClient.invalidateQueries({ queryKey: ["spending-calendar"] });
      toast.success("Transaction updated");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update transaction");
    },
  });

  // Refetch all data
  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["flowstate-accounts", userId] });
    queryClient.invalidateQueries({ queryKey: ["flowstate-categories", userId] });
    queryClient.invalidateQueries({ queryKey: ["flowstate-transactions", userId] });
    queryClient.invalidateQueries({ queryKey: ["flowstate-subscriptions", userId] });
    queryClient.invalidateQueries({ queryKey: ["flowstate-settings", userId] });
  }, [queryClient, userId]);

  const isLoading = accountsLoading || categoriesLoading || transactionsLoading || subscriptionsLoading;

  return {
    // Data
    accounts,
    categories,
    transactions,
    subscriptions,
    settings,
    stats,
    categoryBreakdown,
    
    // State
    selectedMonth,
    setSelectedMonth,
    isLoading,
    
    // Mutations
    addTransaction: addTransactionMutation.mutate,
    addTransactionAsync: addTransactionMutation.mutateAsync,
    isAddingTransaction: addTransactionMutation.isPending,
    
    addAccount: addAccountMutation.mutate,
    addAccountAsync: addAccountMutation.mutateAsync,
    isAddingAccount: addAccountMutation.isPending,
    
    deleteTransaction: deleteTransactionMutation.mutate,
    isDeletingTransaction: deleteTransactionMutation.isPending,
    
    deleteAccount: deleteAccountMutation.mutate,
    isDeletingAccount: deleteAccountMutation.isPending,

    setDefaultAccount: setDefaultAccountMutation.mutate,
    isSettingDefaultAccount: setDefaultAccountMutation.isPending,

    updateTransaction: (id: string, updates: Partial<Transaction>) => {
      const oldTransaction = transactions.find(t => t.id === id);
      if (oldTransaction) {
        updateTransactionMutation.mutate({ id, updates, oldTransaction });
      }
    },
    isUpdatingTransaction: updateTransactionMutation.isPending,

    addSubscription: addSubscriptionMutation.mutate,
    isAddingSubscription: addSubscriptionMutation.isPending,
    deleteSubscription: deleteSubscriptionMutation.mutate,
    isDeletingSubscription: deleteSubscriptionMutation.isPending,
    updateSubscription: (id: string, updates: Partial<Subscription>) => {
      updateSubscriptionMutation.mutate({ id, updates });
    },
    isUpdatingSubscription: updateSubscriptionMutation.isPending,
    
    // Helpers
    refetch,
    incomeCategories: categories.filter(c => c.type === "income"),
    expenseCategories: categories.filter(c => c.type === "expense"),
    defaultAccount: accounts.find(a => a.is_default) || accounts[0],
  };
}

// Hook for monthly trend data (last 6 months) with currency conversion
export function useFlowStateMonthlyTrend(userId: string | undefined, primaryCurrency: string = "THB") {
  const { convert } = useExchangeRates("USD");
  
  return useQuery({
    queryKey: ["flowstate-monthly-trend", userId, primaryCurrency],
    queryFn: async () => {
      if (!userId) return [];
      
      const months: MonthlyTrend[] = [];
      const today = new Date();
      
      for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(today, i);
        const start = startOfMonth(monthDate);
        const end = endOfMonth(monthDate);
        
        const data = await financeStore.listTransactions(userId, format(start, "yyyy-MM-dd"), format(end, "yyyy-MM-dd"));

        // Convert each transaction to primary currency before summing
        const income = data.filter(t => t.type === "income")
          .reduce((sum, t) => {
            const txCurrency = t.currency || "USD";
            const amountInPrimary = txCurrency === primaryCurrency 
              ? Number(t.amount) 
              : convert(Number(t.amount), txCurrency, primaryCurrency);
            return sum + amountInPrimary;
          }, 0);
        
        const expense = data.filter(t => t.type === "expense")
          .reduce((sum, t) => {
            const txCurrency = t.currency || "USD";
            const amountInPrimary = txCurrency === primaryCurrency 
              ? Number(t.amount) 
              : convert(Number(t.amount), txCurrency, primaryCurrency);
            return sum + amountInPrimary;
          }, 0);
        
        months.push({
          month: format(monthDate, "MMM"),
          income,
          expense,
        });
      }
      
      return months;
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Daily trend data interface
export interface DailyTrend {
  day: string;
  date: string;
  income: number;
  expense: number;
}

// Hook for daily trend data (current month) with currency conversion
export function useFlowStateDailyTrend(userId: string | undefined, primaryCurrency: string = "THB") {
  const { convert } = useExchangeRates("USD");
  
  return useQuery({
    queryKey: ["flowstate-daily-trend", userId, primaryCurrency],
    queryFn: async () => {
      if (!userId) return [];
      
      const today = new Date();
      const start = startOfMonth(today);
      const end = endOfMonth(today);
      const daysInMonth = end.getDate();
      
      // Fetch all transactions for current month from the local finance store
      const data = await financeStore.listTransactions(userId, format(start, "yyyy-MM-dd"), format(end, "yyyy-MM-dd"));

      // Initialize all days in the month
      const dailyMap: Record<string, DailyTrend> = {};
      for (let d = 1; d <= daysInMonth; d++) {
        const dayDate = new Date(today.getFullYear(), today.getMonth(), d);
        dailyMap[d.toString()] = {
          day: d.toString(),
          date: format(dayDate, "MMM d, yyyy"),
          income: 0,
          expense: 0,
        };
      }
      
      // Sum transactions per day with currency conversion
      data.forEach(tx => {
        const txDate = new Date(tx.transaction_date);
        const day = txDate.getDate().toString();
        const txCurrency = tx.currency || "USD";
        
        const amountInPrimary = txCurrency === primaryCurrency
          ? Number(tx.amount)
          : convert(Number(tx.amount), txCurrency, primaryCurrency);
        
        if (tx.type === "income") {
          dailyMap[day].income += amountInPrimary;
        } else {
          dailyMap[day].expense += amountInPrimary;
        }
      });
      
      // Return as sorted array
      return Object.values(dailyMap).sort((a, b) => parseInt(a.day) - parseInt(b.day));
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

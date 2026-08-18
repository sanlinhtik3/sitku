import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "@/components/flowstate/solarIcons";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { financeStore } from "@/repositories/local/financeStore";
import { startOfMonth, endOfMonth, format, addMonths, subMonths, getDaysInMonth, getDay, isToday } from "date-fns";
import { useExchangeRates, currencySymbols } from "@/hooks/useExchangeRates";
import { cn } from "@/lib/utils";
import { transactionDateKey } from "@/lib/flowstate/financeDates";

interface SpendingCalendarProps {
  userId: string;
  primaryCurrency: string;
}

const DAY_HEADERS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function SpendingCalendar({ userId, primaryCurrency }: SpendingCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const { convert } = useExchangeRates("USD");

  const monthStart = useMemo(() => startOfMonth(currentMonth), [currentMonth]);
  const monthEnd = useMemo(() => endOfMonth(currentMonth), [currentMonth]);

  const { data: dailyFlow = {} } = useQuery({
    queryKey: ["spending-calendar", userId, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const rows = await financeStore.listTransactions(userId, format(monthStart, "yyyy-MM-dd"), format(monthEnd, "yyyy-MM-dd"));
      const grouped: Record<number, { income: number; expense: number; net: number }> = {};
      for (const tx of rows) {
        if (tx.type !== "income" && tx.type !== "expense") continue;
        const day = Number(transactionDateKey(tx.transaction_date).slice(8));
        const converted = convert(tx.amount, tx.currency || primaryCurrency, primaryCurrency);
        grouped[day] ||= { income: 0, expense: 0, net: 0 };
        grouped[day][tx.type] += converted;
        grouped[day].net += tx.type === "income" ? converted : -converted;
      }
      return grouped;
    },
    enabled: !!userId,
  });

  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDayOfWeek = getDay(monthStart); // 0 = Sunday

  const formatAmount = (amount: number) => {
    if (amount === 0) return "0";
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
    return Math.round(amount).toLocaleString();
  };

  const currencySymbol = currencySymbols[primaryCurrency] || primaryCurrency;
  const monthTotals = useMemo(() => Object.values(dailyFlow).reduce((total, day) => ({
    income: total.income + day.income,
    expense: total.expense + day.expense,
  }), { income: 0, expense: 0 }), [dailyFlow]);

  return (
    <div className="flowstate-glass flowstate-calendar">
      {/* Header */}
      <div className="flowstate-calendar-header">
        <Button
          variant="ghost"
          size="icon"
          className="flowstate-calendar-nav"
          onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flowstate-calendar-title"><h3>{format(currentMonth, "MMMM yyyy")}</h3><p>Daily net · tap a day to log</p></div>
        <Button
          variant="ghost"
          size="icon"
          className="flowstate-calendar-nav"
          onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Day Headers */}
      <div className="flowstate-calendar-weekdays">
        {DAY_HEADERS.map((day) => (
          <div key={day}>
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="flowstate-calendar-grid">
        {/* Empty cells for padding before month starts */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
          const isCurrentDay = isToday(date);
          const flow = dailyFlow[day] || { income: 0, expense: 0, net: 0 };

          return (
            <div
              key={day}
              className={cn(
                "flowstate-calendar-day",
                isCurrentDay
                  ? "is-today"
                  : flow.net > 0 ? "is-income" : flow.net < 0 ? "is-expense" : ""
              )}
            >
              <span className={cn(
                isCurrentDay ? "text-primary" : ""
              )}>
                {day}
              </span>
              <span className={cn(
                flow.net > 0 ? "text-emerald-300" : flow.net < 0 ? "text-rose-400" : ""
              )}>
                {flow.net === 0 ? "0" : `${flow.net > 0 ? "+" : "−"}${currencySymbol}${formatAmount(Math.abs(flow.net))}`}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flowstate-calendar-footer">
        <div className="flowstate-calendar-legend"><span><i className="expense" />Expense day</span><span><i className="income" />Income day</span><span><i className="today" />Today</span></div>
        <span>{format(currentMonth, "MMMM")} total · <b className="expense">−{currencySymbol}{formatAmount(monthTotals.expense)} spent</b> · <b className="income">{currencySymbol}{formatAmount(monthTotals.income)} in</b></span>
      </div>
    </div>
  );
}

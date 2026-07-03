import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { financeStore } from "@/repositories/local/financeStore";
import { startOfMonth, endOfMonth, format, addMonths, subMonths, getDaysInMonth, getDay, isToday } from "date-fns";
import { useExchangeRates, currencySymbols } from "@/hooks/useExchangeRates";
import { cn } from "@/lib/utils";

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

  const { data: dailyExpenses = {} } = useQuery({
    queryKey: ["spending-calendar", userId, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const rows = await financeStore.listTransactions(userId, format(monthStart, "yyyy-MM-dd"), format(monthEnd, "yyyy-MM-dd"));
      const data = rows.filter((t) => t.type === "expense");

      const grouped: Record<number, number> = {};
      for (const tx of data) {
        const day = new Date(tx.transaction_date + "T00:00:00").getDate();
        const converted = convert(tx.amount, tx.currency || primaryCurrency, primaryCurrency);
        grouped[day] = (grouped[day] || 0) + converted;
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

  return (
    <div className="rounded-2xl border border-border/30 bg-card/30 backdrop-blur-xl p-3 sm:p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-xl hover:bg-muted/50"
          onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h3 className="text-base sm:text-lg font-bold tracking-tight text-foreground">
          {format(currentMonth, "MMMM yyyy")}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-xl hover:bg-muted/50"
          onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5">
        {DAY_HEADERS.map((day) => (
          <div key={day} className="text-center text-[10px] sm:text-xs font-semibold text-muted-foreground tracking-wider py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {/* Empty cells for padding before month starts */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
          const isCurrentDay = isToday(date);
          const expense = dailyExpenses[day] || 0;

          return (
            <div
              key={day}
              className={cn(
                "flex flex-col items-center justify-center rounded-xl border h-10 sm:h-11 lg:h-12 p-0.5 sm:p-1 transition-all duration-200",
                isCurrentDay
                  ? "border-primary/50 bg-primary/10 shadow-[0_0_12px_hsl(var(--primary)/0.15)]"
                  : "border-border/20 bg-muted/20 hover:bg-muted/30 hover:border-border/40"
              )}
            >
              <span className={cn(
                "text-xs sm:text-sm font-semibold leading-none",
                isCurrentDay ? "text-primary" : "text-foreground/80"
              )}>
                {day}
              </span>
              <span className={cn(
                "text-[8px] sm:text-[10px] leading-none mt-0.5",
                expense > 0 ? "text-destructive/80 font-medium" : "text-muted-foreground/50"
              )}>
                {expense > 0 ? `${currencySymbol}${formatAmount(expense)}` : "0"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

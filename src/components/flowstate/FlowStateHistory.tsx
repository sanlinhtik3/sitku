import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Calendar, 
  Download, 
  FileSpreadsheet, 
  FileText,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Loader2
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { financeStore } from "@/repositories/local/financeStore";
import { format, subMonths, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { CurrencyDisplay } from "./ui/CurrencyDisplay";
import { HistoryComparisonChart } from "./ui/HistoryComparisonChart";
import { cn } from "@/lib/utils";

interface FlowStateHistoryProps {
  userId: string;
  currency: string;
}

interface MonthSummary {
  month: string;
  income: number;
  expense: number;
  net: number;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

export function FlowStateHistory({ userId, currency }: FlowStateHistoryProps) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [viewMode, setViewMode] = useState<"monthly" | "yearly">("monthly");

  // Fetch historical data with currency conversion
  const { data: historicalData = [], isLoading } = useQuery({
    queryKey: ["flowstate-history", userId, selectedYear, currency],
    queryFn: async () => {
      if (!userId) return [];
      
      const yearStart = format(startOfYear(new Date(selectedYear, 0)), "yyyy-MM-dd");
      const yearEnd = format(endOfYear(new Date(selectedYear, 11)), "yyyy-MM-dd");
      
      const data = await financeStore.listTransactions(userId, yearStart, yearEnd);

      // Group by month
      const monthlyData: Record<string, { income: number; expense: number }> = {};
      
      for (let i = 0; i < 12; i++) {
        const monthKey = format(new Date(selectedYear, i), "yyyy-MM");
        monthlyData[monthKey] = { income: 0, expense: 0 };
      }
      
      // Simple conversion rates for history (same as fallback rates)
      const usdRates: Record<string, number> = {
        USD: 1,
        THB: 33.5,
        MMK: 2100,
        EUR: 0.92,
        GBP: 0.79,
      };
      
      const convertToDisplay = (amount: number, fromCurrency: string): number => {
        if (fromCurrency === currency) return amount;
        // Convert to USD first, then to display currency
        const toUsdRate = 1 / (usdRates[fromCurrency] || 1);
        const amountInUsd = amount * toUsdRate;
        const displayRate = usdRates[currency] || 1;
        return amountInUsd * displayRate;
      };
      
      data?.forEach(tx => {
        const monthKey = tx.transaction_date.substring(0, 7);
        if (monthlyData[monthKey]) {
          const txCurrency = tx.currency || "USD";
          const convertedAmount = convertToDisplay(Number(tx.amount), txCurrency);
          
          if (tx.type === "income") {
            monthlyData[monthKey].income += convertedAmount;
          } else if (tx.type === "expense") {
            monthlyData[monthKey].expense += convertedAmount;
          }
        }
      });
      
      return Object.entries(monthlyData).map(([month, data]) => ({
        month,
        income: data.income,
        expense: data.expense,
        net: data.income - data.expense,
      })) as MonthSummary[];
    },
    enabled: !!userId,
  });

  // Selected month data
  const selectedMonthData = useMemo(() => {
    const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`;
    return historicalData.find(d => d.month === monthKey) || { income: 0, expense: 0, net: 0, month: monthKey };
  }, [historicalData, selectedMonth, selectedYear]);

  // Year totals
  const yearTotals = useMemo(() => {
    return historicalData.reduce(
      (acc, d) => ({
        income: acc.income + d.income,
        expense: acc.expense + d.expense,
        net: acc.net + d.net,
      }),
      { income: 0, expense: 0, net: 0 }
    );
  }, [historicalData]);

  // Export handlers
  const handleExportPDF = () => {
    // For now, just show a toast - would integrate with a PDF library
    import("jspdf").then(({ default: jsPDF }) => {
      const doc = new jsPDF();
      doc.setFontSize(20);
      doc.text("FlowState Financial Report", 20, 20);
      doc.setFontSize(12);
      doc.text(`Period: ${viewMode === "monthly" ? MONTHS[selectedMonth] : ""} ${selectedYear}`, 20, 35);
      doc.text(`Income: ${currency} ${viewMode === "monthly" ? selectedMonthData.income.toLocaleString() : yearTotals.income.toLocaleString()}`, 20, 50);
      doc.text(`Expenses: ${currency} ${viewMode === "monthly" ? selectedMonthData.expense.toLocaleString() : yearTotals.expense.toLocaleString()}`, 20, 60);
      doc.text(`Net: ${currency} ${viewMode === "monthly" ? selectedMonthData.net.toLocaleString() : yearTotals.net.toLocaleString()}`, 20, 70);
      doc.save(`flowstate-report-${selectedYear}${viewMode === "monthly" ? `-${selectedMonth + 1}` : ""}.pdf`);
    });
  };

  const handleExportExcel = async () => {
    // Create CSV data
    const headers = ["Month", "Income", "Expenses", "Net"];
    const rows = historicalData.map(d => [
      format(new Date(d.month + "-01"), "MMMM yyyy"),
      d.income.toString(),
      d.expense.toString(),
      d.net.toString(),
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.join(",")),
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flowstate-report-${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select
            value={viewMode === "monthly" ? String(selectedMonth) : "yearly"}
            onValueChange={(val) => {
              if (val === "yearly") {
                setViewMode("yearly");
              } else {
                setViewMode("monthly");
                setSelectedMonth(Number(val));
              }
            }}
          >
            <SelectTrigger className="w-32 h-9 text-xs">
              <Calendar className="h-3 w-3 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yearly">Full Year</SelectItem>
              {MONTHS.map((month, idx) => (
                <SelectItem key={month} value={String(idx)}>{month}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={String(selectedYear)} onValueChange={(val) => setSelectedYear(Number(val))}>
            <SelectTrigger className="w-24 h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map(year => (
                <SelectItem key={year} value={String(year)}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={handleExportPDF}>
            <FileText className="h-3 w-3" />
            PDF
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={handleExportExcel}>
            <FileSpreadsheet className="h-3 w-3" />
            Excel
          </Button>
        </div>
      </div>

      {/* Summary Card */}
      <Card className="p-4 border-border/50 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">
            {viewMode === "monthly" ? `${MONTHS[selectedMonth]} ${selectedYear}` : `Year ${selectedYear}`}
          </h3>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </div>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Income</p>
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <CurrencyDisplay 
                  amount={viewMode === "monthly" ? selectedMonthData.income : yearTotals.income} 
                  currency={currency} 
                  size="md"
                  className="text-emerald-500"
                />
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Expenses</p>
              <div className="flex items-center gap-1.5">
                <TrendingDown className="h-4 w-4 text-rose-500" />
                <CurrencyDisplay 
                  amount={viewMode === "monthly" ? selectedMonthData.expense : yearTotals.expense} 
                  currency={currency} 
                  size="md"
                  className="text-rose-500"
                />
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Net</p>
              <CurrencyDisplay 
                amount={viewMode === "monthly" ? selectedMonthData.net : yearTotals.net} 
                currency={currency} 
                size="md"
                showSign
                className={cn(
                  (viewMode === "monthly" ? selectedMonthData.net : yearTotals.net) >= 0 
                    ? "text-blue-500" 
                    : "text-rose-500"
                )}
              />
            </div>
          </div>
        )}
      </Card>

      {/* Chart */}
      <HistoryComparisonChart data={historicalData} currency={currency} isLoading={isLoading} />

      {/* Monthly Breakdown */}
      <Card className="p-4 border-border/50 bg-card/50 backdrop-blur-sm">
        <h4 className="font-medium text-sm mb-3">Monthly Breakdown</h4>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            [...historicalData].reverse().map((month) => (
              <div 
                key={month.month}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg border border-border/50",
                  month.month === `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}` && viewMode === "monthly"
                    ? "bg-primary/5 border-primary/20"
                    : "bg-muted/30"
                )}
              >
                <span className="text-sm font-medium">
                  {format(new Date(month.month + "-01"), "MMMM")}
                </span>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-emerald-500">
                    +{currency === "MMK" ? "Ks" : currency} {month.income.toLocaleString()}
                  </span>
                  <span className="text-xs text-rose-500">
                    -{currency === "MMK" ? "Ks" : currency} {month.expense.toLocaleString()}
                  </span>
                  <span className={cn(
                    "text-xs font-medium min-w-[80px] text-right",
                    month.net >= 0 ? "text-blue-500" : "text-rose-500"
                  )}>
                    {month.net >= 0 ? "+" : ""}{currency === "MMK" ? "Ks" : currency} {month.net.toLocaleString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

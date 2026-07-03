import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  TrendingUp, 
  TrendingDown, 
  CalendarIcon, 
  Loader2,
  Wallet,
  CreditCard,
  Building2,
  Landmark,
  Shirt,
  GraduationCap,
  Film,
  Utensils,
  Heart,
  Home,
  ShoppingBag,
  Monitor,
  Car,
  Zap,
  MoreHorizontal,
  Briefcase,
  Gift,
  TrendingUp as Investment,
  DollarSign,
  RefreshCw,
  LucideIcon
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useExchangeRates, currencySymbols } from "@/hooks/useExchangeRates";

// Icon mapping for categories
const iconMap: Record<string, LucideIcon> = {
  Shirt,
  GraduationCap,
  Film,
  Utensils,
  Heart,
  Home,
  ShoppingBag,
  Monitor,
  Car,
  Zap,
  MoreHorizontal,
  Briefcase,
  Gift,
  TrendingUp: Investment,
  Wallet,
  DollarSign,
};

// Currency options
const currencies = [
  { value: "THB", label: "฿ THB", symbol: "฿" },
  { value: "USD", label: "$ USD", symbol: "$" },
  { value: "MMK", label: "Ks MMK", symbol: "Ks" },
];

// Account icon mapping
const accountIconMap: Record<string, LucideIcon> = {
  cash: Wallet,
  bank: Building2,
  credit_card: CreditCard,
  savings: Landmark,
  default: Wallet,
};

interface AddTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Array<{ id: string; account_name: string; currency: string; account_type?: string; icon?: string }>;
  categories: Array<{ id: string; name: string; icon: string; color: string; type: string }>;
  primaryCurrency?: string;
  /** Distinct prior income sources per category, for autocomplete. Key = category_id. */
  sourceSuggestions?: Record<string, string[]>;
  onSubmit: (data: {
    type: "income" | "expense";
    amount: number;
    currency: string;
    account_id: string;
    category_id: string;
    description: string;
    notes: string;
    transaction_date: string;
    source?: string | null;
  }) => void;
  isSubmitting: boolean;
}

export function AddTransactionDialog({
  open,
  onOpenChange,
  accounts,
  categories,
  primaryCurrency = "THB",
  sourceSuggestions,
  onSubmit,
  isSubmitting,
}: AddTransactionDialogProps) {
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("THB");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("");
  const [date, setDate] = useState<Date>(new Date());

  // Exchange rates hook
  const { convert, getRate, isLoading: ratesLoading, isFallback } = useExchangeRates("USD");

  const filteredCategories = useMemo(() => 
    categories.filter((c) => c.type === type),
    [categories, type]
  );

  // Get selected account info
  const selectedAccount = useMemo(() => 
    accounts.find(a => a.id === accountId),
    [accounts, accountId]
  );

  // Get selected category info
  const selectedCategory = useMemo(() => 
    categories.find(c => c.id === categoryId),
    [categories, categoryId]
  );

  // Calculate converted amount
  const convertedAmount = useMemo(() => {
    if (!amount || currency === primaryCurrency) return null;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) return null;
    return convert(numAmount, currency, primaryCurrency);
  }, [amount, currency, primaryCurrency, convert]);

  // Get current exchange rate
  const currentRate = useMemo(() => {
    if (currency === primaryCurrency) return null;
    return getRate(currency, primaryCurrency);
  }, [currency, primaryCurrency, getRate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !categoryId) return;

    onSubmit({
      type,
      amount: parseFloat(amount),
      currency,
      account_id: accountId || accounts[0]?.id || "",
      category_id: categoryId,
      description,
      notes,
      transaction_date: date.toISOString(),
      source: type === "income" && source.trim() ? source.trim() : null,
    });

    // Reset form
    setAmount("");
    setDescription("");
    setNotes("");
    setSource("");
    setCategoryId("");
    onOpenChange(false);
  };

  const getCurrencySymbol = (curr: string) => {
    return currencySymbols[curr] || currencies.find(c => c.value === curr)?.symbol || curr;
  };

  const getIconComponent = (iconName: string): LucideIcon => {
    return iconMap[iconName] || MoreHorizontal;
  };

  const getAccountIcon = (accountType?: string): LucideIcon => {
    return accountIconMap[accountType || "default"] || Wallet;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card/98 backdrop-blur-xl border-border/50 shadow-2xl">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <div className={cn(
              "p-2 rounded-xl",
              type === "expense" 
                ? "bg-rose-500/15 text-rose-500" 
                : "bg-emerald-500/15 text-emerald-500"
            )}>
              {type === "expense" ? <TrendingDown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
            </div>
            Add Transaction
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type Toggle */}
          <Tabs value={type} onValueChange={(v) => {
            setType(v as "income" | "expense");
            setCategoryId(""); // Reset category when type changes
          }} className="w-full">
            <TabsList className="w-full grid grid-cols-2 h-12 p-1 bg-muted/50">
              <TabsTrigger 
                value="expense" 
                className="gap-2 h-full rounded-lg font-semibold transition-all data-[state=active]:bg-rose-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-rose-500/25"
              >
                <TrendingDown className="h-4 w-4" />
                Expense
              </TabsTrigger>
              <TabsTrigger 
                value="income" 
                className="gap-2 h-full rounded-lg font-semibold transition-all data-[state=active]:bg-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-emerald-500/25"
              >
                <TrendingUp className="h-4 w-4" />
                Income
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Amount with Currency */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Amount</Label>
            <div className="flex gap-2">
              {/* Currency Selector */}
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-28 h-14 bg-muted/30 border-border/50 font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border/50">
                  {currencies.map((curr) => (
                    <SelectItem key={curr.value} value={curr.value} className="font-medium">
                      {curr.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Amount Input */}
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xl font-bold text-muted-foreground">
                  {getCurrencySymbol(currency)}
                </span>
                <Input
                  id="amount"
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={cn(
                    "text-2xl font-bold h-14 pl-10 bg-muted/30 border-border/50",
                    type === "expense" ? "focus-visible:ring-rose-500" : "focus-visible:ring-emerald-500"
                  )}
                  required
                  step="0.01"
                  min="0"
                />
              </div>
            </div>

            {/* Currency Conversion Preview */}
            {convertedAmount !== null && currency !== primaryCurrency && (
              <div className="mt-2 p-3 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <RefreshCw className={cn("h-3 w-3", ratesLoading && "animate-spin")} />
                    {isFallback ? "Offline Rate" : "Live Rate"}
                  </span>
                  {currentRate && (
                    <span className="text-xs text-muted-foreground">
                      1 {currency} = {currentRate.toFixed(4)} {primaryCurrency}
                    </span>
                  )}
                </div>
                <p className="text-lg font-bold text-primary">
                  ≈ {getCurrencySymbol(primaryCurrency)} {convertedAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>
              </div>
            )}
          </div>

          {/* Account (Optional) */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              Account
              <span className="text-xs text-muted-foreground/60">(optional)</span>
            </Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="h-12 bg-muted/30 border-border/50">
                <SelectValue placeholder="Select account (optional)">
                  {selectedAccount && (
                    <div className="flex items-center gap-2">
                      {(() => {
                        const AccIcon = getAccountIcon(selectedAccount.account_type);
                        return <AccIcon className="h-4 w-4 text-primary" />;
                      })()}
                      <span>{selectedAccount.account_name}</span>
                      <span className="text-muted-foreground text-xs">({selectedAccount.currency})</span>
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-popover border-border/50">
                {accounts.map((acc) => {
                  const AccIcon = getAccountIcon(acc.account_type);
                  return (
                    <SelectItem key={acc.id} value={acc.id} className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-primary/10">
                          <AccIcon className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium">{acc.account_name}</span>
                          <span className="text-xs text-muted-foreground">{acc.currency}</span>
                        </div>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Category (Required) */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              Category
              <span className="text-xs text-rose-400">*</span>
            </Label>
            <Select value={categoryId} onValueChange={setCategoryId} required>
              <SelectTrigger className="h-12 bg-muted/30 border-border/50">
                <SelectValue placeholder="Select category">
                  {selectedCategory && (
                    <div className="flex items-center gap-2">
                      {(() => {
                        const CatIcon = getIconComponent(selectedCategory.icon);
                        return (
                          <div 
                            className="p-1 rounded-md" 
                            style={{ backgroundColor: `${selectedCategory.color}20` }}
                          >
                            <CatIcon className="h-4 w-4" style={{ color: selectedCategory.color }} />
                          </div>
                        );
                      })()}
                      <span>{selectedCategory.name}</span>
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-popover border-border/50 max-h-64">
                {filteredCategories.length === 0 ? (
                  <div className="py-6 text-center text-muted-foreground text-sm">
                    No categories available for {type}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-0.5 p-1">
                    {filteredCategories.map((cat) => {
                      const CatIcon = getIconComponent(cat.icon);
                      return (
                        <SelectItem 
                          key={cat.id} 
                          value={cat.id} 
                          className="py-2.5 rounded-lg cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <div 
                              className="p-2 rounded-lg" 
                              style={{ backgroundColor: `${cat.color}20` }}
                            >
                              <CatIcon className="h-4 w-4" style={{ color: cat.color }} />
                            </div>
                            <span className="font-medium">{cat.name}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  className={cn(
                    "w-full h-12 justify-start text-left font-normal bg-muted/30 border-border/50 hover:bg-muted/50", 
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                  {date ? format(date, "EEEE, MMMM do, yyyy") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-popover border-border/50" align="start">
                <Calendar 
                  mode="single" 
                  selected={date} 
                  onSelect={(d) => d && setDate(d)} 
                  initialFocus 
                  className="rounded-lg"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium text-muted-foreground">
              Description
            </Label>
            <Input
              id="description"
              placeholder="What was this for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-11 bg-muted/30 border-border/50"
            />
          </div>

          {/* Source / Client — income only. Sub-source under the income category for Income Intelligence. */}
          {type === "income" && (
            <div className="space-y-2">
              <Label htmlFor="source" className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                Source / Client
                <span className="text-xs text-muted-foreground/60">(optional)</span>
              </Label>
              <Input
                id="source"
                list="source-suggestions"
                placeholder="e.g. Client A, YouTube, Upwork"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="h-11 bg-muted/30 border-border/50"
              />
              {!!sourceSuggestions?.[categoryId]?.length && (
                <datalist id="source-suggestions">
                  {sourceSuggestions[categoryId].map((s) => (<option key={s} value={s} />))}
                </datalist>
              )}
            </div>
          )}

          {/* Notes (Collapsed by default) */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              Notes
              <span className="text-xs text-muted-foreground/60">(optional)</span>
            </Label>
            <Textarea
              id="notes"
              placeholder="Additional details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="resize-none bg-muted/30 border-border/50"
            />
          </div>

          {/* Submit */}
          <Button
            type="submit"
            className={cn(
              "w-full h-12 gap-2 font-semibold text-base shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]",
              type === "expense"
                ? "bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 shadow-rose-500/25"
                : "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-emerald-500/25"
            )}
            disabled={isSubmitting || !amount || !categoryId}
          >
            {isSubmitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : type === "expense" ? (
              <TrendingDown className="h-5 w-5" />
            ) : (
              <TrendingUp className="h-5 w-5" />
            )}
            Add {type === "expense" ? "Expense" : "Income"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CreditCard, CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { Subscription } from "@/hooks/useFlowState";

const currencies = [
  { value: "THB", label: "฿ THB" },
  { value: "USD", label: "$ USD" },
  { value: "MMK", label: "Ks MMK" },
];

const billingCycles = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const emojiOptions = ["💳", "🎵", "📺", "☁️", "🎮", "📱", "💡", "🏋️", "📰", "🔒"];

interface AddSubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  primaryCurrency: string;
  onSubmit: (data: Partial<Subscription>) => void;
  isSubmitting: boolean;
  editingSubscription?: Subscription | null;
}

export function AddSubscriptionDialog({
  open,
  onOpenChange,
  primaryCurrency,
  onSubmit,
  isSubmitting,
  editingSubscription,
}: AddSubscriptionDialogProps) {
  const [name, setName] = useState(editingSubscription?.name || "");
  const [amount, setAmount] = useState(editingSubscription?.amount?.toString() || "");
  const [currency, setCurrency] = useState(editingSubscription?.currency || primaryCurrency);
  const [billingCycle, setBillingCycle] = useState(editingSubscription?.billing_cycle || "monthly");
  const [nextDate, setNextDate] = useState<Date>(
    editingSubscription?.next_billing_date ? new Date(editingSubscription.next_billing_date) : new Date()
  );
  const [icon, setIcon] = useState(editingSubscription?.icon || "💳");
  const [color, setColor] = useState(editingSubscription?.color || "#8B5CF6");

  const isEditing = !!editingSubscription;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !amount) return;

    onSubmit({
      ...(isEditing ? { id: editingSubscription.id } : {}),
      name: name.trim(),
      amount: parseFloat(amount),
      currency,
      billing_cycle: billingCycle,
      next_billing_date: format(nextDate, "yyyy-MM-dd"),
      icon,
      color,
    });

    if (!isEditing) {
      setName("");
      setAmount("");
      setIcon("💳");
      setColor("#8B5CF6");
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card/98 backdrop-blur-xl border-border/50 shadow-2xl">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-500/15 text-purple-500">
              <CreditCard className="h-5 w-5" />
            </div>
            {isEditing ? "Edit Subscription" : "Add Subscription"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Icon picker */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Icon</Label>
            <div className="flex gap-2 flex-wrap">
              {emojiOptions.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setIcon(e)}
                  className={cn(
                    "h-10 w-10 rounded-xl text-lg flex items-center justify-center border transition-all",
                    icon === e
                      ? "border-primary bg-primary/15 scale-110 shadow-lg shadow-primary/20"
                      : "border-border/50 bg-muted/30 hover:bg-muted/50"
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">
              Name <span className="text-rose-400">*</span>
            </Label>
            <Input
              placeholder="e.g. Netflix, Spotify"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 bg-muted/30 border-border/50"
              required
              maxLength={100}
            />
          </div>

          {/* Amount + Currency */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">
              Amount <span className="text-rose-400">*</span>
            </Label>
            <div className="flex gap-2">
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-28 h-12 bg-muted/30 border-border/50 font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border/50">
                  {currencies.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 h-12 text-xl font-bold bg-muted/30 border-border/50 focus-visible:ring-purple-500"
                required
                step="0.01"
                min="0"
              />
            </div>
          </div>

          {/* Billing Cycle */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Billing Cycle</Label>
            <Select value={billingCycle} onValueChange={setBillingCycle}>
              <SelectTrigger className="h-12 bg-muted/30 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border/50">
                {billingCycles.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Next Billing Date */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Next Billing Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full h-12 justify-start text-left font-normal bg-muted/30 border-border/50 hover:bg-muted/50"
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                  {format(nextDate, "MMMM do, yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-popover border-border/50" align="start">
                <Calendar
                  mode="single"
                  selected={nextDate}
                  onSelect={(d) => d && setNextDate(d)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            className="w-full h-12 gap-2 font-semibold text-base shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all hover:scale-[1.02] active:scale-[0.98]"
            disabled={isSubmitting || !name.trim() || !amount}
          >
            {isSubmitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <CreditCard className="h-5 w-5" />
            )}
            {isEditing ? "Update Subscription" : "Add Subscription"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

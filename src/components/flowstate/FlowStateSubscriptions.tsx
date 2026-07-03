import { useState } from "react";
import { CreditCard, Calendar, Bell, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CurrencyDisplay } from "./ui/CurrencyDisplay";
import { AddSubscriptionDialog } from "./AddSubscriptionDialog";
import { cn } from "@/lib/utils";
import type { Subscription } from "@/hooks/useFlowState";

interface FlowStateSubscriptionsProps {
  subscriptions: Subscription[];
  monthlyTotal: number;
  isLoading: boolean;
  primaryCurrency: string;
  onAddSubscription: (data: Partial<Subscription>) => void;
  isAddingSubscription: boolean;
  onDeleteSubscription: (id: string) => void;
  onUpdateSubscription: (id: string, updates: Partial<Subscription>) => void;
}

export function FlowStateSubscriptions({
  subscriptions,
  monthlyTotal,
  isLoading,
  primaryCurrency,
  onAddSubscription,
  isAddingSubscription,
  onDeleteSubscription,
  onUpdateSubscription,
}: FlowStateSubscriptionsProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);

  const activeSubscriptions = subscriptions.filter((s) => s.is_active);

  const getBillingCycleLabel = (cycle: string) => {
    switch (cycle) {
      case "weekly": return "Weekly";
      case "monthly": return "Monthly";
      case "yearly": return "Yearly";
      default: return cycle;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Subscriptions</h3>
          <p className="text-xs text-muted-foreground">Track your recurring payments</p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"
          onClick={() => setAddOpen(true)}
        >
          <CreditCard className="h-4 w-4" />
          Add Subscription
        </Button>
      </div>

      {/* Monthly Total */}
      <div className="rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-pink-500/10 backdrop-blur-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1">Monthly Subscriptions</p>
            <CurrencyDisplay amount={monthlyTotal} currency={primaryCurrency} size="lg" className="text-purple-400" />
          </div>
          <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center">
            <CreditCard className="h-6 w-6 text-purple-500" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">{activeSubscriptions.length} active subscriptions</p>
      </div>

      {/* Subscription List */}
      <div className="space-y-2">
        {activeSubscriptions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No subscriptions yet</p>
            <p className="text-sm">Add your recurring payments to track them</p>
          </div>
        ) : (
          activeSubscriptions.map((sub) => (
            <div
              key={sub.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-colors"
            >
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center text-lg"
                style={{ backgroundColor: sub.color ? `${sub.color}20` : "hsl(var(--muted))" }}
              >
                {sub.icon || "💳"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{sub.name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {getBillingCycleLabel(sub.billing_cycle)}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Bell className="h-3 w-3" />
                    Next: {formatDate(sub.next_billing_date)}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <CurrencyDisplay amount={sub.amount} currency={sub.currency} size="sm" className="text-rose-400" />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground shrink-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover border-border/50">
                  <DropdownMenuItem onClick={() => setEditingSub(sub)} className="gap-2">
                    <Pencil className="h-4 w-4" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onDeleteSubscription(sub.id)}
                    className="gap-2 text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))
        )}
      </div>

      {/* Add Dialog */}
      <AddSubscriptionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        primaryCurrency={primaryCurrency}
        onSubmit={onAddSubscription}
        isSubmitting={isAddingSubscription}
      />

      {/* Edit Dialog */}
      {editingSub && (
        <AddSubscriptionDialog
          open={!!editingSub}
          onOpenChange={(open) => !open && setEditingSub(null)}
          primaryCurrency={primaryCurrency}
          editingSubscription={editingSub}
          onSubmit={(data) => {
            onUpdateSubscription(editingSub.id, data);
            setEditingSub(null);
          }}
          isSubmitting={false}
        />
      )}
    </div>
  );
}

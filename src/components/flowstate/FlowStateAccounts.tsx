import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Wallet, CreditCard, Smartphone, Bitcoin, Trash2, Loader2, Star, Check } from "lucide-react";
import { CurrencyDisplay } from "./ui/CurrencyDisplay";
import { AddAccountDialog } from "./AddAccountDialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Account {
  id: string;
  account_name: string;
  account_type: string;
  currency: string;
  current_balance: number | null;
  is_default: boolean | null;
}

interface FlowStateAccountsProps {
  accounts: Account[];
  onAddAccount: (data: {
    account_name: string;
    account_type: string;
    currency: string;
    current_balance: number;
  }) => void;
  onDeleteAccount: (id: string) => void;
  onSetDefault?: (id: string) => void;
  isAdding: boolean;
  isDeleting: boolean;
  isSettingDefault?: boolean;
}

const typeIcons: Record<string, typeof Wallet> = {
  cash: Wallet,
  bank: CreditCard,
  mobile_wallet: Smartphone,
  crypto: Bitcoin,
};

const typeColors: Record<string, string> = {
  cash: "from-emerald-500 to-teal-600",
  bank: "from-blue-500 to-indigo-600",
  mobile_wallet: "from-purple-500 to-pink-600",
  crypto: "from-amber-500 to-orange-600",
};

export function FlowStateAccounts({
  accounts,
  onAddAccount,
  onDeleteAccount,
  onSetDefault,
  isAdding,
  isDeleting,
  isSettingDefault,
}: FlowStateAccountsProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);

  const totalBalance = accounts.reduce((sum, acc) => sum + (acc.current_balance || 0), 0);

  const handleSetDefault = (accountId: string) => {
    if (onSetDefault) {
      setSettingDefaultId(accountId);
      onSetDefault(accountId);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Your Accounts</h3>
          <p className="text-xs text-muted-foreground">Manage your financial accounts</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Account
        </Button>
      </div>

      {/* Total Balance */}
      <div className="rounded-xl border border-border/50 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl p-4">
        <p className="text-xs text-muted-foreground font-medium mb-1">Total Balance</p>
        <CurrencyDisplay amount={totalBalance} currency="MMK" size="lg" />
      </div>

      {/* Account Cards */}
      <div className="grid gap-3">
        {accounts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Wallet className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No accounts yet</p>
            <p className="text-sm">Add your first account to start tracking</p>
          </div>
        ) : (
          accounts.map((account) => {
            const Icon = typeIcons[account.account_type] || Wallet;
            const gradient = typeColors[account.account_type] || "from-gray-500 to-gray-600";
            const isCurrentlySettingDefault = isSettingDefault && settingDefaultId === account.id;

            return (
              <div
                key={account.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl border bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-all",
                  account.is_default 
                    ? "border-primary/50 ring-1 ring-primary/20" 
                    : "border-border/50"
                )}
              >
                <div className={cn("h-10 w-10 rounded-lg bg-gradient-to-br flex items-center justify-center relative", gradient)}>
                  <Icon className="h-5 w-5 text-white" />
                  {account.is_default && (
                    <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary flex items-center justify-center ring-2 ring-background">
                      <Star className="h-2.5 w-2.5 text-primary-foreground fill-current" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{account.account_name}</p>
                    {account.is_default && (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 bg-primary/20 text-primary border-0 font-medium">
                        Default
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">{account.account_type.replace("_", " ")}</p>
                </div>
                <div className="text-right mr-1">
                  <CurrencyDisplay amount={account.current_balance || 0} currency={account.currency} size="sm" />
                </div>
                <div className="flex items-center gap-1">
                  {!account.is_default && onSetDefault && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 shrink-0 gap-1"
                      onClick={() => handleSetDefault(account.id)}
                      disabled={isSettingDefault}
                    >
                      {isCurrentlySettingDefault ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Set Default</span>
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-rose-500 shrink-0"
                    onClick={() => onDeleteAccount(account.id)}
                    disabled={isDeleting}
                  >
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <AddAccountDialog open={dialogOpen} onOpenChange={setDialogOpen} onSubmit={onAddAccount} isSubmitting={isAdding} />
    </div>
  );
}

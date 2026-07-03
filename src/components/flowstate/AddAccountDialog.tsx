import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Wallet, CreditCard, Smartphone, Bitcoin } from "lucide-react";

interface AddAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    account_name: string;
    account_type: string;
    currency: string;
    current_balance: number;
  }) => void;
  isSubmitting: boolean;
}

const accountTypes = [
  { value: "cash", label: "Cash", icon: Wallet },
  { value: "bank", label: "Bank Account", icon: CreditCard },
  { value: "mobile_wallet", label: "Mobile Wallet", icon: Smartphone },
  { value: "crypto", label: "Crypto", icon: Bitcoin },
];

const currencies = [
  { value: "MMK", label: "Myanmar Kyat (Ks)" },
  { value: "USD", label: "US Dollar ($)" },
  { value: "THB", label: "Thai Baht (฿)" },
];

export function AddAccountDialog({ open, onOpenChange, onSubmit, isSubmitting }: AddAccountDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState("cash");
  const [currency, setCurrency] = useState("MMK");
  const [balance, setBalance] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    onSubmit({
      account_name: name,
      account_type: type,
      currency,
      current_balance: parseFloat(balance) || 0,
    });

    // Reset form
    setName("");
    setType("cash");
    setCurrency("MMK");
    setBalance("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-background/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Add Account</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Account Name */}
          <div className="space-y-2">
            <Label htmlFor="account-name">Account Name</Label>
            <Input
              id="account-name"
              placeholder="e.g., Main Wallet, KBZ Pay"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* Account Type */}
          <div className="space-y-2">
            <Label>Account Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accountTypes.map((acc) => (
                  <SelectItem key={acc.value} value={acc.value}>
                    <span className="flex items-center gap-2">
                      <acc.icon className="h-4 w-4" />
                      {acc.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Currency */}
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((cur) => (
                  <SelectItem key={cur.value} value={cur.value}>
                    {cur.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Initial Balance */}
          <div className="space-y-2">
            <Label htmlFor="balance">Initial Balance</Label>
            <Input
              id="balance"
              type="number"
              placeholder="0.00"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </div>

          {/* Submit */}
          <Button
            type="submit"
            className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={isSubmitting || !name}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Add Account
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

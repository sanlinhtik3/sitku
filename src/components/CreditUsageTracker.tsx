import { useUserCredits } from "@/hooks/useUserCredits";
import { useAuth } from "@/hooks/useAuth";
import { Coins } from "lucide-react";

export const CreditUsageTracker = () => {
  const { user } = useAuth();
  const { balance } = useUserCredits(user?.id);

  // Only show a minimal inline hint when balance is very low
  if (balance > 3) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
      <Coins className="h-4 w-4 text-amber-500 shrink-0" />
      <span className="text-xs text-amber-500">
        {balance === 0
          ? "Credits ကုန်သွားပါပြီ — Top up လုပ်ပါ"
          : `Credit ${balance} ခု ကျန်ပါတယ်`}
      </span>
    </div>
  );
};

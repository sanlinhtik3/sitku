import { useUserCredits } from "@/hooks/useUserCredits";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Coins, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const CreditBalanceWidget = () => {
  const { user } = useAuth();
  const { balance, isLoading } = useUserCredits(user?.id);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/30 bg-card/50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Coins className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">AI Credits</p>
              <p className={cn(
                "text-2xl font-bold",
                balance >= 10 ? "text-emerald-500" : balance > 0 ? "text-amber-500" : "text-destructive"
              )}>
                {balance}
              </p>
            </div>
          </div>
          <Link to="/buy-credits">
            <Button size="sm" variant="outline" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Top Up
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};

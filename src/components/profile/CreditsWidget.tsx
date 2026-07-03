import { Card, CardContent } from "@/components/ui/card";
import { Coins } from "lucide-react";
import { useUserCredits } from "@/hooks/useUserCredits";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface CreditsWidgetProps {
  userId: string;
}

export const CreditsWidget = ({ userId }: CreditsWidgetProps) => {
  const { balance, isLoading } = useUserCredits(userId);

  if (isLoading) {
    return (
      <Card className="border-border/20">
        <CardContent className="p-4">
          <Skeleton className="h-12" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/20 bg-card/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 rounded-lg">
            <Coins className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Credits</p>
            <p className={cn(
              "text-xl font-bold",
              balance >= 10 ? "text-emerald-500" : balance > 0 ? "text-amber-500" : "text-destructive"
            )}>
              {balance}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

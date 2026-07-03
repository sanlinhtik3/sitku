import { memo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Crown, Clock, Zap, Sparkles, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useProPlan } from "@/hooks/useProPlan";

interface DailyLimitReachedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureName?: string;
  resetsAt?: string;
}

export const DailyLimitReachedDialog = memo(({ 
  open, 
  onOpenChange,
  featureName = 'this feature',
  resetsAt
}: DailyLimitReachedDialogProps) => {
  const navigate = useNavigate();
  const { isPro, dailyLimit, hasPersonalKey } = useProPlan();

  // Format reset time
  const formatResetTime = () => {
    if (!resetsAt) return 'tomorrow';
    const resetDate = new Date(resetsAt);
    const now = new Date();
    const diffMs = resetDate.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHours > 0) {
      return `${diffHours} hours ${diffMinutes} minutes`;
    }
    return `${diffMinutes} minutes`;
  };

  const handleUpgrade = () => {
    onOpenChange(false);
    navigate('/ai-content-pricing');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                <Zap className="h-8 w-8 text-amber-500" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-destructive flex items-center justify-center">
                <span className="text-white text-xs font-bold">0</span>
              </div>
            </div>
          </div>
          <DialogTitle className="text-center text-xl">
            Daily Limit Reached
          </DialogTitle>
          <DialogDescription asChild>
            <div className="text-center space-y-2">
              <p>
                You've used all {dailyLimit} daily uses for {featureName}.
              </p>
              <div className="flex items-center justify-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>Resets in {formatResetTime()}</span>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current plan info */}
          <div className="p-4 rounded-lg bg-muted/50 border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Your Plan</span>
              <Badge variant={isPro ? "default" : "secondary"} className={isPro ? "bg-amber-500" : ""}>
                {isPro ? (
                  <>
                    <Crown className="h-3 w-3 mr-1" />
                    Pro
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3 mr-1" />
                    Free
                  </>
                )}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Daily Limit</span>
              <span className="font-medium text-foreground">{dailyLimit} uses</span>
            </div>
          </div>

          {/* Upgrade promotion for free users */}
          {!isPro && (
            <div className="p-4 rounded-lg bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                  <Crown className="h-5 w-5 text-amber-500" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1">Upgrade to Pro</h4>
                  <p className="text-xs text-muted-foreground mb-2">
                    Get up to 15 daily uses with Pro Plan + Personal API Key
                  </p>
                  <ul className="text-xs space-y-1">
                    <li className="flex items-center gap-1.5">
                      <div className="w-1 h-1 rounded-full bg-primary" />
                      5 system-powered uses/day
                    </li>
                    <li className="flex items-center gap-1.5">
                      <div className="w-1 h-1 rounded-full bg-primary" />
                      +10 uses with Personal API Key
                    </li>
                    <li className="flex items-center gap-1.5">
                      <div className="w-1 h-1 rounded-full bg-primary" />
                      30 days of unlimited access
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Tip for Pro users without personal key */}
          {isPro && !hasPersonalKey && (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Tip:</strong> Add your Personal Gemini API Key to get +10 more daily uses (15 total).
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {!isPro && (
            <Button onClick={handleUpgrade} className="w-full gap-2">
              <Crown className="h-4 w-4" />
              Upgrade to Pro
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          <Button 
            variant={isPro ? "default" : "outline"} 
            onClick={() => onOpenChange(false)}
            className="w-full"
          >
            Got it, I'll wait
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

DailyLimitReachedDialog.displayName = "DailyLimitReachedDialog";

import { memo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, Clock, Zap, Sparkles, ChevronRight, Coins, AlertTriangle, Brain } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useProPlan } from "@/hooks/useProPlan";
import { APEX_MESSAGES, formatResetCountdown } from "@/lib/apex-localization";
import { TIERS } from "@/lib/ai-models";
import { cn } from "@/lib/utils";

// ═══ APEX INTELLIGENCE EXHAUSTED DIALOG ═══
// Updated to use IU-weighted billing and tier-specific messaging

export interface CreditsExhaustedError {
  type: 'credits_exhausted' | 'daily_limit' | 'insufficient_iu' | 'model_access_denied';
  dailyLimit?: number;
  creditBalance?: number;
  creditsRemaining?: number;
  proCredits?: number;
  resetsAt: string;
  isPro?: boolean;
  hasPersonalKey?: boolean;
  // APEX additions
  tierKey?: string;
  tierDisplay?: string;
  dailyIULimit?: number;
  dailyIURemaining?: number;
  iuBonus?: number;
  iuBalance?: number;
  modelGranted?: string;
  provider?: string;
}

interface CreditsExhaustedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  error: CreditsExhaustedError | null;
  featureName?: string;
}

export const CreditsExhaustedDialog = memo(({ 
  open, 
  onOpenChange,
  error,
  featureName = 'BeeBot'
}: CreditsExhaustedDialogProps) => {
  const navigate = useNavigate();
  const { isPro, hasPersonalKey } = useProPlan();
  const [countdown, setCountdown] = useState<string>("--:--");

  // Live countdown timer
  useEffect(() => {
    if (!error?.resetsAt || !open) return;
    
    const updateCountdown = () => {
      setCountdown(formatResetCountdown(error.resetsAt));
    };
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, [error?.resetsAt, open]);

  if (!error) return null;

  // Determine if this is an APEX error or legacy error
  const isApexError = error.type === 'insufficient_iu' || error.type === 'model_access_denied' || error.tierKey;
  
  // Get tier info
  const tierKey = error.tierKey || 'explorer';
  const tierInfo = TIERS[tierKey] || TIERS.explorer;
  const tierMessages = APEX_MESSAGES.tiers[tierKey as keyof typeof APEX_MESSAGES.tiers] || APEX_MESSAGES.tiers.explorer;

  // Calculate remaining IU
  const dailyIU = error.dailyIURemaining ?? 0;
  const bonusIU = error.iuBonus ?? 0;
  const balanceIU = error.iuBalance ?? 0;
  const totalIU = dailyIU + bonusIU + balanceIU;
  
  const isFullyExhausted = totalIU <= 0 || error.type === 'credits_exhausted';

  const handleUpgrade = () => {
    onOpenChange(false);
    navigate('/ai-content-pricing');
  };

  const handleBuyCredits = () => {
    onOpenChange(false);
    navigate('/ai-content-pricing#credits');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="relative">
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center",
                isFullyExhausted 
                  ? "bg-gradient-to-br from-red-500/20 to-orange-500/20" 
                  : `bg-gradient-to-br ${tierInfo.gradient}/20`
              )}>
                {isFullyExhausted ? (
                  <AlertTriangle className="h-8 w-8 text-red-500" />
                ) : (
                  <Brain className="h-8 w-8 text-primary" />
                )}
              </div>
              <div className={cn(
                "absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center",
                isFullyExhausted ? "bg-destructive" : `bg-gradient-to-br ${tierInfo.gradient}`
              )}>
                <span className="text-white text-xs font-bold">
                  {isFullyExhausted ? '!' : '0'}
                </span>
              </div>
            </div>
          </div>
          <DialogTitle className="text-center text-xl">
            {isApexError 
              ? (isFullyExhausted ? 'Intelligence Units ကုန်ဆုံးပါပြီ' : 'Daily IU Limit ပြည့်သွားပါပြီ')
              : (isFullyExhausted ? 'Credits Exhausted' : 'Daily Limit Reached')
            }
          </DialogTitle>
          <DialogDescription asChild>
            <div className="text-center space-y-2">
              {isApexError ? (
                <>
                  <p className="text-muted-foreground">
                    {isFullyExhausted 
                      ? APEX_MESSAGES.errors.insufficient_iu
                      : tierMessages.limit
                    }
                  </p>
                  {/* Live Countdown Timer */}
                  <div className="flex items-center justify-center gap-2 text-sm bg-muted/50 rounded-lg py-2 px-4">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Reset ကျမည် </span>
                    <span className="font-mono font-bold text-primary">{countdown}</span>
                  </div>
                </>
              ) : (
                <>
                  <p>
                    {isFullyExhausted 
                      ? `Both your daily credits and credit balance are exhausted. Purchase more credits to continue using ${featureName}.`
                      : `You've used all daily credits for ${featureName}. Your credit balance will be used instead.`
                    }
                  </p>
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Reset in {countdown}</span>
                  </div>
                </>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* APEX IU Status Summary */}
          {isApexError && (
            <div className="p-4 rounded-lg bg-muted/50 border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Intelligence Status</span>
                <Badge 
                  variant="outline" 
                  className={cn("bg-gradient-to-r text-white border-0", tierInfo.gradient)}
                >
                  {tierKey === 'admin' ? <Crown className="h-3 w-3 mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                  {tierInfo.displayNameMM}
                </Badge>
              </div>
              
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="p-2 rounded bg-background/50">
                  <div className="text-muted-foreground text-xs">{APEX_MESSAGES.ui.dailyIU}</div>
                  <div className="font-semibold flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                    {dailyIU.toFixed(1)} / {error.dailyIULimit || 10}
                  </div>
                </div>
                <div className="p-2 rounded bg-background/50">
                  <div className="text-muted-foreground text-xs">{APEX_MESSAGES.ui.bonusIU}</div>
                  <div className="font-semibold flex items-center gap-1">
                    <Crown className="h-3.5 w-3.5 text-primary" />
                    {bonusIU.toFixed(1)}
                  </div>
                </div>
                <div className="p-2 rounded bg-background/50">
                  <div className="text-muted-foreground text-xs">{APEX_MESSAGES.ui.balanceIU}</div>
                  <div className="font-semibold flex items-center gap-1">
                    <Coins className="h-3.5 w-3.5 text-emerald-500" />
                    {balanceIU.toFixed(1)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Legacy Credit Status (fallback) */}
          {!isApexError && (
            <div className="p-4 rounded-lg bg-muted/50 border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Credit Status</span>
                <Badge variant={error.isPro ? "default" : "secondary"} className={error.isPro ? "bg-amber-500" : ""}>
                  {error.isPro ? (
                    <><Crown className="h-3 w-3 mr-1" />Pro</>
                  ) : (
                    <><Sparkles className="h-3 w-3 mr-1" />Free</>
                  )}
                </Badge>
              </div>
              
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="p-2 rounded bg-background/50">
                  <div className="text-muted-foreground text-xs">Daily</div>
                  <div className="font-semibold flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                    0 / {error.dailyLimit || 3}
                  </div>
                </div>
                <div className="p-2 rounded bg-background/50">
                  <div className="text-muted-foreground text-xs">Pro Credits</div>
                  <div className="font-semibold flex items-center gap-1">
                    <Crown className="h-3.5 w-3.5 text-primary" />
                    {error.proCredits || 0}
                  </div>
                </div>
                <div className="p-2 rounded bg-background/50">
                  <div className="text-muted-foreground text-xs">Balance</div>
                  <div className="font-semibold flex items-center gap-1">
                    <Coins className="h-3.5 w-3.5 text-emerald-500" />
                    {error.creditsRemaining || 0}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Upgrade promotion */}
          {tierMessages.upgrade && (
            <div className={cn(
              "p-4 rounded-lg border",
              `bg-gradient-to-r ${tierInfo.gradient}/10 border-${tierInfo.gradient.split(' ')[0].replace('from-', '')}/30`
            )}>
              <div className="flex items-start gap-3">
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br", tierInfo.gradient)}>
                  <Crown className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1">
                    {tierKey === 'explorer' ? 'Upgrade to Analyst' : 'Upgrade to Alpha'}
                  </h4>
                  <p className="text-xs text-muted-foreground mb-2">
                    {tierMessages.upgrade}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tip for Pro users without personal key */}
          {isPro && !hasPersonalKey && (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Tip:</strong> Personal Gemini API Key ထည့်ပြီး IU ပိုရယူပါ။
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {isFullyExhausted && (
            <Button onClick={handleBuyCredits} className="w-full gap-2">
              <Coins className="h-4 w-4" />
              IU ထပ်ဝယ်ရန်
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          {tierMessages.upgrade && (
            <Button 
              onClick={handleUpgrade} 
              variant={isFullyExhausted ? "outline" : "default"}
              className="w-full gap-2"
            >
              <Crown className="h-4 w-4" />
              Tier Upgrade လုပ်ရန်
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          <Button 
            variant="ghost" 
            onClick={() => onOpenChange(false)}
            className="w-full"
          >
            {isFullyExhausted ? "နက်ဖြန် ပြန်လာပါမယ်" : "နားလည်ပါပြီ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

CreditsExhaustedDialog.displayName = "CreditsExhaustedDialog";
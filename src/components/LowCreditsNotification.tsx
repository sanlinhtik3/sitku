import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Sparkles, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";

interface LowCreditsNotificationProps {
  balance: number;
  isTrialUser: boolean;
}

export const LowCreditsNotification = ({ balance, isTrialUser }: LowCreditsNotificationProps) => {
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  // Reset dismissed state when balance changes
  useEffect(() => {
    setDismissed(false);
  }, [balance]);

  // Show notification when credits are low (3 or less for trial, 5 or less for purchased)
  const threshold = isTrialUser ? 3 : 5;
  const shouldShow = balance > 0 && balance <= threshold && !dismissed;

  if (!shouldShow) return null;

  const isLastCredit = balance === 1;
  const severity = balance <= 2 ? "destructive" : "default";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="mb-4"
      >
        <Alert variant={severity} className="relative">
          <button
            onClick={() => setDismissed(true)}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle className="pr-8">
            {isLastCredit 
              ? "Last Credit Remaining!" 
              : `Only ${balance} Credits Left!`
            }
          </AlertTitle>
          <AlertDescription className="mt-2">
            {isTrialUser ? (
              <div className="space-y-3">
                <p>
                  You're running low on trial credits. Purchase more credits to continue generating amazing content with AI.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button 
                    size="sm" 
                    onClick={() => navigate("/buy-credits")}
                    className="gap-2"
                  >
                    <Sparkles className="h-4 w-4" />
                    Buy Credits Now
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => navigate("/ai-content-pricing")}
                  >
                    View Plans
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p>
                  Your credit balance is running low. Purchase more credits to avoid interruption in your content generation.
                </p>
                <Button 
                  size="sm" 
                  onClick={() => navigate("/buy-credits")}
                  className="gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  Buy More Credits
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      </motion.div>
    </AnimatePresence>
  );
};

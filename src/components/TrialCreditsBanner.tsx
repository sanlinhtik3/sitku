import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";

interface TrialCreditsBannerProps {
  balance: number;
  isTrialUser: boolean;
}

export const TrialCreditsBanner = ({ balance, isTrialUser }: TrialCreditsBannerProps) => {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem("trial-banner-dismissed") === "true";
  });
  const navigate = useNavigate();

  if (!isTrialUser || dismissed || balance === 0) return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("trial-banner-dismissed", "true");
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="mb-6"
      >
        <Card className="border-primary/30 bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-secondary/5 animate-pulse" />
          <CardContent className="p-6 relative">
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
              <div className="p-3 rounded-full bg-primary/20">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              
              <div className="flex-1">
                <h3 className="text-xl font-bold mb-1 flex items-center gap-2">
                  Welcome! You have {balance} Free Trial Credits 🎉
                </h3>
                <p className="text-muted-foreground">
                  Try our AI content writer for free! Generate professional content in seconds using advanced AI technology.
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                <Button 
                  onClick={() => navigate("/admin")}
                  className="gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  Try AI Writer Now
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => navigate("/ai-content-pricing")}
                >
                  Learn More
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
};

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Zap, Target, Brain, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";

interface OnboardingModalProps {
  isTrialUser: boolean;
  balance: number;
}

export const OnboardingModal = ({ isTrialUser, balance }: OnboardingModalProps) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const navigate = useNavigate();

  useEffect(() => {
    // Only show to trial users who haven't seen it before
    const hasSeenOnboarding = localStorage.getItem("has-seen-onboarding");
    if (isTrialUser && !hasSeenOnboarding && balance > 0) {
      // Slight delay for better UX
      setTimeout(() => setOpen(true), 1000);
    }
  }, [isTrialUser, balance]);

  const handleClose = () => {
    setOpen(false);
    localStorage.setItem("has-seen-onboarding", "true");
  };

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      handleClose();
    }
  };

  const handleSkip = () => {
    handleClose();
  };

  const handleTryNow = () => {
    handleClose();
    navigate("/admin");
  };

  const steps = [
    {
      icon: Sparkles,
      title: "Welcome to ZOE CRYPTO!",
      description: "You've received 5 free trial credits to explore our AI content writer",
      content: (
        <div className="space-y-4 py-4">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4">
              <Sparkles className="h-10 w-10 text-primary" />
            </div>
            <Badge className="mb-4 text-lg px-6 py-2">
              {balance} Free Credits
            </Badge>
          </div>
          <p className="text-center text-muted-foreground">
            Each credit lets you generate one piece of professional AI content. No credit card required!
          </p>
        </div>
      ),
    },
    {
      icon: Brain,
      title: "How It Works",
      description: "Generate professional content in 3 simple steps",
      content: (
        <div className="space-y-4 py-4">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
              1
            </div>
            <div>
              <h4 className="font-semibold mb-1">Choose Your Content Type</h4>
              <p className="text-sm text-muted-foreground">
                Blog posts, articles, social media, marketing copy, and more
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
              2
            </div>
            <div>
              <h4 className="font-semibold mb-1">Set Your Preferences</h4>
              <p className="text-sm text-muted-foreground">
                Select tone, style, language, and category
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
              3
            </div>
            <div>
              <h4 className="font-semibold mb-1">Get Quality Content</h4>
              <p className="text-sm text-muted-foreground">
                AI analyzes your knowledge base and generates on-brand content instantly
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      icon: Zap,
      title: "Key Features",
      description: "What makes our AI writer special",
      content: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
          <div className="p-4 rounded-lg bg-card border">
            <Zap className="h-8 w-8 text-primary mb-2" />
            <h4 className="font-semibold mb-1">10x Faster</h4>
            <p className="text-sm text-muted-foreground">
              Generate content in seconds, not hours
            </p>
          </div>
          <div className="p-4 rounded-lg bg-card border">
            <Brain className="h-8 w-8 text-primary mb-2" />
            <h4 className="font-semibold mb-1">Knowledge Base Learning</h4>
            <p className="text-sm text-muted-foreground">
              AI learns from your content library for consistency
            </p>
          </div>
          <div className="p-4 rounded-lg bg-card border">
            <Target className="h-8 w-8 text-primary mb-2" />
            <h4 className="font-semibold mb-1">Quality Scoring</h4>
            <p className="text-sm text-muted-foreground">
              Get quality metrics and improvement suggestions
            </p>
          </div>
          <div className="p-4 rounded-lg bg-card border">
            <Sparkles className="h-8 w-8 text-primary mb-2" />
            <h4 className="font-semibold mb-1">Multiple Languages</h4>
            <p className="text-sm text-muted-foreground">
              Generate content in 50+ languages
            </p>
          </div>
        </div>
      ),
    },
  ];

  const currentStep = steps[step - 1];
  const Icon = currentStep.icon;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Icon className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-2xl">{currentStep.title}</DialogTitle>
          </div>
          <DialogDescription className="text-base">
            {currentStep.description}
          </DialogDescription>
        </DialogHeader>

        {currentStep.content}

        {/* Progress Dots */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {steps.map((_, index) => (
            <div
              key={index}
              className={`h-2 rounded-full transition-all ${
                index + 1 === step
                  ? "w-8 bg-primary"
                  : index + 1 < step
                  ? "w-2 bg-primary/50"
                  : "w-2 bg-muted"
              }`}
            />
          ))}
        </div>

        <div className="flex justify-between gap-3">
          <Button variant="ghost" onClick={handleSkip}>
            Skip Tutorial
          </Button>
          <div className="flex gap-2">
            {step < 3 ? (
              <Button onClick={handleNext} className="gap-2">
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleClose}>
                  Close
                </Button>
                <Button onClick={handleTryNow} className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  Try AI Writer Now
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

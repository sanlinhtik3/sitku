import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  IconBug,
  IconBulb,
  IconAlertTriangle,
  IconMessage,
  IconMoodSad,
  IconHeart,
  IconChevronLeft,
  IconChevronRight,
  IconCheck,
  IconLoader2,
} from "@tabler/icons-react";
import { useFeedback, FeedbackType, FeedbackSeverity } from "@/hooks/useFeedback";
import { cn } from "@/lib/utils";

interface UserFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const feedbackTypes: { type: FeedbackType; label: string; labelMM: string; icon: React.ReactNode; color: string }[] = [
  { type: 'bug', label: 'Bug Report', labelMM: 'Bug တွေ့', icon: <IconBug className="h-6 w-6" />, color: 'text-red-500' },
  { type: 'feature_request', label: 'Feature Request', labelMM: 'Feature တောင်း', icon: <IconBulb className="h-6 w-6" />, color: 'text-yellow-500' },
  { type: 'error', label: 'Error Occurred', labelMM: 'Error တက်', icon: <IconAlertTriangle className="h-6 w-6" />, color: 'text-orange-500' },
  { type: 'feedback', label: 'General Feedback', labelMM: 'အကြံပေး', icon: <IconMessage className="h-6 w-6" />, color: 'text-blue-500' },
  { type: 'complaint', label: 'Complaint', labelMM: 'တိုင်ကြား', icon: <IconMoodSad className="h-6 w-6" />, color: 'text-purple-500' },
  { type: 'praise', label: 'Praise', labelMM: 'ချီးကျူး', icon: <IconHeart className="h-6 w-6" />, color: 'text-pink-500' },
];

const severityLevels: { level: FeedbackSeverity; label: string; color: string }[] = [
  { level: 'low', label: 'Low', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  { level: 'medium', label: 'Medium', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  { level: 'high', label: 'High', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  { level: 'critical', label: 'Critical', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
];

export function UserFeedbackDialog({ open, onOpenChange }: UserFeedbackDialogProps) {
  const [step, setStep] = useState(1);
  const [feedbackType, setFeedbackType] = useState<FeedbackType | null>(null);
  const [severity, setSeverity] = useState<FeedbackSeverity>('medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const { submitFeedback } = useFeedback();

  const resetForm = () => {
    setStep(1);
    setFeedbackType(null);
    setSeverity('medium');
    setTitle('');
    setDescription('');
    setIsSubmitted(false);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(resetForm, 300);
  };

  const handleSubmit = async () => {
    if (!feedbackType || !title || !description) return;

    try {
      await submitFeedback.mutateAsync({
        feedback_type: feedbackType,
        severity,
        title,
        description,
      });
      setIsSubmitted(true);
    } catch (error) {
      // Error handled in hook
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1: return feedbackType !== null;
      case 2: return title.trim().length > 0 && description.trim().length > 0;
      case 3: return true;
      default: return false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg bg-background/95 backdrop-blur-xl border border-border/50">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {isSubmitted ? '✅ Thank You!' : 'Send Feedback'}
          </DialogTitle>
          <DialogDescription>
            {isSubmitted 
              ? 'Your feedback has been submitted successfully.' 
              : 'Help us improve the app by sharing your thoughts.'}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {isSubmitted ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="py-8 text-center"
            >
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                <IconCheck className="h-8 w-8 text-green-500" />
              </div>
              <p className="text-muted-foreground mb-6">
                BeeBot AI ကနေ သင့် feedback ကို analyze လုပ်ပြီး ဖြေရှင်းပေးပါမယ်။
              </p>
              <Button onClick={handleClose}>Close</Button>
            </motion.div>
          ) : (
            <motion.div
              key={`step-${step}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Step 1: Type Selection */}
              {step === 1 && (
                <div className="space-y-3">
                  <Label className="text-sm text-muted-foreground">What type of feedback?</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {feedbackTypes.map((type) => (
                      <button
                        key={type.type}
                        onClick={() => setFeedbackType(type.type)}
                        className={cn(
                          "p-4 rounded-lg border-2 transition-all text-left",
                          "hover:bg-muted/50",
                          feedbackType === type.type
                            ? "border-primary bg-primary/10"
                            : "border-border/50 bg-background/50"
                        )}
                      >
                        <div className={cn("mb-2", type.color)}>{type.icon}</div>
                        <div className="font-medium text-sm">{type.label}</div>
                        <div className="text-xs text-muted-foreground">{type.labelMM}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2: Title & Description */}
              {step === 2 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      placeholder="Brief summary of your feedback..."
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="bg-background/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Please describe in detail..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={5}
                      className="bg-background/50"
                    />
                  </div>
                </div>
              )}

              {/* Step 3: Severity & Review */}
              {step === 3 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Severity</Label>
                    <div className="flex gap-2 flex-wrap">
                      {severityLevels.map((s) => (
                        <Badge
                          key={s.level}
                          variant="outline"
                          className={cn(
                            "cursor-pointer transition-all px-3 py-1",
                            severity === s.level ? s.color : "opacity-50"
                          )}
                          onClick={() => setSeverity(s.level)}
                        >
                          {s.label}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">{feedbackType}</Badge>
                      <Badge variant="outline" className={severityLevels.find(s => s.level === severity)?.color}>
                        {severity}
                      </Badge>
                    </div>
                    <h4 className="font-medium">{title}</h4>
                    <p className="text-sm text-muted-foreground line-clamp-3">{description}</p>
                    <p className="text-xs text-muted-foreground">
                      📍 Page: {window.location.pathname}
                    </p>
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="flex justify-between pt-4 border-t border-border/50">
                <Button
                  variant="ghost"
                  onClick={() => setStep(s => Math.max(1, s - 1))}
                  disabled={step === 1}
                >
                  <IconChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>

                <div className="flex gap-1">
                  {[1, 2, 3].map((s) => (
                    <div
                      key={s}
                      className={cn(
                        "w-2 h-2 rounded-full transition-colors",
                        step >= s ? "bg-primary" : "bg-muted"
                      )}
                    />
                  ))}
                </div>

                {step < 3 ? (
                  <Button
                    onClick={() => setStep(s => s + 1)}
                    disabled={!canProceed()}
                  >
                    Next
                    <IconChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    disabled={submitFeedback.isPending}
                    className="bg-gradient-to-r from-primary to-primary/80"
                  >
                    {submitFeedback.isPending ? (
                      <>
                        <IconLoader2 className="h-4 w-4 mr-1 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <IconCheck className="h-4 w-4 mr-1" />
                        Submit
                      </>
                    )}
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

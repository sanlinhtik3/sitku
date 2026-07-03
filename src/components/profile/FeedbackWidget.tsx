import { useState } from "react";
import { MessageSquareWarning, ChevronRight } from "lucide-react";
import { GlassmorphicCard } from "@/components/ui/FuturisticElements";
import { UserFeedbackDialog } from "@/components/feedback/UserFeedbackDialog";

interface FeedbackWidgetProps {
  className?: string;
}

export function FeedbackWidget({ className }: FeedbackWidgetProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsDialogOpen(true)}
        className={`w-full text-left ${className}`}
      >
        <GlassmorphicCard
          className="p-4 cursor-pointer hover:border-primary/30 transition-all group"
          glow
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                <MessageSquareWarning className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Send Feedback</h3>
                <p className="text-xs text-muted-foreground">
                  Report bugs, suggest features
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </GlassmorphicCard>
      </button>

      <UserFeedbackDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen} 
      />
    </>
  );
}

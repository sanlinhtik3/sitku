import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { IconMessageReport, IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { UserFeedbackDialog } from "./UserFeedbackDialog";

export function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { user } = useAuth();

  // Don't show if user is not logged in
  if (!user) return null;

  return (
    <>
      {/* Floating Button */}
      <div className="fixed bottom-4 right-4 z-50">
        <AnimatePresence>
          {!isDialogOpen && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
            >
              <Button
                onClick={() => setIsDialogOpen(true)}
                size="lg"
                className="rounded-full h-14 w-14 shadow-lg bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 border border-primary/20"
                aria-label="Send Feedback"
              >
                <IconMessageReport className="h-6 w-6" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Feedback Dialog */}
      <UserFeedbackDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen} 
      />
    </>
  );
}

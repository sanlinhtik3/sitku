import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BeeBotChatView } from "./BeeBotChatView";

interface AgentChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  initialMessage?: string;
}

export function AgentChatDialog({ open, onOpenChange, userId, initialMessage }: AgentChatDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className={cn(
          "!inset-0 !translate-x-0 !translate-y-0 !max-w-[calc(100vw-20px)] !w-[calc(100vw-20px)]",
          "!h-[calc(100dvh-20px-env(safe-area-inset-top,0px))] !max-h-[calc(100dvh-20px-env(safe-area-inset-top,0px))]",
          "flex flex-col !p-0 !gap-0 !rounded-glass-container border-border/30 overflow-hidden",
          "[&>button:last-child]:hidden m-[10px] mt-[max(10px,env(safe-area-inset-top,10px))]",
          "pb-[env(safe-area-inset-bottom)] bg-background/95 backdrop-blur-2xl"
        )}
      >
        <BeeBotChatView
          userId={userId}
          open={open}
          onClose={() => onOpenChange(false)}
          initialMessage={initialMessage}
          inDialog
        />
      </DialogContent>
    </Dialog>
  );
}

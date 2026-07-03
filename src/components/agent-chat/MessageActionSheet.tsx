import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Copy, Pencil, RotateCcw, Trash2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface MessageActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The message text used by the Copy action. */
  content: string;
  /** Whether this is a user-authored message. Drives which actions are shown. */
  isUser: boolean;
  /** Whether the message is from a streaming/in-flight reply. Disables destructive actions. */
  isStreaming?: boolean;
  onCopy?: () => void;
  onEdit?: () => void;
  onRegenerate?: () => void;
  onOpenThread?: () => void;
  onDelete?: () => void;
}

interface SheetAction {
  id: string;
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

/**
 * Native-feel bottom sheet of actions for a single chat message.
 *
 * Triggered by long-press on the message bubble. Shows a context-aware list:
 *   - User message: Copy, Edit, Branch (thread), Delete
 *   - Assistant message: Copy, Regenerate, Branch (thread), Delete
 *
 * Each action runs and closes the sheet. Destructive actions get red treatment.
 * Uses the bare `vaul` Drawer (drag-to-dismiss + drag handle baked in) instead
 * of ResponsiveDialog because long-press is mobile-only by definition.
 */
export function MessageActionSheet({
  open,
  onOpenChange,
  content,
  isUser,
  isStreaming = false,
  onCopy,
  onEdit,
  onRegenerate,
  onOpenThread,
  onDelete,
}: MessageActionSheetProps) {
  const close = () => onOpenChange(false);

  const handleCopy = () => {
    if (onCopy) {
      onCopy();
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(content).then(
        () => toast.success("Copied to clipboard"),
        () => toast.error("Could not copy"),
      );
    }
    close();
  };

  const actions: SheetAction[] = [
    { id: "copy", label: "Copy", icon: Copy, onClick: handleCopy },
    ...(isUser && onEdit
      ? [{ id: "edit", label: "Edit message", icon: Pencil, onClick: () => { onEdit(); close(); } }]
      : []),
    ...(!isUser && onRegenerate
      ? [{
          id: "regenerate",
          label: "Regenerate",
          icon: RotateCcw,
          onClick: () => { onRegenerate(); close(); },
          disabled: isStreaming,
        }]
      : []),
    ...(onOpenThread
      ? [{
          id: "thread",
          label: "Branch from here",
          icon: MessageSquare,
          onClick: () => { onOpenThread(); close(); },
        }]
      : []),
    ...(onDelete
      ? [{
          id: "delete",
          label: "Delete",
          icon: Trash2,
          onClick: () => { onDelete(); close(); },
          destructive: true,
          disabled: isStreaming,
        }]
      : []),
  ];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-2 pb-2">
        <DrawerHeader className="pb-2 pt-2">
          <DrawerTitle className="text-sm font-medium text-muted-foreground/80">
            Message actions
          </DrawerTitle>
        </DrawerHeader>

        <div className="flex flex-col gap-1 px-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={action.onClick}
                disabled={action.disabled}
                className={cn(
                  "flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-left",
                  "transition-colors active:scale-[0.98] touch-manipulation",
                  "min-h-[52px]",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  action.destructive
                    ? "text-destructive hover:bg-destructive/10 active:bg-destructive/15"
                    : "text-foreground hover:bg-muted/40 active:bg-muted/60",
                )}
              >
                <Icon className={cn("h-5 w-5 shrink-0", action.destructive && "text-destructive")} />
                <span className="text-base font-medium">{action.label}</span>
              </button>
            );
          })}
        </div>

        {/* Native-style "Cancel" affordance */}
        <button
          onClick={close}
          className={cn(
            "mt-2 mx-2 mb-2 px-4 py-3.5 rounded-xl",
            "bg-muted/40 text-foreground font-medium text-base",
            "transition-colors active:scale-[0.98] touch-manipulation",
            "min-h-[52px]",
          )}
        >
          Cancel
        </button>
      </DrawerContent>
    </Drawer>
  );
}

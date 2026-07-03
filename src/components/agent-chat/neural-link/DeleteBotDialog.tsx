import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, AlertTriangle } from "lucide-react";

interface DeleteBotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  botName: string;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}

export function DeleteBotDialog({ open, onOpenChange, botName, onConfirm, isDeleting }: DeleteBotDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <AlertDialogTitle>Delete Bot</AlertDialogTitle>
              <AlertDialogDescription className="text-xs">This action cannot be undone</AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <div className="py-3">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <span className="font-medium text-foreground">"{botName}"</span>? All chat logs and settings will be permanently removed.
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={async (e) => { e.preventDefault(); await onConfirm(); onOpenChange(false); }}
            disabled={isDeleting}
            className="bg-red-500 hover:bg-red-600 gap-2"
          >
            {isDeleting ? <><Loader2 className="h-4 w-4 animate-spin" />Deleting...</> : 'Delete Bot'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

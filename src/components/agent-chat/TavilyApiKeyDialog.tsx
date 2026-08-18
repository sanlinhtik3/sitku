import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Globe } from "lucide-react";
import { TavilyApiKeyControl } from "@/components/settings/TavilyApiKeyControl";

interface TavilyApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

export function TavilyApiKeyDialog({ open, onOpenChange }: TavilyApiKeyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border/30">
        <DialogHeader className="pb-4">
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Globe className="h-5 w-5 text-emerald-400" />
            E.V Tavily Web Search
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            E.V ရဲ့ local real-time search ကို device-secure Tavily provider နဲ့ ချိတ်ဆက်ပါ။
            Cloud Agent Chat credentials ကို ဒီနေရာက မပြောင်းပါ။
          </DialogDescription>
        </DialogHeader>

        <TavilyApiKeyControl compact />
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Bot, Sparkles, Loader2, TrendingUp, Headphones, Newspaper, Users, MessageSquare, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreateBotModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, description: string) => Promise<void>;
  isCreating: boolean;
}

const presetBots = [
  { name: "Trading Bot", description: "Crypto & trading signals assistant", icon: TrendingUp, color: "from-green-500 to-emerald-500" },
  { name: "Customer Support", description: "Handles customer inquiries 24/7", icon: Headphones, color: "from-blue-500 to-cyan-500" },
  { name: "News Bot", description: "Shares daily news updates", icon: Newspaper, color: "from-purple-500 to-pink-500" },
  { name: "Community Manager", description: "Engages and moderates groups", icon: Users, color: "from-orange-500 to-amber-500" },
  { name: "Chat Assistant", description: "General purpose AI helper", icon: MessageSquare, color: "from-indigo-500 to-violet-500" },
  { name: "Q&A Bot", description: "Answers FAQs automatically", icon: HelpCircle, color: "from-teal-500 to-cyan-500" },
];

export function CreateBotModal({ open, onOpenChange, onCreate, isCreating }: CreateBotModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onCreate(name.trim(), description.trim());
    setName("");
    setDescription("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-lg">Create New Bot</DialogTitle>
              <DialogDescription className="text-xs">Set up a new AI-powered Telegram bot</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> Quick Start Templates
          </Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {presetBots.map((preset) => {
              const Icon = preset.icon;
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => { setName(preset.name); setDescription(preset.description); }}
                  className={cn(
                    "p-2.5 rounded-xl border text-left transition-all",
                    name === preset.name ? "border-primary bg-primary/5 shadow-sm" : "border-border/50 hover:border-primary/30 hover:bg-muted/30"
                  )}
                >
                  <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center mb-1.5 bg-gradient-to-br", preset.color)}>
                    <Icon className="h-3.5 w-3.5 text-white" />
                  </div>
                  <p className="text-[11px] font-medium truncate">{preset.name}</p>
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm">Bot Name</Label>
            <Input id="name" placeholder="e.g., My Trading Bot" value={name} onChange={(e) => setName(e.target.value)} className="h-10" required maxLength={50} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm">Description (optional)</Label>
            <Textarea id="description" placeholder="What does this bot do?" value={description} onChange={(e) => setDescription(e.target.value)} className="resize-none h-20" maxLength={200} />
            <p className="text-[10px] text-muted-foreground">{description.length}/200</p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={isCreating}>Cancel</Button>
            <Button type="submit" className="flex-1 gap-2" disabled={!name.trim() || isCreating}>
              {isCreating ? <><Loader2 className="h-4 w-4 animate-spin" />Creating...</> : <><Bot className="h-4 w-4" />Create Bot</>}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

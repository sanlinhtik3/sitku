import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Plus, Brain } from "lucide-react";
import { SuggestedPromptsGrid } from "../SuggestedPrompts";

interface EmptySessionStateProps {
  botName: string;
  botEmoji: string;
  hasSession: boolean;
  onCreateSession: () => Promise<void>;
  onSendMessage?: (message: string) => void;
  /**
   * "general" — full BeeBot empty state with action chips & Start button.
   * "memory"  — Memory Curator only. No generic prompts, no Start CTA,
   *             no example chips. Hero only.
   */
  mode?: "general" | "memory";
}

export function EmptySessionState({
  botName,
  botEmoji,
  hasSession,
  onCreateSession,
  onSendMessage,
  mode = "general",
}: EmptySessionStateProps) {
  const handlePrompt = async (prompt: string) => {
    if (!hasSession) await onCreateSession();
    onSendMessage?.(prompt);
  };

  // ── Memory-only empty state ────────────────────────────────────────
  if (mode === "memory") {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="text-center max-w-md w-full space-y-5"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="p-2.5 rounded-full bg-gradient-to-br from-primary/25 to-primary/5 border border-primary/30">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">
                Memory Curator
              </h2>
              <p className="text-xs text-muted-foreground/80 leading-relaxed max-w-xs mx-auto">
                Preferences, facts, goals, schedule, rules — ဘာမဆို ရိုက်ပါ။
                Memory အဖြစ် save / dedupe / promote လုပ်ပေးပါမယ်။
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── General BeeBot empty state (unchanged) ─────────────────────────
  return (
    <div className="flex-1 min-h-0 flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="text-center max-w-lg w-full space-y-8"
      >
        {/* Manus-style Hero Heading */}
        <div className="space-y-3">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-foreground/60 bg-clip-text text-transparent">
            ဘာကူညီပေးရမလဲ?
          </h2>
          <p className="text-sm text-muted-foreground/70 max-w-xs mx-auto leading-relaxed">
            {botName} {botEmoji} — သင့်အလုပ်တွေကို အဆင့်ဆင့် ကူညီဆောင်ရွက်ပေးနိုင်ပါတယ်။
          </p>
        </div>

        {/* Action Chips */}
        {onSendMessage && (
          <SuggestedPromptsGrid onSend={handlePrompt} />
        )}

        {!hasSession && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <Button
              onClick={onCreateSession}
              size="sm"
              className="gap-2 bg-primary/80 hover:bg-primary/90 text-primary-foreground backdrop-blur-sm border border-primary/30"
            >
              <Plus className="h-3.5 w-3.5" />
              Start Conversation
            </Button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

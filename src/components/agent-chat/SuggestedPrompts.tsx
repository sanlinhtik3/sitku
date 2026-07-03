/**
 * SuggestedPrompts — Manus-style horizontal action chips
 */

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface Prompt {
  emoji: string;
  label: string;
  prompt: string;
}

const ACTION_PROMPTS: Prompt[] = [
  { emoji: "✍️", label: "Content ရေးပေး", prompt: "ကျွန်တော်/ကျွန်မအတွက် ဆွဲဆောင်မှုရှိတဲ့ Facebook caption တစ်ခု ရေးပေးပါ။" },
  { emoji: "💰", label: "FlowState စစ်ပေး", prompt: "ကျွန်တော်/ကျွန်မရဲ့ ဒီလ ငွေကြေးအနေအထားကို စစ်ပေးပါ။" },
  { emoji: "🔍", label: "Search", prompt: "ဒီနေ့ crypto နဲ့ AI နယ်ပယ်မှာ ဘာတွေ ဖြစ်နေလဲ ရှာဖွေပေးပါ။" },
  { emoji: "📝", label: "Article", prompt: "ကျွန်တော်/ကျွန်မ တတ်ကျွမ်းတဲ့ နယ်ပယ်တစ်ခုအတွက် professional blog post တစ်ပုဒ် ရေးပေးပါ။" },
  { emoji: "🧠", label: "Memory", prompt: "ကျွန်တော်/ကျွန်မ အကြောင်း ဘာတွေ မှတ်မိနေလဲ ပြောပေးပါ။" },
];

// ── Horizontal Chip Row (Manus-style) ────────────────────────────────────────

interface SuggestedPromptsGridProps {
  onSend: (prompt: string) => void;
}

export function SuggestedPromptsGrid({ onSend }: SuggestedPromptsGridProps) {
  return (
    <div className="flex flex-wrap justify-center gap-2 w-full max-w-md mx-auto">
      {ACTION_PROMPTS.map((p, i) => (
        <motion.button
          key={p.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, type: "spring", stiffness: 300, damping: 30 }}
          onClick={() => onSend(p.prompt)}
          className={cn(
            "flex items-center gap-1.5 px-3.5 py-2 rounded-full",
            "bg-muted/15 hover:bg-muted/30",
            "border border-border/25 hover:border-border/50",
            "text-xs font-medium text-foreground/80 hover:text-foreground",
            "transition-all duration-200 cursor-pointer",
            "hover:shadow-sm hover:shadow-primary/5",
          )}
        >
          <span className="text-sm">{p.emoji}</span>
          <span>{p.label}</span>
        </motion.button>
      ))}
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { ArrowRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface FollowUpChipsProps {
  lastMessage: string;
  onSelect: (prompt: string) => void;
  className?: string;
}

// Simple cache to avoid re-fetching for same content
const suggestionCache = new Map<string, string[]>();

export function FollowUpChips({ lastMessage, onSelect, className }: FollowUpChipsProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!lastMessage || lastMessage.length < 30) {
      setSuggestions([]);
      return;
    }

    const cacheKey = lastMessage.slice(0, 200);

    // Check cache first
    if (suggestionCache.has(cacheKey)) {
      setSuggestions(suggestionCache.get(cacheKey)!);
      return;
    }

    // Abort previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);

    const timer = setTimeout(async () => {
      try {
        const { data } = await supabase.functions.invoke("suggest-followups", {
          body: { content: lastMessage.slice(0, 600) },
        });

        if (controller.signal.aborted) return;

        if (data?.suggestions && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          const valid = data.suggestions
            .slice(0, 3)
            .map((s: string) => s.trim())
            .filter(Boolean);
          setSuggestions(valid);
          suggestionCache.set(cacheKey, valid);
          // Keep cache small
          if (suggestionCache.size > 20) {
            const firstKey = suggestionCache.keys().next().value;
            if (firstKey) suggestionCache.delete(firstKey);
          }
        } else {
          setSuggestions([]);
        }
      } catch {
        if (!controller.signal.aborted) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 400);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [lastMessage]);

  if (suggestions.length === 0 && !isLoading) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.3 }}
      className={cn("flex flex-wrap gap-1.5 mt-1.5 sm:ml-8", className)}
    >
      {isLoading && suggestions.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground/40"
        >
          <Sparkles className="h-3 w-3 animate-pulse" />
          <span className="animate-pulse">ဆက်မေးစရာတွေ ရှာနေတယ်...</span>
        </motion.div>
      )}
      {suggestions.map((s, i) => (
        <motion.button
          key={`llm-${i}-${s.slice(0, 10)}`}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 + i * 0.08 }}
          onClick={() => {
            navigator.vibrate?.(3);
            onSelect(s);
          }}
          className={cn(
            "group flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs",
            "bg-card/40 border border-border/25 backdrop-blur-sm",
            "text-muted-foreground hover:text-foreground",
            "hover:border-primary/30 hover:bg-primary/5",
            "transition-all duration-200",
            "active:scale-95",
          )}
        >
          <Sparkles className="h-2.5 w-2.5 text-primary/40 shrink-0" />
          <span className="truncate max-w-[220px]">{s}</span>
          <ArrowRight className="h-3 w-3 shrink-0 opacity-0 -translate-x-1 group-hover:opacity-70 group-hover:translate-x-0 transition-all duration-200" />
        </motion.button>
      ))}
    </motion.div>
  );
}

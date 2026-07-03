import { memo, useState, useEffect } from "react";
import { motion } from "motion/react";
import { Image as ImageIcon, Sparkles, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolRendererProps } from "./types";

/**
 * Inline preview for `generate_image` while it's running. Shows a shimmering
 * placeholder + the prompt + an animated dot ticker so the user knows the
 * agent is actively working on the image. Once complete, displays the result
 * with progressive blur-up reveal.
 *
 * Note: the post-generation rich card with metadata + fullscreen modal is
 * still rendered separately by `GeneratedImageCard` from the message content
 * detector. This card covers the *running* state — the gap that currently
 * shows "Generating image..." in plain text.
 */
export const ImageGenInlineCard = memo(function ImageGenInlineCard({
  status,
  result,
  args,
}: ToolRendererProps) {
  const prompt = (args?.prompt as string) || "";
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (status !== "running" && status !== "pending") return;
    const id = setInterval(() => setTick((t) => (t + 1) % 4), 600);
    return () => clearInterval(id);
  }, [status]);

  if (status === "running" || status === "pending") {
    const dots = ".".repeat(tick + 1);
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="rounded-xl border border-pink-500/20 overflow-hidden bg-gradient-to-br from-pink-500/[0.07] via-purple-500/[0.04] to-transparent"
      >
        <div className="aspect-video w-full max-w-md relative overflow-hidden bg-black/30">
          {/* Shimmer wash */}
          <div className="absolute inset-0">
            <div
              className="absolute inset-0 -translate-x-full animate-[shimmer_2.4s_infinite]"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, hsl(330 100% 75% / 0.10) 40%, hsl(280 100% 75% / 0.18) 50%, hsl(330 100% 75% / 0.10) 60%, transparent 100%)",
              }}
            />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="relative">
                <ImageIcon className="h-8 w-8 text-pink-300/50" />
                <Sparkles className="absolute -top-1 -right-1 h-3.5 w-3.5 text-pink-300 animate-pulse" />
              </div>
              <div className="text-[11px] text-pink-200/75 font-medium tabular-nums">
                Painting{dots}
              </div>
            </div>
          </div>
        </div>
        {prompt && (
          <div className="px-3 py-2 border-t border-pink-500/15 bg-black/15">
            <div className="text-[10px] uppercase tracking-wider text-pink-400/70 mb-0.5">Prompt</div>
            <p className="text-[11px] text-foreground/85 line-clamp-2 italic leading-relaxed">"{prompt}"</p>
          </div>
        )}
      </motion.div>
    );
  }

  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;

  if (r.error) {
    return (
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
        <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
        <div className="text-[11px] text-red-300/85">
          Image generation failed: {String(r.error).slice(0, 120)}
        </div>
      </div>
    );
  }

  // Skipped duplicate
  if (r.skipped) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/20 border border-border/20 text-[11px] text-muted-foreground/70">
        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground/60" />
        Image already generated for this prompt.
      </div>
    );
  }

  // Success — only render a slim "image ready" pointer; the actual rich card
  // is mounted via the message's content detector (GeneratedImageCard).
  if (r.success && r.image_url) {
    return (
      <ImageReady prompt={prompt} model={r.model_used as string | undefined} />
    );
  }

  return null;
});

const ImageReady = memo(function ImageReady({ prompt, model }: { prompt: string; model?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg",
        "bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-pink-500/20",
      )}
    >
      <Sparkles className="h-3.5 w-3.5 text-pink-300 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-pink-200/90">
          Image ready{model && <span className="text-muted-foreground/60"> · {model}</span>}
        </div>
        {prompt && <div className="text-[10px] text-muted-foreground/55 truncate italic">"{prompt}"</div>}
      </div>
    </motion.div>
  );
});

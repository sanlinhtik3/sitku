import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Magnifer as Search, TestTube as FlaskConical, BranchingPathsDown as GitCompare, Global as Globe, Bolt as Zap, Document as FileText, Gallery as ImageIcon, Calendar as CalendarClock } from "@solar-icons/react";
import { cn } from "@/lib/utils";

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  prefix: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { id: "research", label: "Research", description: "Deep research on any topic", icon: <Search className="h-3.5 w-3.5" />, prefix: "🔍 Research: " },
  { id: "analyze", label: "Analyze", description: "Analyze data, trends, or content", icon: <FlaskConical className="h-3.5 w-3.5" />, prefix: "📊 Analyze: " },
  { id: "compare", label: "Compare", description: "Compare options side by side", icon: <GitCompare className="h-3.5 w-3.5" />, prefix: "⚖️ Compare: " },
  { id: "summarize", label: "Summarize", description: "Summarize long content or articles", icon: <FileText className="h-3.5 w-3.5" />, prefix: "📝 Summarize: " },
  { id: "web", label: "Web Search", description: "Search the web for latest info", icon: <Globe className="h-3.5 w-3.5" />, prefix: "🌐 Web search: " },
  { id: "quick", label: "Quick Answer", description: "Fast, concise response", icon: <Zap className="h-3.5 w-3.5" />, prefix: "⚡ Quick: " },
  { id: "image", label: "Image", description: "Generate an image from a prompt", icon: <ImageIcon className="h-3.5 w-3.5" />, prefix: "🎨 Generate image: " },
  { id: "schedule", label: "Schedule", description: "Schedule a recurring task", icon: <CalendarClock className="h-3.5 w-3.5" />, prefix: "⏰ Schedule: " },
];

interface SlashCommandMenuProps {
  filter: string;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

export function SlashCommandMenu({ filter, onSelect, onClose }: SlashCommandMenuProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(filter.toLowerCase()) ||
      cmd.id.includes(filter.toLowerCase())
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [filter]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (filtered[activeIndex]) {
          navigator.vibrate?.(3);
          onSelect(filtered[activeIndex]);
        }
      }
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filtered, activeIndex, onSelect, onClose]);

  if (filtered.length === 0) return null;

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "absolute bottom-full left-0 right-0 mb-2 z-50",
        "max-w-3xl mx-auto",
        "bg-card/80 backdrop-blur-2xl",
        "border border-border/30 rounded-xl",
        "shadow-2xl shadow-black/20",
        "overflow-hidden",
      )}
    >
      <div className="px-3 py-2 border-b border-border/20">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">Agent Commands</p>
      </div>
      <div className="py-1 max-h-[280px] overflow-y-auto">
        {filtered.map((cmd, idx) => (
          <button
            key={cmd.id}
            onClick={() => {
              navigator.vibrate?.(3);
              onSelect(cmd);
            }}
            onMouseEnter={() => setActiveIndex(idx)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
              idx === activeIndex
                ? "bg-primary/10 text-foreground"
                : "text-muted-foreground hover:bg-muted/30",
            )}
          >
            <div className={cn(
              "shrink-0 w-7 h-7 rounded-lg flex items-center justify-center",
              idx === activeIndex ? "bg-primary/20 text-primary" : "bg-muted/40",
            )}>
              {cmd.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">/{cmd.id}</p>
              <p className="text-[11px] text-muted-foreground/70 truncate">{cmd.description}</p>
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

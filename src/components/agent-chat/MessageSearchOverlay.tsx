// ═══ In-session message search overlay ═══
// Cmd-F / Ctrl-F overlay. Searches the active session's loaded messages.
// Renders the input + match counter + nav. Match highlighting happens
// via the `searchQuery` prop threaded down to ChatMessage which wraps
// matches in <mark data-search-match>.
import { memo, useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageSearchOverlayProps {
  open: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
  scrollContainerRef: React.RefObject<HTMLElement>;
}

export const MessageSearchOverlay = memo(function MessageSearchOverlay({
  open,
  query,
  onQueryChange,
  onClose,
  scrollContainerRef,
}: MessageSearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [matchCount, setMatchCount] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  // Focus input when opened.
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Recount matches whenever the query changes or matches in the DOM update.
  useEffect(() => {
    if (!open || !query.trim()) {
      setMatchCount(0);
      setActiveIndex(0);
      return;
    }
    const count = () => {
      const matches = scrollContainerRef.current?.querySelectorAll("[data-search-match]") || [];
      setMatchCount(matches.length);
      setActiveIndex(matches.length > 0 ? 1 : 0);
      // Scroll to first match
      if (matches.length > 0) {
        (matches[0] as HTMLElement).scrollIntoView({ block: "center", behavior: "smooth" });
        markActive(matches, 0);
      }
    };
    // Defer one frame so React has rendered the highlights.
    const id = requestAnimationFrame(count);
    return () => cancelAnimationFrame(id);
  }, [open, query, scrollContainerRef]);

  function markActive(matches: NodeListOf<Element> | Element[], idx: number) {
    Array.from(matches).forEach((el, i) => {
      if (i === idx) (el as HTMLElement).dataset.searchActive = "true";
      else delete (el as HTMLElement).dataset.searchActive;
    });
  }

  const goNext = () => {
    const matches = scrollContainerRef.current?.querySelectorAll("[data-search-match]");
    if (!matches || matches.length === 0) return;
    const next = (activeIndex % matches.length) + 1;
    setActiveIndex(next);
    const el = matches[next - 1] as HTMLElement;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    markActive(matches, next - 1);
  };

  const goPrev = () => {
    const matches = scrollContainerRef.current?.querySelectorAll("[data-search-match]");
    if (!matches || matches.length === 0) return;
    const next = activeIndex === 1 ? matches.length : activeIndex - 1;
    setActiveIndex(next);
    const el = matches[next - 1] as HTMLElement;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    markActive(matches, next - 1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "Enter") { e.preventDefault(); e.shiftKey ? goPrev() : goNext(); }
  };

  if (!open) return null;

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2 py-1.5 rounded-full bg-card/90 backdrop-blur-xl border border-border/40 shadow-lg">
      <Search className="h-3.5 w-3.5 text-muted-foreground/70 ml-1" aria-hidden="true" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search this chat..."
        aria-label="Search this chat"
        className="bg-transparent border-none outline-none text-sm w-44 sm:w-56 placeholder:text-muted-foreground/50"
      />
      <span className={cn(
        "text-[11px] tabular-nums px-1.5",
        matchCount === 0 && query.trim() ? "text-amber-500" : "text-muted-foreground/70",
      )}>
        {query.trim() ? (matchCount > 0 ? `${activeIndex}/${matchCount}` : "0") : ""}
      </span>
      <button
        onClick={goPrev}
        disabled={matchCount === 0}
        className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted/40 disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Previous match"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={goNext}
        disabled={matchCount === 0}
        className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted/40 disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Next match"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onClose}
        className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted/40"
        aria-label="Close search"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
});

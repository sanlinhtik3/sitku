import { useState } from "react";
import { AltArrowRight, Star, Folder, Document, CloseSquare } from "@solar-icons/react";
import { cn } from "@/lib/utils";
import type { VaultEntry } from "@/repositories/contracts/notes";

interface BookmarksSectionProps {
  entries: VaultEntry[];
  onOpenNote: (path: string) => void;
  onRevealFolder: (path: string) => void;
  onToggleBookmark: (entry: VaultEntry) => void;
}

// Collapsible bookmarks list. Owns its own open/closed state (was `bookmarksOpen` in the host —
// nothing else read it). Renders nothing when there are no bookmarks.
export function BookmarksSection({ entries, onOpenNote, onRevealFolder, onToggleBookmark }: BookmarksSectionProps) {
  const [bookmarksOpen, setBookmarksOpen] = useState(true);
  if (entries.length === 0) return null;
  return (
    <div className="shrink-0 px-2.5 pt-2 pb-2.5 border-b border-[rgba(255,255,255,0.05)]">
      <button
        onClick={() => setBookmarksOpen((value) => !value)}
        className="w-full h-7 px-2 flex items-center gap-1.5 font-semibold text-[10.5px] uppercase tracking-[0.09em] text-[#7a7a7c] hover:text-[#ededed] transition-colors duration-[130ms] select-none text-left"
      >
        <AltArrowRight className={cn("h-3 w-3 shrink-0 transition-transform duration-[180ms]", bookmarksOpen && "rotate-90")} />
        <Star weight="bold" className="h-3 w-3 shrink-0 text-[var(--beebot-accent)]" />
        Bookmarks
      </button>
      {bookmarksOpen && (
        <div className="mt-0.5 space-y-0.5 max-h-44 overflow-y-auto">
          {entries.map((entry) => (
            <div key={entry.path} className="group flex items-center h-8 pl-2 pr-1 rounded-[9px] text-[12.5px] text-[#9b9b9d] hover:bg-[#1a1a1c] hover:text-[#ededed] transition-colors duration-[140ms]">
              <button
                className="min-w-0 flex-1 flex items-center gap-1.5 text-left"
                onClick={() => (entry.kind === "folder" ? onRevealFolder(entry.path) : onOpenNote(entry.path))}
              >
                {entry.kind === "folder" ? <Folder className="h-3.5 w-3.5 shrink-0 text-[#9b9b9d]" /> : <Document className="h-3.5 w-3.5 shrink-0 text-[#7a7a7c]" />}
                <span className="truncate">{entry.title || entry.name}</span>
              </button>
              <button
                className="h-5 w-5 shrink-0 rounded inline-flex items-center justify-center text-[#9b9b9d] opacity-0 transition-opacity duration-[140ms] group-hover:opacity-100 hover:bg-[#1a1a1c] hover:text-[#ededed]"
                onClick={() => onToggleBookmark(entry)}
                aria-label="Remove bookmark"
              >
                <CloseSquare className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

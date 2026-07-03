// Backlinks panel — slides in below the editor when `open` is true. Shows the
// notes that link to the active note, with a snippet preview, and lets the user
// jump to a backlink. Self-contained: owns no host state, just renders from the
// already-computed `backlinks` list. Extracted verbatim from KnowledgeWorkspacePage.
import { memo } from "react";
import { CloseSquare as X, Document as FileText } from "@solar-icons/react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { NoteFile } from "@/repositories/contracts/notes";

// Mirrors the host's titleFromPath — strips the dir + .md extension.
function titleFromPath(notePath: string) {
  return notePath.split("/").pop()?.replace(/\.md$/i, "") || notePath;
}

export interface BacklinkEntry {
  from: NoteFile;
  snippet: string;
}

interface BacklinksPaneProps {
  open: boolean;
  activeNote: NoteFile | null;
  backlinks: BacklinkEntry[];
  onClose: () => void;
  onOpenNote: (path: string) => void;
}

export const BacklinksPane = memo(function BacklinksPane({
  open,
  activeNote,
  backlinks,
  onClose,
  onOpenNote,
}: BacklinksPaneProps) {
  if (!open || !activeNote) return null;
  return (
    <div className="shrink-0 max-h-[40%] bg-[var(--bb-bg-0)]">
      <div className="px-4 md:px-5 py-2.5 flex items-center justify-between text-xs">
        <span className="text-[var(--bb-text-3)]">
          <span className="font-medium text-[var(--bb-text-1)]">{backlinks.length}</span>{" "}
          {backlinks.length === 1 ? "backlink" : "backlinks"} to{" "}
          <span className="text-[var(--bb-text-1)]">{activeNote.title || titleFromPath(activeNote.path)}</span>
        </span>
        <button
          onClick={onClose}
          className="text-[var(--bb-text-4)] hover:text-[var(--bb-text-1)] transition-colors"
          aria-label="Close backlinks"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <ScrollArea className="max-h-[40vh]">
        <div className="px-3 md:px-4 pb-3 space-y-1">
          {backlinks.length === 0 ? (
            <div className="px-2 py-6 text-center text-[12px] text-[var(--bb-text-4)]">No notes link here yet.</div>
          ) : (
            backlinks.map(({ from, snippet }) => (
              <button
                key={from.path}
                onClick={() => onOpenNote(from.path)}
                className="w-full text-left rounded-lg border border-[var(--bb-border)] bg-[var(--bb-bg-2)] hover:bg-[var(--bb-bg-3)] hover:border-[var(--bb-border-strong)] px-3 py-2 transition-colors"
              >
                <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--bb-text-1)]">
                  <FileText className={cn("h-3.5 w-3.5 shrink-0 text-[var(--bb-text-4)]")} />
                  <span className="truncate">{from.title || titleFromPath(from.path)}</span>
                </div>
                {snippet && <div className="mt-1 text-[11.5px] leading-5 text-[var(--bb-text-3)] line-clamp-2">{snippet}</div>}
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
});

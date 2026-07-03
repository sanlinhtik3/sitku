import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import changelog from "../../CHANGELOG.md?raw";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// The changelog file is the source of truth. Opened on demand via the #whats-new
// hash (Settings → What's New) — never auto-opened.
// Drop the file's H1 title + dev-facing intro; users only see version sections.
const sectionStart = changelog.search(/^##\s/m);
const body = sectionStart >= 0 ? changelog.slice(sectionStart) : changelog;

export function WhatsNewDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onHash = () => { if (window.location.hash === "#whats-new") setOpen(true); };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const close = () => {
    setOpen(false);
    if (window.location.hash === "#whats-new") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto bg-[var(--bb-bg-1)] text-[var(--bb-text-1)] border-[var(--bb-border-strong)]">
        <DialogHeader>
          <DialogTitle>What's New</DialogTitle>
          {/* ponytail: 1-line external announcement landmark for offline-first web sync */}
          <a href="https://sitku.space/changelog" target="_blank" rel="noreferrer" className="text-xs text-[var(--bb-text-2)] hover:text-primary underline transition-colors w-fit">
            Read full release notes & web announcements on sitku.space ↗
          </a>
        </DialogHeader>
        <div className="prose prose-sm prose-invert max-w-none text-[var(--bb-text-2)] [&_h2]:text-[var(--bb-text-1)] [&_h3]:text-[var(--bb-text-1)] [&_strong]:text-[var(--bb-text-1)]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        </div>
      </DialogContent>
    </Dialog>
  );
}

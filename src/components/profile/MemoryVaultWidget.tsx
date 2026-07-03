// ═══ Memory Vault Widget ═══
// Two-section Memory tab:
//  1. Memory Vault — read-only viewer + import/export/add/delete
//  2. Memory Agent — single always-on autonomous BeeBot chat (separate component)
//
// No quick-prompt pills, no "Discuss" button, no training cards. The user
// just types into the Memory Agent and BeeBot autonomously parses, classifies,
// and calls `manage_memory` on its own.

import { useState, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUserMemories, generateMarkdownContent, MemoryEntry } from "@/hooks/useUserMemories";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sparkles,
  FileText,
  Eye,
  Code,
  Copy,
  Check,
  Star,
  Upload,
  Download,
  Plus,
  Trash2,
  BookOpen,
  DatabaseZap,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ImportMemoriesDialog } from "./memory/ImportMemoriesDialog";
import { ExportMemoriesDialog } from "./memory/ExportMemoriesDialog";
import { AddMemoryDialog } from "./memory/AddMemoryDialog";
import { MemoryAgentChat } from "./memory/MemoryAgentChat";

type ViewMode = "preview" | "raw";

function getFileDisplay(fileName: string) {
  const parts = fileName.split("/");
  return {
    name: parts[parts.length - 1] || fileName,
    folder: parts.length > 1 ? parts.slice(0, -1).join("/") : "",
  };
}

export const MemoryVaultWidget = () => {
  const { user } = useAuth();
  const {
    memoryFiles,
    totalCount,
    isLoading,
    createMemory,
    deleteMemory,
    importMemories,
  } = useUserMemories(user?.id);
  const isMobile = useIsMobile();

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [copied, setCopied] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<MemoryEntry | null>(null);

  const activeFile = useMemo(() => {
    if (!memoryFiles.length) return null;
    const target = selectedFile || memoryFiles[0]?.fileName;
    return memoryFiles.find((f) => f.fileName === target) || memoryFiles[0];
  }, [memoryFiles, selectedFile]);

  const markdownContent = useMemo(
    () => (activeFile ? generateMarkdownContent(activeFile) : ""),
    [activeFile]
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdownContent);
      setCopied(true);
      toast.success("Copied");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Failed to copy");
    }
  }, [markdownContent]);

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmDelete) return;
    try {
      await deleteMemory.mutateAsync(confirmDelete.id);
      toast.success("Memory removed");
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete");
    } finally {
      setConfirmDelete(null);
    }
  }, [confirmDelete, deleteMemory]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[300px] w-full rounded-2xl" />
      </div>
    );
  }

  // ── Header actions (inline JSX, no nested component) ──
  const headerActions = (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => setShowImport(true)}
        className="p-1.5 rounded-lg text-muted-foreground/70 hover:text-primary hover:bg-primary/10 transition-all duration-200"
        aria-label="Import memory"
        title="Import"
      >
        <Upload className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => setShowExport(true)}
        disabled={!memoryFiles.length}
        className="p-1.5 rounded-lg text-muted-foreground/70 hover:text-primary hover:bg-primary/10 transition-all duration-200 disabled:opacity-30"
        aria-label="Export memory"
        title="Export"
      >
        <Download className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => setShowAdd(true)}
        className="p-1.5 rounded-lg text-primary hover:bg-primary/15 transition-all duration-200"
        aria-label="Add memory"
        title="Add memory"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  // ── Empty state ──
  if (!memoryFiles.length) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 mb-4">
            <Sparkles className="h-10 w-10 text-primary/40" />
          </div>
          <h3 className="text-sm font-semibold">MEMORY.md is empty</h3>
          <p className="text-xs text-muted-foreground/70 mt-1 max-w-[260px]">
            Memory Agent ထဲမှာ ဘာမဆို ရိုးရိုးရေးလိုက်ပါ — BeeBot က သူ့ဘာသာ memory အဖြစ် save လုပ်ပေးပါမယ်။
          </p>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] bg-card/40 hover:bg-card/60 border border-border/30 transition-colors"
            >
              <Upload className="h-3 w-3" /> Import
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] bg-primary/15 text-primary hover:bg-primary/20 transition-colors"
            >
              <Plus className="h-3 w-3" /> Add memory
            </button>
          </div>
        </div>

        {/* Autonomous Memory Agent — always available */}
        <MemoryAgentChat />

        <ImportMemoriesDialog
          open={showImport}
          onOpenChange={setShowImport}
          onImport={async (items) => importMemories.mutateAsync(items)}
        />
        <AddMemoryDialog
          open={showAdd}
          onOpenChange={setShowAdd}
          onSubmit={async (input) => {
            await createMemory.mutateAsync(input);
          }}
        />
      </div>
    );
  }

  const lastUpdated = memoryFiles.reduce(
    (latest, f) => (f.lastUpdated > latest ? f.lastUpdated : latest),
    ""
  );

  const memoryControlCard = (
    <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-card/25 to-card/10 px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          <DatabaseZap className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-foreground">BeeBot Memory Control</div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            BeeBot can read, write, edit, update, delete, optimize, and analyze Memory Vault records.
            <span className="text-foreground/80"> MEMORY.md</span> stays portable; daily logs stay date-organized.
          </p>
        </div>
      </div>
    </div>
  );

  // ── Viewer header (inline JSX) ──
  const viewerHeader = (
    <div className="flex items-center justify-between px-3 py-2 border-b border-border/15 bg-card/10 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {activeFile?.pinned && <Star className="h-3 w-3 text-primary fill-current shrink-0" />}
        <span className="text-[11px] font-mono text-muted-foreground truncate">
          {activeFile?.fileName}
        </span>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={() => setViewMode("preview")}
          className={cn(
            "p-1.5 rounded-lg transition-colors",
            viewMode === "preview"
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground/50 hover:text-muted-foreground"
          )}
          title="Preview"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setViewMode("raw")}
          className={cn(
            "p-1.5 rounded-lg transition-colors",
            viewMode === "raw"
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground/50 hover:text-muted-foreground"
          )}
          title="Raw markdown"
        >
          <Code className="h-3.5 w-3.5" />
        </button>
        <div className="w-px h-4 bg-border/20 mx-1" />
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          title="Copy"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );

  // ── Viewer body (inline JSX) ──
  const viewerBody = (
    <div className="p-3">
      {activeFile?.description && (
        <div className="mb-3 px-2 py-2 rounded-lg bg-primary/5 border border-primary/10 text-[11px] text-muted-foreground italic">
          {activeFile.description}
        </div>
      )}
      {viewMode === "preview" ? (
        <ul className="space-y-0.5">
          {activeFile?.memories.map((m) => (
            <li
              key={`${m.source}-${m.id}`}
              className="group relative flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-card/40 transition-colors"
            >
              <span className="text-primary/60 mt-1 text-[10px]">●</span>
              <div className="flex-1 min-w-0 text-xs leading-relaxed text-foreground/90">
                <span className={cn("break-words", m.source === "memory_mirror" && "block whitespace-pre-wrap")}>
                  {m.content_summary}
                </span>
                {m.importance_score != null && (
                  <span className="ml-2 text-[9px] text-muted-foreground/50">
                    {Math.round(m.importance_score * 100)}%
                  </span>
                )}
              </div>
              {m.editable && (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => setConfirmDelete(m)}
                    className="p-1 rounded text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {markdownContent}
        </pre>
      )}
    </div>
  );

  const dialogs = (
    <>
      <ImportMemoriesDialog
        open={showImport}
        onOpenChange={setShowImport}
        onImport={async (items) => importMemories.mutateAsync(items)}
      />
      <ExportMemoriesDialog open={showExport} onOpenChange={setShowExport} files={memoryFiles} />
      <AddMemoryDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        onSubmit={async (input) => {
          await createMemory.mutateAsync(input);
        }}
      />
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this memory?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              BeeBot will stop using it. You can re-import later from your export.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  // ═══ MOBILE LAYOUT ═══
  if (isMobile) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Memory Vault</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              {totalCount}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-card/40 text-muted-foreground border border-border/20">
              Markdown mirror
            </span>
          </div>
          {headerActions}
        </div>

        <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
          <div className="flex gap-1.5 min-w-max">
            {memoryFiles.map((file) => {
              const display = getFileDisplay(file.fileName);
              return (
                <button
                  key={file.fileName}
                  onClick={() => setSelectedFile(file.fileName)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] whitespace-nowrap transition-all duration-200 border",
                    activeFile?.fileName === file.fileName
                      ? file.pinned
                        ? "bg-gradient-to-r from-primary/20 to-primary/5 text-primary font-semibold border-primary/40"
                        : "bg-primary/15 text-primary font-semibold border-primary/30"
                      : "bg-card/30 text-muted-foreground border-border/20"
                  )}
                  title={file.fileName}
                >
                  {file.pinned ? (
                    file.mirror ? <BookOpen className="h-3 w-3" /> : <Star className="h-3 w-3 fill-current" />
                  ) : (
                    <FileText className="h-3 w-3" />
                  )}
                  {display.name}
                  <span className="text-[9px] opacity-60">{file.memories.length}</span>
                </button>
              );
            })}
          </div>
        </div>

        {memoryControlCard}

        {activeFile && (
          <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-sm overflow-hidden flex flex-col">
            {viewerHeader}
            <div className="max-h-[340px] overflow-y-auto overscroll-contain">
              {viewerBody}
            </div>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/50 text-center">
          {totalCount} memories · {memoryFiles.length} files
          {lastUpdated && ` · Updated ${format(new Date(lastUpdated), "MMM d")}`}
        </p>

        {/* Autonomous Memory Agent — always-on chat */}
        <MemoryAgentChat />

        {dialogs}
      </div>
    );
  }

  // ═══ DESKTOP LAYOUT ═══
  return (
    <div className="space-y-3 pb-2">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Memory Vault</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            {memoryFiles.length} files · {totalCount}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-card/40 text-muted-foreground border border-border/20">
            Markdown mirror
          </span>
        </div>
        {headerActions}
      </div>

      {memoryControlCard}

      <div className="h-[480px] shrink-0 rounded-2xl border border-border/20 bg-card/20 backdrop-blur-sm overflow-hidden flex">
        {/* Column 1 — File list */}
        <div className="w-[200px] shrink-0 border-r border-border/20 bg-card/10">
          <ScrollArea className="h-full">
            <div className="p-2 space-y-0.5">
              {memoryFiles.map((file) => {
                const active = activeFile?.fileName === file.fileName;
                const display = getFileDisplay(file.fileName);
                return (
                  <button
                    key={file.fileName}
                    onClick={() => setSelectedFile(file.fileName)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs transition-all duration-200 text-left border",
                      active
                        ? file.pinned
                          ? "bg-gradient-to-r from-primary/15 to-primary/5 text-primary font-semibold border-primary/30 shadow-[0_0_20px_hsl(var(--primary)/0.08)]"
                          : "bg-primary/10 text-primary font-medium border-primary/20"
                        : "text-muted-foreground hover:bg-card/40 hover:text-foreground border-transparent"
                    )}
                  >
                    {file.pinned ? (
                      file.mirror ? <BookOpen className="h-3.5 w-3.5 shrink-0" /> : <Star className="h-3.5 w-3.5 shrink-0 fill-current" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{display.name}</span>
                      {display.folder && (
                        <span className="block truncate text-[9px] font-normal opacity-55">{display.folder}</span>
                      )}
                    </span>
                    <span className="text-[9px] opacity-60 shrink-0">{file.memories.length}</span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Column 2 — Active file viewer */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {activeFile && (
            <>
              {viewerHeader}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar">
                {viewerBody}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/50 text-center shrink-0">
        {totalCount} memories · {memoryFiles.length} files
        {lastUpdated && ` · Updated ${format(new Date(lastUpdated), "MMM d, yyyy")}`}
      </p>

      {/* Autonomous Memory Agent — single always-on chat surface */}
      <div className="shrink-0">
        <MemoryAgentChat />
      </div>

      {dialogs}
    </div>
  );
};

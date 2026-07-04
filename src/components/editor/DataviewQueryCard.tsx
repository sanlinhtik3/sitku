import { useMemo } from "react";
import { Database, CheckSquare, FileText, BarChart3, Search, Tag as TagIcon, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NoteItem {
  path: string;
  title: string;
  content?: string;
}

export interface DataviewQueryCardProps {
  spec?: string;
  code?: string;
  notes?: NoteItem[];
  onOpenNote?: (path: string) => void;
}

interface ParsedTask {
  text: string;
  done: boolean;
  noteTitle: string;
  notePath: string;
  tags: string[];
}

export function parseQueryInput(input: string): {
  type: "tasks" | "notes" | "stats";
  tag?: string;
  search?: string;
  status?: "todo" | "done" | "all";
} {
  let type: "tasks" | "notes" | "stats" = "notes";
  const lower = input.toLowerCase();
  if (lower.includes("tasks") || lower.includes("task")) type = "tasks";
  if (lower.includes("stats") || lower.includes("kpi") || lower.includes("dashboard")) type = "stats";

  const tagMatch = input.match(/(?:tag[:=]|\s|^)(#[a-zA-Z0-9_-]+)/i);
  const tag = tagMatch ? tagMatch[1] : undefined;

  const statusMatch = input.match(/status[:=]\s*(todo|done|all)/i);
  const status = statusMatch ? (statusMatch[1].toLowerCase() as "todo" | "done" | "all") : "all";

  const searchMatch = input.match(/where[:=]\s*"?([^"\n]+)"?/i) || input.match(/search[:=]\s*"?([^"\n]+)"?/i);
  const search = searchMatch ? searchMatch[1].trim() : undefined;

  return { type, tag, search, status };
}

export function DataviewQueryCard({ spec = "", code = "", notes = [], onOpenNote }: DataviewQueryCardProps) {
  const input = `${spec}\n${code}`.trim();
  const query = useMemo(() => parseQueryInput(input), [input]);

  const stats = useMemo(() => {
    let totalTasks = 0;
    let completedTasks = 0;
    const tagSet = new Set<string>();
    let totalWords = 0;

    for (const note of notes) {
      const c = note.content || "";
      totalWords += c.split(/\s+/).filter(Boolean).length;

      const tagMatches = c.match(/#[a-zA-Z0-9_-]+/g);
      if (tagMatches) tagMatches.forEach((t) => tagSet.add(t));

      const lines = c.split("\n");
      for (const line of lines) {
        if (/^\s*[-*]\s+\[\s*\]/.test(line)) totalTasks++;
        else if (/^\s*[-*]\s+\[[xX]\]/.test(line)) {
          totalTasks++;
          completedTasks++;
        }
      }
    }

    return {
      totalNotes: notes.length,
      totalTasks,
      completedTasks,
      tagCount: tagSet.size,
      totalWords,
    };
  }, [notes]);

  const filteredTasks = useMemo(() => {
    if (query.type !== "tasks") return [];
    const tasks: ParsedTask[] = [];

    for (const note of notes) {
      const lines = (note.content || "").split("\n");
      for (const line of lines) {
        const match = /^\s*[-*]\s+\[([ xX])\]\s+(.+)$/.exec(line);
        if (match) {
          const done = match[1].toLowerCase() === "x";
          const text = match[2];
          const tags = text.match(/#[a-zA-Z0-9_-]+/g) || [];

          if (query.status === "todo" && done) continue;
          if (query.status === "done" && !done) continue;
          if (query.tag && !tags.includes(query.tag) && !(note.content || "").includes(query.tag)) continue;
          if (query.search && !text.toLowerCase().includes(query.search.toLowerCase())) continue;

          tasks.push({
            text: text.replace(/#[a-zA-Z0-9_-]+/g, "").trim(),
            done,
            noteTitle: note.title,
            notePath: note.path,
            tags,
          });
        }
      }
    }
    return tasks;
  }, [notes, query]);

  const filteredNotes = useMemo(() => {
    if (query.type !== "notes") return [];
    return notes.filter((n) => {
      const content = n.content || "";
      if (query.tag && !content.includes(query.tag) && !n.title.includes(query.tag)) return false;
      if (query.search && !content.toLowerCase().includes(query.search.toLowerCase()) && !n.title.toLowerCase().includes(query.search.toLowerCase())) return false;
      return true;
    });
  }, [notes, query]);

  return (
    <div className="not-prose my-6 overflow-hidden rounded-2xl border border-[var(--bb-border-strong)] bg-[var(--bb-bg-1)] shadow-sm">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-[var(--bb-border)] bg-[var(--bb-bg-2)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--beebot-accent,#f4d35e)]/15 text-[var(--beebot-accent,#f4d35e)]">
            <Database className="h-3.5 w-3.5" />
          </span>
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--bb-text-1)]">
            Dataview Query
          </span>
          <span className="rounded-full bg-[var(--bb-bg-3)] px-2 py-0.5 text-[11px] font-medium text-[var(--bb-text-2)]">
            {query.type.toUpperCase()}
          </span>
        </div>
        {query.tag && (
          <div className="flex items-center gap-1 rounded-md bg-[var(--bb-bg-3)] px-2 py-0.5 text-xs text-[var(--beebot-accent,#f4d35e)] font-mono">
            <TagIcon className="h-3 w-3" />
            <span>{query.tag}</span>
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="p-4">
        {query.type === "stats" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-[var(--bb-border)] bg-[var(--bb-bg-0)] p-3">
              <div className="flex items-center gap-1.5 text-xs text-[var(--bb-text-3)]">
                <FileText className="h-3.5 w-3.5 text-[var(--bb-text-2)]" />
                <span>Total Notes</span>
              </div>
              <div className="mt-1 text-2xl font-bold text-[var(--bb-text-1)]">{stats.totalNotes}</div>
            </div>
            <div className="rounded-xl border border-[var(--bb-border)] bg-[var(--bb-bg-0)] p-3">
              <div className="flex items-center gap-1.5 text-xs text-[var(--bb-text-3)]">
                <CheckSquare className="h-3.5 w-3.5 text-emerald-400" />
                <span>Tasks Done</span>
              </div>
              <div className="mt-1 text-2xl font-bold text-[var(--bb-text-1)]">
                {stats.completedTasks} <span className="text-sm font-normal text-[var(--bb-text-3)]">/ {stats.totalTasks}</span>
              </div>
            </div>
            <div className="rounded-xl border border-[var(--bb-border)] bg-[var(--bb-bg-0)] p-3">
              <div className="flex items-center gap-1.5 text-xs text-[var(--bb-text-3)]">
                <TagIcon className="h-3.5 w-3.5 text-[var(--beebot-accent,#f4d35e)]" />
                <span>Active Tags</span>
              </div>
              <div className="mt-1 text-2xl font-bold text-[var(--bb-text-1)]">{stats.tagCount}</div>
            </div>
            <div className="rounded-xl border border-[var(--bb-border)] bg-[var(--bb-bg-0)] p-3">
              <div className="flex items-center gap-1.5 text-xs text-[var(--bb-text-3)]">
                <BarChart3 className="h-3.5 w-3.5 text-sky-400" />
                <span>Total Words</span>
              </div>
              <div className="mt-1 text-2xl font-bold text-[var(--bb-text-1)]">{stats.totalWords.toLocaleString()}</div>
            </div>
          </div>
        )}

        {query.type === "tasks" && (
          <div className="space-y-2">
            {filteredTasks.length === 0 ? (
              <div className="py-6 text-center text-sm text-[var(--bb-text-3)]">No matching tasks found across workspace.</div>
            ) : (
              filteredTasks.map((t, idx) => (
                <div
                  key={idx}
                  className="flex items-start justify-between gap-3 rounded-xl border border-[var(--bb-border)] bg-[var(--bb-bg-0)] p-3 transition-colors hover:border-[var(--bb-border-strong)]"
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold",
                        t.done
                          ? "border-[var(--beebot-accent,#f4d35e)] bg-[var(--beebot-accent,#f4d35e)] text-black"
                          : "border-[var(--bb-border-strong)] bg-transparent"
                      )}
                    >
                      {t.done ? "✓" : ""}
                    </span>
                    <span className={cn("text-sm text-[var(--bb-text-1)]", t.done && "line-through opacity-60")}>
                      {t.text}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenNote?.(t.notePath || t.noteTitle)}
                    className="flex shrink-0 items-center gap-1 rounded bg-[var(--bb-bg-2)] px-2 py-1 text-[11px] font-medium text-[var(--bb-text-2)] hover:bg-[var(--bb-bg-3)] hover:text-[var(--bb-text-1)] transition-colors"
                  >
                    <FileText className="h-3 w-3" />
                    <span className="max-w-[120px] truncate">{t.noteTitle}</span>
                    <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {query.type === "notes" && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--bb-border-strong)] text-left text-xs font-semibold text-[var(--bb-text-3)]">
                  <th className="pb-2 pl-2">Note Title</th>
                  <th className="pb-2">Path</th>
                  <th className="pb-2 text-right pr-2">Word Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--bb-border)]">
                {filteredNotes.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-sm text-[var(--bb-text-3)]">
                      No matching notes found.
                    </td>
                  </tr>
                ) : (
                  filteredNotes.map((n, idx) => {
                    const wc = (n.content || "").split(/\s+/).filter(Boolean).length;
                    return (
                      <tr key={idx} className="hover:bg-[var(--bb-bg-0)] transition-colors">
                        <td className="py-2.5 pl-2 font-medium text-[var(--bb-text-1)]">
                          <button
                            type="button"
                            onClick={() => onOpenNote?.(n.path || n.title)}
                            className="flex items-center gap-1.5 hover:text-[var(--beebot-accent,#f4d35e)] transition-colors"
                          >
                            <FileText className="h-3.5 w-3.5 text-[var(--bb-text-3)]" />
                            <span>{n.title}</span>
                          </button>
                        </td>
                        <td className="py-2.5 font-mono text-xs text-[var(--bb-text-3)]">{n.path}</td>
                        <td className="py-2.5 text-right pr-2 font-mono text-xs text-[var(--bb-text-2)]">{wc.toLocaleString()}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useMemo } from "react";
import { Database, CheckSquare, FileText, BarChart3, Search, Tag as TagIcon, ExternalLink, LayoutGrid, Kanban, Table as TableIcon, Calendar, List, Sparkles } from "lucide-react";
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

// ponytail: lightweight YAML property parser for Notion-style database columns
function parseNoteProperties(content: string): Record<string, string> {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return {};
  const props: Record<string, string> = {};
  fmMatch[1].split("\n").forEach((line) => {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const k = line.slice(0, idx).trim().toLowerCase();
      const v = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (k && v) props[k] = v;
    }
  });
  return props;
}

export function parseQueryInput(input: string): {
  type: "tasks" | "notes" | "stats";
  tag?: string;
  search?: string;
  status?: "todo" | "done" | "all";
  view?: "list" | "table" | "kanban" | "calendar" | "gallery";
} {
  let type: "tasks" | "notes" | "stats" = "notes";
  const lower = input.toLowerCase();
  if (lower.includes("tasks") || lower.includes("task")) type = "tasks";
  if (lower.includes("stats") || lower.includes("kpi") || lower.includes("dashboard")) type = "stats";

  const viewMatch = input.match(/view[:=]\s*(list|table|kanban|calendar|gallery)/i);
  const view = viewMatch ? (viewMatch[1].toLowerCase() as any) : undefined;

  const tagMatch = input.match(/(?:tag[:=]|\s|^)(#[a-zA-Z0-9_-]+)/i);
  const tag = tagMatch ? tagMatch[1] : undefined;

  const statusMatch = input.match(/status[:=]\s*(todo|done|all)/i);
  const status = statusMatch ? (statusMatch[1].toLowerCase() as "todo" | "done" | "all") : "all";

  const searchMatch = input.match(/where[:=]\s*"?([^"\n]+)"?/i) || input.match(/search[:=]\s*"?([^"\n]+)"?/i);
  const search = searchMatch ? searchMatch[1].trim() : undefined;

  return { type, tag, search, status, view };
}

export function DataviewQueryCard({ spec = "", code = "", notes = [], onOpenNote }: DataviewQueryCardProps) {
  const input = `${spec}\n${code}`.trim();
  const query = useMemo(() => parseQueryInput(input), [input]);
  const [activeView, setActiveView] = useState<"list" | "table" | "kanban" | "calendar" | "gallery">(
    query.view || (query.type === "tasks" ? "list" : "table")
  );

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
    if (query.type === "stats") return [];
    return notes.filter((n) => {
      const content = n.content || "";
      if (query.tag && !content.includes(query.tag) && !n.title.includes(query.tag)) return false;
      if (query.search && !content.toLowerCase().includes(query.search.toLowerCase()) && !n.title.toLowerCase().includes(query.search.toLowerCase())) return false;
      if (query.status !== "all" && query.status) {
        const props = parseNoteProperties(content);
        const s = (props.status || "todo").toLowerCase();
        if (query.status === "todo" && (s === "done" || s === "completed")) return false;
        if (query.status === "done" && s !== "done" && s !== "completed") return false;
      }
      return true;
    });
  }, [notes, query]);

  const getStatusBadge = (status?: string) => {
    const s = (status || "todo").toLowerCase();
    if (s === "done" || s === "completed") return <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400 border border-emerald-500/30">Done</span>;
    if (s === "in progress" || s === "active") return <span className="rounded bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-400 border border-sky-500/30">In Progress</span>;
    if (s === "blocked") return <span className="rounded bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-400 border border-rose-500/30">Blocked</span>;
    return <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-400 border border-amber-500/30">Todo</span>;
  };

  const getPriorityBadge = (priority?: string) => {
    if (!priority) return null;
    const p = priority.toLowerCase();
    if (p === "high" || p === "urgent") return <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-400 border border-rose-500/30 uppercase">{p}</span>;
    if (p === "medium") return <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/30 uppercase">{p}</span>;
    return <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-400 border border-sky-500/30 uppercase">{p}</span>;
  };

  return (
    <div className="not-prose my-6 overflow-hidden rounded-2xl border border-[var(--bb-border-strong)] bg-[var(--bb-bg-1)] shadow-sm">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--bb-border)] bg-[var(--bb-bg-2)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--beebot-accent,#f4d35e)]/15 text-[var(--beebot-accent,#f4d35e)]">
            <Database className="h-3.5 w-3.5" />
          </span>
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--bb-text-1)]">
            Notion Workspace
          </span>
          <span className="rounded-full bg-[var(--bb-bg-3)] px-2 py-0.5 text-[11px] font-medium text-[var(--bb-text-2)]">
            {query.type.toUpperCase()}
          </span>
          {query.tag && (
            <div className="flex items-center gap-1 rounded-md bg-[var(--bb-bg-3)] px-2 py-0.5 text-xs text-[var(--beebot-accent,#f4d35e)] font-mono">
              <TagIcon className="h-3 w-3" />
              <span>{query.tag}</span>
            </div>
          )}
        </div>

        {query.type !== "stats" && (
          <div className="flex items-center gap-1 rounded-lg bg-[var(--bb-bg-0)] p-1 border border-[var(--bb-border)]">
            <button
              type="button"
              onClick={() => setActiveView("list")}
              className={cn("flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors", activeView === "list" ? "bg-[var(--bb-bg-2)] text-[var(--bb-text-1)] font-semibold shadow-sm" : "text-[var(--bb-text-3)] hover:text-[var(--bb-text-1)]")}
            >
              <List className="h-3 w-3" /> <span>List</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView("table")}
              className={cn("flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors", activeView === "table" ? "bg-[var(--bb-bg-2)] text-[var(--bb-text-1)] font-semibold shadow-sm" : "text-[var(--bb-text-3)] hover:text-[var(--bb-text-1)]")}
            >
              <TableIcon className="h-3 w-3" /> <span>Table</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView("kanban")}
              className={cn("flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors", activeView === "kanban" ? "bg-[var(--bb-bg-2)] text-[var(--bb-text-1)] font-semibold shadow-sm" : "text-[var(--bb-text-3)] hover:text-[var(--bb-text-1)]")}
            >
              <Kanban className="h-3 w-3" /> <span>Kanban</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView("gallery")}
              className={cn("flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors", activeView === "gallery" ? "bg-[var(--bb-bg-2)] text-[var(--bb-text-1)] font-semibold shadow-sm" : "text-[var(--bb-text-3)] hover:text-[var(--bb-text-1)]")}
            >
              <LayoutGrid className="h-3 w-3" /> <span>Gallery</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView("calendar")}
              className={cn("flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors", activeView === "calendar" ? "bg-[var(--bb-bg-2)] text-[var(--bb-text-1)] font-semibold shadow-sm" : "text-[var(--bb-text-3)] hover:text-[var(--bb-text-1)]")}
            >
              <Calendar className="h-3 w-3" /> <span>Calendar</span>
            </button>
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

        {query.type !== "stats" && activeView === "list" && (
          <div className="space-y-2">
            {query.type === "tasks" ? (
              filteredTasks.length === 0 ? (
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
              )
            ) : (
              filteredNotes.length === 0 ? (
                <div className="py-6 text-center text-sm text-[var(--bb-text-3)]">No matching notes found.</div>
              ) : (
                filteredNotes.map((n, idx) => {
                  const props = parseNoteProperties(n.content || "");
                  return (
                    <div key={idx} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--bb-border)] bg-[var(--bb-bg-0)] p-3 hover:border-[var(--bb-border-strong)] transition-colors">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-[var(--bb-text-3)]" />
                        <button type="button" onClick={() => onOpenNote?.(n.path || n.title)} className="font-medium text-sm text-[var(--bb-text-1)] hover:text-[var(--beebot-accent,#f4d35e)] transition-colors">
                          {n.title}
                        </button>
                        {getStatusBadge(props.status)}
                        {getPriorityBadge(props.priority)}
                      </div>
                      <span className="font-mono text-xs text-[var(--bb-text-3)]">{n.path}</span>
                    </div>
                  );
                })
              )
            )}
          </div>
        )}

        {query.type !== "stats" && activeView === "table" && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--bb-border-strong)] text-left text-xs font-semibold text-[var(--bb-text-3)]">
                  <th className="pb-2 pl-2">Title</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Priority</th>
                  <th className="pb-2">Due Date</th>
                  <th className="pb-2">Path</th>
                  <th className="pb-2 text-right pr-2">Words</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--bb-border)]">
                {filteredNotes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-sm text-[var(--bb-text-3)]">
                      No matching items found.
                    </td>
                  </tr>
                ) : (
                  filteredNotes.map((n, idx) => {
                    const props = parseNoteProperties(n.content || "");
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
                        <td className="py-2.5">{getStatusBadge(props.status)}</td>
                        <td className="py-2.5">{getPriorityBadge(props.priority) || <span className="text-xs text-[var(--bb-text-4)]">—</span>}</td>
                        <td className="py-2.5 font-mono text-xs text-[var(--bb-text-2)]">{props.due || props.date || <span className="text-xs text-[var(--bb-text-4)]">—</span>}</td>
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

        {query.type !== "stats" && activeView === "kanban" && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4 overflow-x-auto pb-2">
            {(["todo", "in progress", "done", "blocked"] as const).map((col) => {
              const colNotes = filteredNotes.filter((n) => {
                const s = (parseNoteProperties(n.content || "").status || "todo").toLowerCase();
                if (col === "todo") return s === "todo" || (s !== "in progress" && s !== "done" && s !== "completed" && s !== "blocked");
                if (col === "in progress") return s === "in progress" || s === "active";
                if (col === "done") return s === "done" || s === "completed";
                return s === "blocked";
              });

              return (
                <div key={col} className="flex flex-col rounded-xl border border-[var(--bb-border)] bg-[var(--bb-bg-0)] p-3">
                  <div className="mb-3 flex items-center justify-between border-b border-[var(--bb-border)] pb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--bb-text-2)]">{col}</span>
                    <span className="rounded-full bg-[var(--bb-bg-2)] px-2 py-0.5 text-[10px] font-mono font-bold text-[var(--bb-text-3)]">{colNotes.length}</span>
                  </div>
                  <div className="flex-1 space-y-2.5">
                    {colNotes.length === 0 ? (
                      <div className="py-8 text-center text-xs text-[var(--bb-text-4)]">Empty</div>
                    ) : (
                      colNotes.map((n, idx) => {
                        const props = parseNoteProperties(n.content || "");
                        return (
                          <div key={idx} className="flex flex-col gap-2 rounded-lg border border-[var(--bb-border)] bg-[var(--bb-bg-1)] p-2.5 shadow-sm hover:border-[var(--bb-border-strong)] transition-colors">
                            <div className="flex items-start justify-between gap-1">
                              <button type="button" onClick={() => onOpenNote?.(n.path || n.title)} className="font-semibold text-xs text-[var(--bb-text-1)] text-left hover:text-[var(--beebot-accent,#f4d35e)] transition-colors line-clamp-2">
                                {n.title}
                              </button>
                              {getPriorityBadge(props.priority)}
                            </div>
                            {(props.due || props.date || props.project) && (
                              <div className="flex items-center justify-between text-[10px] font-mono text-[var(--bb-text-3)] pt-1 border-t border-[var(--bb-border)]">
                                <span>{props.project ? `📁 ${props.project}` : ""}</span>
                                <span>{props.due || props.date ? `📅 ${props.due || props.date}` : ""}</span>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {query.type !== "stats" && activeView === "gallery" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            {filteredNotes.length === 0 ? (
              <div className="col-span-full py-8 text-center text-sm text-[var(--bb-text-3)]">No notes found for gallery view.</div>
            ) : (
              filteredNotes.map((n, idx) => {
                const props = parseNoteProperties(n.content || "");
                const snippet = (n.content || "").replace(/^---\r?\n[\s\S]*?\r?\n---/, "").trim().slice(0, 140);
                return (
                  <div key={idx} className="flex flex-col justify-between rounded-xl border border-[var(--bb-border)] bg-[var(--bb-bg-0)] p-4 shadow-sm hover:border-[var(--bb-border-strong)] transition-all">
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <button type="button" onClick={() => onOpenNote?.(n.path || n.title)} className="font-bold text-sm text-[var(--bb-text-1)] text-left hover:text-[var(--beebot-accent,#f4d35e)] transition-colors line-clamp-1">
                          {n.title}
                        </button>
                        {getStatusBadge(props.status)}
                      </div>
                      <p className="text-xs text-[var(--bb-text-3)] line-clamp-3 mb-3 font-sans leading-relaxed">{snippet || "No content preview available."}</p>
                    </div>
                    <div className="flex items-center justify-between border-t border-[var(--bb-border)] pt-2 text-[11px] font-mono text-[var(--bb-text-4)]">
                      <span>{props.priority ? getPriorityBadge(props.priority) : n.path}</span>
                      <span>{(n.content || "").split(/\s+/).filter(Boolean).length} words</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {query.type !== "stats" && activeView === "calendar" && (
          <div className="space-y-4">
            {(() => {
              const datedNotes = filteredNotes.filter((n) => {
                const props = parseNoteProperties(n.content || "");
                return !!(props.due || props.date);
              }).sort((a, b) => {
                const da = parseNoteProperties(a.content || "").due || parseNoteProperties(a.content || "").date || "";
                const db = parseNoteProperties(b.content || "").due || parseNoteProperties(b.content || "").date || "";
                return da.localeCompare(db);
              });

              if (datedNotes.length === 0) {
                return (
                  <div className="py-12 text-center text-sm text-[var(--bb-text-3)] border border-dashed border-[var(--bb-border)] rounded-xl">
                    <Calendar className="h-8 w-8 mx-auto mb-2 opacity-40 text-[var(--beebot-accent,#f4d35e)]" />
                    <p className="font-medium text-[var(--bb-text-2)]">No Scheduled Notes Found</p>
                    <p className="text-xs text-[var(--bb-text-4)] mt-1">Add a <code className="bg-[var(--bb-bg-2)] px-1 py-0.5 rounded text-[var(--beebot-accent,#f4d35e)] font-mono">due: YYYY-MM-DD</code> or <code className="bg-[var(--bb-bg-2)] px-1 py-0.5 rounded text-[var(--beebot-accent,#f4d35e)] font-mono">date: YYYY-MM-DD</code> property in YAML frontmatter to display items on the timeline.</p>
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  {datedNotes.map((n, idx) => {
                    const props = parseNoteProperties(n.content || "");
                    const dateStr = props.due || props.date || "";
                    return (
                      <div key={idx} className="flex items-center justify-between gap-4 rounded-xl border border-[var(--bb-border)] bg-[var(--bb-bg-0)] p-3.5 hover:border-[var(--bb-border-strong)] transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col items-center justify-center rounded-lg bg-[var(--bb-bg-2)] px-3 py-1.5 border border-[var(--bb-border)] font-mono text-center min-w-[80px]">
                            <span className="text-[10px] uppercase font-bold text-[var(--beebot-accent,#f4d35e)]">Due Date</span>
                            <span className="text-xs font-bold text-[var(--bb-text-1)]">{dateStr}</span>
                          </div>
                          <div>
                            <button type="button" onClick={() => onOpenNote?.(n.path || n.title)} className="font-bold text-sm text-[var(--bb-text-1)] hover:text-[var(--beebot-accent,#f4d35e)] transition-colors">
                              {n.title}
                            </button>
                            <div className="flex items-center gap-2 mt-1">
                              {getStatusBadge(props.status)}
                              {getPriorityBadge(props.priority)}
                              {props.project && <span className="text-[11px] font-mono text-[var(--bb-text-3)]">📁 {props.project}</span>}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenNote?.(n.path || n.title)}
                          className="flex items-center gap-1 rounded bg-[var(--bb-bg-2)] px-2.5 py-1.5 text-xs font-medium text-[var(--bb-text-2)] hover:bg-[var(--bb-bg-3)] hover:text-[var(--bb-text-1)] transition-colors shrink-0"
                        >
                          <span>Open</span>
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

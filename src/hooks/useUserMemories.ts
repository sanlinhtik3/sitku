import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";

export type MemorySource = "user_memories" | "chat_memory_embeddings" | "memory_mirror";

export interface MemoryEntry {
  id: string;
  content_summary: string;
  importance_score: number | null;
  topic_tags: string[] | null;
  created_at: string | null;
  source: MemorySource;
  category?: string | null;
  editable: boolean;
  pinned?: boolean;
  priority?: number;
}

export interface MemoryFile {
  fileName: string;
  tag: string;
  memories: MemoryEntry[];
  lastUpdated: string;
  pinned?: boolean;
  description?: string;
  mirror?: boolean;
  markdownContent?: string;
}

const CATEGORY_TO_FILE: Record<string, string> = {
  preference: "preferences.md",
  fact: "facts.md",
  work: "work.md",
  relationship: "relationships.md",
  opinion: "opinions.md",
  life_event: "life-events.md",
  viz_preferences: "viz.md",
  goals: "goals.md",
  custom: "custom.md",
};

function toLocalDateKey(input = new Date()): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function offsetDateKey(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
}

function dailyMemoryPath(dateKey: string): string {
  const [year, month] = dateKey.split("-");
  return `memory/daily/${year}/${month}/${dateKey}.md`;
}

function mirrorEntry(id: string, content: string, createdAt?: string | null): MemoryEntry {
  return {
    id,
    content_summary: content,
    importance_score: null,
    topic_tags: ["mirror"],
    created_at: createdAt || null,
    source: "memory_mirror",
    category: "mirror",
    editable: false,
  };
}

function excerptMarkdown(content: string, maxLength = 1800): string {
  const cleaned = String(content || "").trim();
  if (!cleaned) return "";
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength).trim()}...` : cleaned;
}

function uniqueEntries(entries: MemoryEntry[]): MemoryEntry[] {
  const seen = new Set<string>();
  const out: MemoryEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.source}:${entry.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

function buildPortableMemoryMarkdown(input: {
  memoryFile: MemoryFile;
  categoryFiles: MemoryFile[];
  dailyFiles: MemoryFile[];
  lastDream?: string | null;
}): string {
  const longTermEntries = uniqueEntries(
    input.categoryFiles.flatMap((file) => file.memories.filter((entry) => entry.editable))
  );
  const byCategory = new Map<string, MemoryEntry[]>();
  for (const entry of longTermEntries) {
    const category = entry.category || entry.topic_tags?.[0] || "fact";
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category)!.push(entry);
  }

  const lines: string[] = [
    "---",
    "file: MEMORY.md",
    "format: beebot-portable-memory-v2",
    `last_updated: ${input.memoryFile.lastUpdated ? input.memoryFile.lastUpdated.split("T")[0] : "unknown"}`,
    `long_term_memories: ${longTermEntries.length}`,
    "source_of_truth: supabase:user_memories",
    "---",
    "",
    "# BeeBot Long-Term Memory",
    "",
    "> Portable master memory for BeeBot-compatible agents. Paste this file into another AI agent's MEMORY.md to transfer the user's long-term profile, preferences, goals, and durable context.",
    "",
    "## Memory Map",
    "",
    `- MEMORY.md: canonical long-term memory and portable user profile`,
    "- memory/daily/YYYY/MM/YYYY-MM-DD.md: date-organized daily working memory logs",
    `- DREAMS.md: consolidation state and curator decisions${input.lastDream ? ` (last sweep: ${new Date(input.lastDream).toLocaleString()})` : ""}`,
    `- Topic files such as finance.md, crypto.md, task.md: domain-specific durable memory`,
    "",
    "## Agent Memory Control",
    "",
    "- BeeBot can read, write, edit, update, delete, optimize, and analyze user-curated long-term memories through the Memory Vault and Memory Agent.",
    "- Daily files are human-readable working logs generated from session summaries; durable facts should be promoted into MEMORY.md or the relevant topic file.",
    "- MEMORY.md is the portable master file for sharing the user's long-term profile with another AI agent.",
    "",
    "## Daily Archive",
    "",
  ];

  if (input.dailyFiles.length) {
    for (const file of input.dailyFiles.slice(0, 31)) {
      lines.push(`- ${file.fileName}: ${file.memories.length} log item${file.memories.length === 1 ? "" : "s"}`);
    }
  } else {
    lines.push("- No daily working logs have been written yet.");
  }

  lines.push(
    "",
    "## Must-Know Core Memory",
    "",
  );

  if (input.memoryFile.memories.length) {
    for (const entry of input.memoryFile.memories) {
      lines.push(`- ${entry.content_summary}`);
    }
  } else {
    lines.push("- No pinned or high-priority core memory yet.");
  }

  lines.push("", "## Long-Term Memory By Category", "");
  if (byCategory.size === 0) {
    lines.push("- No long-term category memory yet.");
  } else {
    const categories = Array.from(byCategory.keys()).sort();
    for (const category of categories) {
      lines.push(`### ${category.replace(/-/g, " ")}`, "");
      for (const entry of byCategory.get(category) || []) {
        const score = entry.importance_score != null ? ` (${Math.round(entry.importance_score * 100)}%)` : "";
        lines.push(`- ${entry.content_summary}${score}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

function buildDailyMemoryFile(log: any, fallbackDate?: string): MemoryFile {
  const dateKey = log?.log_date || fallbackDate || toLocalDateKey();
  const content = log?.content ? excerptMarkdown(log.content, 4000) : "No daily memory log has been written for this date yet.";
  const title = dateKey === offsetDateKey(0)
    ? "Today"
    : dateKey === offsetDateKey(-1)
      ? "Yesterday"
      : dateKey;
  const fileName = dailyMemoryPath(dateKey);
  const markdownContent = [
    "---",
    `file: ${fileName}`,
    "format: beebot-daily-memory-v2",
    `date: ${dateKey}`,
    `last_updated: ${log?.updated_at || dateKey}`,
    "source_of_truth: supabase:agent_daily_logs",
    "---",
    "",
    `# Daily Working Memory - ${dateKey}`,
    "",
    "> Human-readable daily working memory. Use this to inspect what BeeBot observed or summarized on this specific date.",
    "",
    "## Purpose",
    "",
    "- Track session-level context by date.",
    "- Keep short-term working observations separate from durable long-term memory.",
    "- Promote only stable facts, preferences, goals, or decisions into MEMORY.md.",
    "",
    "## Log",
    "",
    content,
  ].join("\n");

  return {
    fileName,
    tag: `daily-${dateKey}`,
    pinned: true,
    mirror: true,
    lastUpdated: log?.updated_at || dateKey,
    description: `${title}'s date-organized working memory log. Durable items should be promoted into MEMORY.md or a topic file.`,
    memories: [
      mirrorEntry(`daily-${dateKey}-purpose`, "Daily working memory: session summaries and short-term observations for this date.", log?.updated_at || dateKey),
      mirrorEntry(`daily-${dateKey}-promotion`, "Promotion rule: stable user facts, preferences, goals, and decisions belong in MEMORY.md.", log?.updated_at || dateKey),
      mirrorEntry(`daily-${dateKey}-log`, content, log?.updated_at || dateKey),
    ],
    markdownContent,
  };
}

function buildMirrorFiles(input: {
  memoryFile: MemoryFile;
  categoryFiles: MemoryFile[];
  episodicFiles: MemoryFile[];
  dailyLogs: any[];
  dreamState: any | null;
  curatorDecisions: any[];
}): MemoryFile[] {
  const today = offsetDateKey(0);
  const yesterday = offsetDateKey(-1);
  const dailyByDate = new Map((input.dailyLogs || []).map((log: any) => [log.log_date, log]));
  const dreamValue = input.dreamState?.context_value;
  const lastDream = dreamValue?.ts || input.dreamState?.last_used_at || input.dreamState?.created_at;
  const portableEntries = uniqueEntries(
    input.categoryFiles.flatMap((file) => file.memories.filter((entry) => entry.editable))
  );
  const dailyDates = new Set<string>([today, yesterday]);
  for (const log of input.dailyLogs || []) {
    if (log?.log_date) dailyDates.add(log.log_date);
  }
  const dailyFiles = Array.from(dailyDates)
    .sort((a, b) => b.localeCompare(a))
    .map((dateKey) => buildDailyMemoryFile(dailyByDate.get(dateKey), dateKey));

  const portableMemoryFile: MemoryFile = {
    ...input.memoryFile,
    mirror: true,
    description: "Canonical portable long-term memory. Includes the memory map and all user-curated durable memories.",
    memories: [
      mirrorEntry("memory-map-control", "BeeBot can read, write, edit, update, delete, optimize, and analyze Memory Vault records through the Memory Agent.", input.memoryFile.lastUpdated),
      mirrorEntry("memory-map-daily", "memory/daily/YYYY/MM/YYYY-MM-DD.md -> date-organized working memory logs", input.memoryFile.lastUpdated),
      mirrorEntry("memory-map-dreams", "DREAMS.md -> consolidation state and recent curator decisions", lastDream),
      mirrorEntry("memory-map-derived", `${input.categoryFiles.length} curated category files + ${input.episodicFiles.length} episodic topic files`, input.memoryFile.lastUpdated),
      ...portableEntries,
    ],
    markdownContent: buildPortableMemoryMarkdown({
      memoryFile: input.memoryFile,
      categoryFiles: input.categoryFiles,
      dailyFiles,
      lastDream,
    }),
  };

  const dreamEntries: MemoryEntry[] = [];
  dreamEntries.push(
    mirrorEntry(
      "dream-state",
      lastDream
        ? `Last dream sweep: ${new Date(lastDream).toLocaleString()}`
        : "No dream sweep has been recorded yet.",
      lastDream,
    ),
  );
  for (const decision of (input.curatorDecisions || []).slice(0, 8)) {
    const score = typeof decision.curator_score === "number"
      ? ` (${Math.round(decision.curator_score * 100)}%)`
      : "";
    dreamEntries.push(
      mirrorEntry(
        `curator-${decision.id}`,
        `${decision.decision}: [${decision.candidate_category || "memory"}] ${decision.candidate_content}${score}${decision.reason ? ` -> ${decision.reason}` : ""}`,
        decision.created_at,
      ),
    );
  }

  const dreamsFile: MemoryFile = {
    fileName: "DREAMS.md",
    tag: "dreams",
    pinned: true,
    mirror: true,
    lastUpdated: lastDream || input.curatorDecisions?.[0]?.created_at || "",
    description: "Readable reflection layer: dream sweep status plus recent memory-curator decisions.",
    memories: dreamEntries,
  };

  return [portableMemoryFile, ...dailyFiles, dreamsFile];
}

export function useUserMemories(userId: string | undefined) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["user-memories-vault", userId],
    queryFn: async () => {
      if (!userId) return { episodic: [], curated: [], dailyLogs: [], dreamState: null, curatorDecisions: [] };
      // FIX: Removed agent_user_facts query (table is empty, was wasted I/O).
      // Pinned items in user_memories already serve the same role.
      const [episodicRes, curatedRes, dailyLogsRes, dreamStateRes, curatorDecisionsRes] = await Promise.all([
        (supabase as any)
          .from("chat_memory_embeddings")
          .select("id, content_summary, importance_score, topic_tags, created_at")
          .eq("user_id", userId)
          .eq("scope", "personal")
          .order("created_at", { ascending: false })
          .limit(500),
        (supabase as any)
          .from("user_memories")
          .select("id, content, category, confidence, created_at, last_accessed, pinned, priority")
          .eq("user_id", userId)
          .eq("is_active", true)
          .eq("scope", "personal")
          .order("priority", { ascending: false })
          .order("pinned", { ascending: false })
          .order("confidence", { ascending: false })
          .order("last_accessed", { ascending: false })
          .limit(500),
        (supabase as any)
          .from("agent_daily_logs")
          .select("id, log_date, content, updated_at")
          .eq("user_id", userId)
          .order("log_date", { ascending: false })
          .limit(31),
        (supabase as any)
          .from("agent_learning_context")
          .select("context_value, created_at, last_used_at")
          .eq("user_id", userId)
          .eq("context_type", "dream_state")
          .eq("context_key", "last_dream")
          .maybeSingle(),
        (supabase as any)
          .from("curator_decisions")
          .select("id, candidate_content, candidate_category, decision, reason, curator_score, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(12),
      ]);
      return {
        episodic: episodicRes.data || [],
        curated: curatedRes.data || [],
        dailyLogs: dailyLogsRes.data || [],
        dreamState: dreamStateRes.data || null,
        curatorDecisions: curatorDecisionsRes.data || [],
      };
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const { memoryFiles, totalCount } = useMemo(() => {
    if (!data) return { memoryFiles: [] as MemoryFile[], totalCount: 0 };
    const { episodic, curated, dailyLogs, dreamState, curatorDecisions } = data;

    // ── Build CORE memory.md (priority + pinned + high-confidence curated) ──
    // FIX: include must-know (priority>=50) entries unconditionally so they're visible.
    const coreEntries: MemoryEntry[] = [];
    const mustKnow = curated.filter((c: any) => c.pinned || (c.priority ?? 0) >= 50);
    const rest = curated
      .filter((c: any) => !(c.pinned || (c.priority ?? 0) >= 50))
      .sort((a: any, b: any) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, Math.max(0, 15 - mustKnow.length));
    for (const c of [...mustKnow, ...rest]) {
      const isMustKnow = !!(c.pinned || (c.priority ?? 0) >= 50);
      coreEntries.push({
        id: c.id,
        content_summary: isMustKnow ? `★ ${c.content}` : c.content,
        importance_score: c.confidence ?? 0.7,
        topic_tags: [c.category || "fact"],
        created_at: c.created_at,
        source: "user_memories",
        category: c.category,
        editable: true,
        pinned: !!c.pinned,
        priority: c.priority ?? 0,
      });
    }

    const memoryFile: MemoryFile = {
      fileName: "MEMORY.md",
      tag: "core",
      memories: coreEntries,
      lastUpdated:
        coreEntries.reduce((latest, m) => (m.created_at && m.created_at > latest ? m.created_at : latest), ""),
      pinned: true,
      description: "Always-loaded core memory used by BeeBot every conversation. ★ = must-know.",
    };

    // ── Per-category curated files ──
    const byCategory = new Map<string, MemoryEntry[]>();
    for (const c of curated) {
      const cat = c.category || "fact";
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push({
        id: c.id,
        content_summary: c.content,
        importance_score: c.confidence ?? 0.7,
        topic_tags: [cat],
        created_at: c.created_at,
        source: "user_memories",
        category: cat,
        editable: true,
        pinned: !!c.pinned,
        priority: c.priority ?? 0,
      });
    }
    const categoryFiles: MemoryFile[] = Array.from(byCategory.entries())
      .map(([cat, entries]) => ({
        fileName: CATEGORY_TO_FILE[cat] || `${cat}.md`,
        tag: cat,
        memories: entries.sort((a, b) => (b.importance_score ?? 0) - (a.importance_score ?? 0)),
        lastUpdated: entries.reduce(
          (latest, m) => (m.created_at && m.created_at > latest ? m.created_at : latest),
          ""
        ),
      }))
      .sort((a, b) => b.memories.length - a.memories.length);

    // ── Episodic by topic tag (merged into category files when tag matches) ──
    const existingTags = new Set(categoryFiles.map((f) => f.tag));
    const byTag = new Map<string, MemoryEntry[]>();
    for (const e of episodic) {
      const tag = (e.topic_tags?.[0] || "general").toLowerCase().replace(/\s+/g, "-");
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag)!.push({
        id: e.id,
        content_summary: e.content_summary,
        importance_score: e.importance_score,
        topic_tags: e.topic_tags,
        created_at: e.created_at,
        source: "chat_memory_embeddings",
        editable: false,
      });
    }

    // Merge episodic entries into matching category files first
    for (const [tag, entries] of byTag.entries()) {
      if (existingTags.has(tag)) {
        const target = categoryFiles.find((f) => f.tag === tag);
        if (target) {
          target.memories = [...target.memories, ...entries].sort(
            (a, b) => (b.importance_score ?? 0) - (a.importance_score ?? 0)
          );
          const newest = entries.reduce(
            (latest, m) => (m.created_at && m.created_at > latest ? m.created_at : latest),
            target.lastUpdated
          );
          target.lastUpdated = newest;
          byTag.delete(tag);
        }
      }
    }

    // Remaining episodic-only tags become standalone files (clean naming, no prefix)
    const episodicFiles: MemoryFile[] = Array.from(byTag.entries())
      .map(([tag, entries]) => ({
        fileName: `${tag}.md`,
        tag,
        memories: entries.sort(
          (a, b) => (b.importance_score ?? 0) - (a.importance_score ?? 0)
        ),
        lastUpdated: entries.reduce(
          (latest, m) => (m.created_at && m.created_at > latest ? m.created_at : latest),
          ""
        ),
      }))
      .sort((a, b) => b.memories.length - a.memories.length);

    const mirrorFiles = buildMirrorFiles({
      memoryFile,
      categoryFiles,
      episodicFiles,
      dailyLogs,
      dreamState,
      curatorDecisions,
    });
    const files: MemoryFile[] = [...mirrorFiles, ...categoryFiles, ...episodicFiles];
    const total = curated.length + episodic.length;
    return { memoryFiles: files, totalCount: total };
  }, [data]);

  // ── Mutations ──
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["user-memories-vault", userId] });

  const createMemory = useMutation({
    mutationFn: async (input: {
      content: string;
      category?: string;
      confidence?: number;
      pinned?: boolean;
      priority?: number;
      tags?: string[];
    }) => {
      if (!userId) throw new Error("Not authenticated");
      const { error } = await supabase.from("user_memories").insert({
        user_id: userId,
        content: input.content.trim(),
        category: input.category || "fact",
        confidence: input.confidence ?? 0.7,
        pinned: input.pinned ?? false,
        priority: input.priority ?? (input.pinned ? 100 : 0),
        tags: input.tags ?? [],
        scope: "personal",
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateMemory = useMutation({
    mutationFn: async (input: {
      id: string;
      content?: string;
      category?: string;
      confidence?: number;
      pinned?: boolean;
      priority?: number;
      tags?: string[];
    }) => {
      const patch: any = { last_accessed: new Date().toISOString() };
      if (input.content !== undefined) patch.content = input.content.trim();
      if (input.category) patch.category = input.category;
      if (typeof input.confidence === "number") patch.confidence = input.confidence;
      if (typeof input.pinned === "boolean") patch.pinned = input.pinned;
      if (typeof input.priority === "number") patch.priority = input.priority;
      if (Array.isArray(input.tags)) patch.tags = input.tags;
      const { error } = await supabase.from("user_memories").update(patch).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteMemory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_memories").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const importMemories = useMutation({
    mutationFn: async (
      items: Array<{
        content: string;
        category?: string;
        confidence?: number;
        pinned?: boolean;
        priority?: number;
        tags?: string[];
      }>
    ) => {
      if (!userId) throw new Error("Not authenticated");
      const rows = items
        .map((it) => ({
          user_id: userId,
          content: String(it.content || "").trim(),
          category: it.category || "fact",
          confidence: typeof it.confidence === "number" ? Math.max(0, Math.min(1, it.confidence)) : 0.7,
          pinned: it.pinned ?? false,
          priority: typeof it.priority === "number" ? it.priority : (it.pinned ? 100 : 0),
          tags: it.tags ?? [],
          scope: "personal",
          is_active: true,
        }))
        .filter((r) => r.content.length > 0)
        .slice(0, 200);

      if (!rows.length) return 0;
      const { error } = await supabase.from("user_memories").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: invalidate,
  });

  return {
    memoryFiles,
    totalCount,
    isLoading,
    createMemory,
    updateMemory,
    deleteMemory,
    importMemories,
  };
}

export function generateMarkdownContent(file: MemoryFile): string {
  if (file.markdownContent) return file.markdownContent;

  const lines: string[] = [
    "---",
    `file: ${file.fileName}`,
    `memories: ${file.memories.length}`,
    `last_updated: ${file.lastUpdated ? file.lastUpdated.split("T")[0] : "unknown"}`,
    `category: ${file.tag}`,
    "---",
    "",
    `## ${file.tag === "core" ? "Core Memory" : file.tag.charAt(0).toUpperCase() + file.tag.slice(1).replace(/-/g, " ")}`,
    "",
  ];
  if (file.description) {
    lines.push(`> ${file.description}`, "");
  }
  for (const mem of file.memories) {
    const importance =
      mem.importance_score != null ? ` _(${(mem.importance_score * 100).toFixed(0)}%)_` : "";
    lines.push(`- ${mem.content_summary}${importance}`);
  }
  return lines.join("\n");
}

// ── Export helpers ──
export function exportAllAsMarkdown(files: MemoryFile[]): string {
  if (files.length === 1 && files[0].tag === "core") {
    return generateMarkdownContent(files[0]);
  }

  const date = new Date().toISOString().split("T")[0];
  const lines: string[] = [
    "---",
    `export_date: ${date}`,
    `format: beebot-memory-v1`,
    `total_files: ${files.length}`,
    `total_memories: ${files.reduce((s, f) => s + f.memories.length, 0)}`,
    "---",
    "",
    "# BeeBot Memory Export",
    "",
    "> This file is portable. You can paste it into ChatGPT custom instructions, Claude project memory, or Gemini Gems.",
    "",
  ];
  for (const f of files) {
    lines.push(`## ${f.fileName}`, "");
    for (const m of f.memories) {
      lines.push(`- ${m.content_summary}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function exportAllAsJson(files: MemoryFile[]): string {
  const items: Array<{ content: string; category: string; confidence: number }> = [];
  for (const f of files) {
    if (f.tag === "core" || f.mirror) continue; // skip generated mirror files
    for (const m of f.memories) {
      if (!m.editable) continue; // only export user-curated
      items.push({
        content: m.content_summary,
        category: m.category || f.tag || "fact",
        confidence: m.importance_score ?? 0.7,
      });
    }
  }
  return JSON.stringify(
    {
      format: "beebot-memory-v1",
      exported_at: new Date().toISOString(),
      items,
    },
    null,
    2
  );
}

// ── Import parser: accepts Markdown bullets, JSON, or plain text ──
export interface ParsedImportItem {
  content: string;
  category: string;
  confidence: number;
}

export function parseImportText(raw: string): ParsedImportItem[] {
  const text = raw.trim();
  if (!text) return [];

  // Try JSON first
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed) ? parsed : parsed.items || parsed.memories || [];
      return arr
        .map((it: any) => ({
          content: String(it.content || it.text || it.summary || it.fact_value || "").trim(),
          category: String(it.category || it.type || "fact").toLowerCase(),
          confidence: typeof it.confidence === "number" ? it.confidence : 0.7,
        }))
        .filter((it: ParsedImportItem) => it.content.length > 0);
    } catch {
      /* fall through */
    }
  }

  // Markdown / plain text — extract bullets and non-empty lines
  const items: ParsedImportItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#") || trimmed.startsWith("---") || trimmed.startsWith(">")) continue;
    const cleaned = trimmed.replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, "").trim();
    if (cleaned.length < 3) continue;
    items.push({ content: cleaned, category: "fact", confidence: 0.7 });
  }
  return items;
}

import { Children, cloneElement, isValidElement, memo, useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkDirective from "remark-directive";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Copy, CheckCircle as Check, Document as FileText, MagicStick3 as Sparkles, InfoCircle as Info, DangerTriangle as AlertTriangle, CheckCircle as CheckCircle2 } from "@solar-icons/react";
import { Brain, Bot, Folder, File, FolderTree } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAttachment } from "@/repositories/local/attachmentStore";
import { DataviewQueryCard, type NoteItem } from "@/components/editor/DataviewQueryCard";

// Renders an `attachment:<id>` reference: image → <img>, PDF → native <iframe>
// viewer, anything else → download link. Blob URL resolved async from IndexedDB.
function AttachmentMedia({ id, alt }: { id: string; alt?: string }) {
  const [data, setData] = useState<{ url: string; type: string; name: string } | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    getAttachment(id).then((d) => { if (alive) (d ? setData(d) : setMissing(true)); });
    return () => { alive = false; };
  }, [id]);

  if (missing) return <span className="block p-4 text-[13px] text-[var(--bb-text-3)]">Attachment not found.</span>;
  if (!data) return <span className="block p-4 text-[13px] text-[var(--bb-text-3)]">Loading…</span>;
  if (data.type === "application/pdf") {
    return <iframe src={data.url} title={data.name || alt || "PDF"} className="block w-full h-[70vh] border-0" />;
  }
  if (data.type.startsWith("image/")) {
    return <img src={data.url} alt={alt || data.name} className="block w-full h-auto" />;
  }
  return (
    <a href={data.url} download={data.name} className="flex items-center gap-2 p-4 text-[14px] text-[var(--bb-text-1)] hover:underline">
      <FileText className="h-4 w-4 shrink-0" strokeWidth={1.85} />{data.name || alt || "Download file"}
    </a>
  );
}

// KaTeX CSS is ~25KB but only needed once any math is rendered. Lazy-load
// it on the first reader mount so users without math notes never pay.
let katexCssLoaded = false;
function ensureKatexCss() {
  if (katexCssLoaded || typeof document === "undefined") return;
  katexCssLoaded = true;
  import("katex/dist/katex.min.css").catch(() => { katexCssLoaded = false; });
}

// Mermaid singleton (lazy). Renders SVG into a host div via mermaid.render().
type MermaidLike = { initialize: (cfg: Record<string, unknown>) => void; render: (id: string, code: string) => Promise<{ svg: string }> };
let mermaidPromise: Promise<MermaidLike> | null = null;
async function getMermaid(): Promise<MermaidLike> {
  if (mermaidPromise) return mermaidPromise;
  mermaidPromise = (async () => {
    const mod = await import("mermaid");
    const m = (mod.default ?? mod) as MermaidLike;
    const theme = document.documentElement.getAttribute("data-bb-theme") === "light" ? "default" : "dark";
    m.initialize({ startOnLoad: false, theme, securityLevel: "strict", fontFamily: "inherit" });
    return m;
  })();
  return mermaidPromise;
}

// ── Shiki singleton (lazy) ─────────────────────────────────────────────────
// Shiki ships ~1.5MB of grammars; we keep ONE highlighter instance and load
// languages on demand so the first paint isn't blocked.
type HighlighterLike = { codeToHtml: (code: string, opts: { lang: string; theme: string }) => string; getLoadedLanguages: () => string[] };
let highlighterPromise: Promise<HighlighterLike> | null = null;
async function getHighlighter(): Promise<HighlighterLike> {
  if (highlighterPromise) return highlighterPromise;
  highlighterPromise = (async () => {
    // shiki/bundle/web ships ~12 popular langs only (~700KB raw / ~180KB gz),
    // vs the full shiki bundle (~9MB). Unknown languages fall back to plain.
    const { createHighlighter } = await import("shiki/bundle/web");
    return createHighlighter({
      themes: ["catppuccin-mocha", "github-light"],
      langs: ["ts", "tsx", "js", "jsx", "json", "md", "bash", "css", "html", "yaml", "python"],
    }) as unknown as HighlighterLike;
  })();
  return highlighterPromise;
}
async function loadLang(_highlighter: HighlighterLike, _lang: string) {
  // shiki/bundle/web's createHighlighter loads all listed langs eagerly at
  // creation time — nothing to dynamically load. Unknown langs short-circuit
  // because codeToHtml will throw and the caller catches.
}

// ── Lightweight YAML frontmatter parser ────────────────────────────────────
// Codex's metadata card needs key/value pairs. A real YAML parser is overkill
// for the simple `key: value` style frontmatter common in notes. This handles
// scalar values, quoted strings, and multi-line `>` / `|` blocks coarsely.
function parseFrontmatter(raw: string): Array<{ key: string; value: string }> | null {
  if (!raw) return null;
  const lines = raw.split(/\r?\n/);
  const out: Array<{ key: string; value: string }> = [];
  let pendingKey: string | null = null;
  let pendingBuffer: string[] = [];
  const flush = () => {
    if (pendingKey !== null) {
      out.push({ key: pendingKey, value: pendingBuffer.join(" ").trim() });
      pendingKey = null;
      pendingBuffer = [];
    }
  };
  for (const line of lines) {
    if (!line.trim()) continue;
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
    if (match) {
      flush();
      const value = match[2].trim().replace(/^["']|["']$/g, "");
      if (value) out.push({ key: match[1], value });
      else { pendingKey = match[1]; pendingBuffer = []; }
    } else if (pendingKey !== null) {
      pendingBuffer.push(line.trim());
    }
  }
  flush();
  return out.length ? out : null;
}

// Split `---\nfrontmatter\n---\nbody` into the two halves.
function splitFrontmatter(content: string): { fm: string | null; body: string } {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: null, body: content };
  return { fm: m[1], body: m[2] };
}

// ── Notion-Style Property Header Pills & YAML Text (Pillar 4) ─────────────
function MetadataCard({ entries }: { entries: Array<{ key: string; value: string }> }) {
  const getBadgeStyle = (k: string, v: string) => {
    const val = v.toLowerCase();
    if (k === "status") {
      if (val === "done" || val === "completed") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
      if (val === "in progress" || val === "active") return "bg-sky-500/15 text-sky-400 border-sky-500/30";
      if (val === "blocked") return "bg-rose-500/15 text-rose-400 border-rose-500/30";
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    }
    if (k === "priority") {
      if (val === "urgent" || val === "high") return "bg-rose-500/15 text-rose-400 border-rose-500/30 font-bold";
      if (val === "medium") return "bg-amber-500/15 text-amber-400 border-amber-500/30";
      return "bg-sky-500/15 text-sky-400 border-sky-500/30";
    }
    return "bg-[var(--bb-bg-3)] text-[var(--bb-text-2)] border-[var(--bb-border)]";
  };

  return (
    <div className="not-prose mb-8 rounded-2xl border border-[var(--bb-border)] bg-[var(--bb-bg-0)] p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between border-b border-[var(--bb-border)] pb-2.5 text-xs font-semibold text-[var(--bb-text-3)]">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--beebot-accent,#f4d35e)]" />
          <span>Note Properties</span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--bb-text-4)]">YAML / AI Readable</span>
      </div>

      {/* Notion-Style Visual Pills */}
      <div className="flex flex-wrap items-center gap-2.5">
        {entries.map(({ key, value }) => {
          const k = key.toLowerCase();
          const isPill = k === "status" || k === "priority" || k === "type" || k === "project" || k === "due";
          return (
            <div key={key} className="flex items-center gap-1.5 rounded-lg border border-[var(--bb-border)] bg-[var(--bb-bg-1)] px-2.5 py-1 text-xs">
              <span className="font-mono text-[11px] text-[var(--bb-text-3)] uppercase tracking-wider">{key}:</span>
              {isPill ? (
                <span className={cn("rounded-md border px-2 py-0.5 font-medium capitalize", getBadgeStyle(k, value))}>
                  {value}
                </span>
              ) : (
                <span className="font-medium text-[var(--bb-text-1)]">{value}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Copyable code block ────────────────────────────────────────────────────
function CodeBlock({ language, children }: { language?: string; children: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };
  // Shiki-rendered HTML (async). Falls back to plain pre while loading or on
  // unknown language. We re-tokenize when the active theme changes so dark ↔
  // light swaps don't leave stale colors.
  const [highlighted, setHighlighted] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hl = await getHighlighter();
        const lang = language?.toLowerCase() || "text";
        await loadLang(hl, lang);
        const theme = document.documentElement.getAttribute("data-bb-theme") === "light" ? "github-light" : "catppuccin-mocha";
        const html = hl.codeToHtml(children, { lang, theme });
        if (!cancelled) setHighlighted(html);
      } catch { /* keep plain fallback */ }
    })();
    return () => { cancelled = true; };
  }, [children, language]);

  return (
    <div className="not-prose group relative my-[1.05em] min-w-0 max-w-full overflow-hidden rounded-[14px] border border-[#262628] bg-[#161618]">
      <div className="flex items-center justify-between border-b border-[#262628] px-4 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[#7a7a7c]">{language || "text"}</span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-[#9b9b9d] opacity-0 transition-opacity hover:bg-[#202022] hover:text-[#ededed] group-hover:opacity-100 focus-visible:opacity-100"
          aria-label="Copy code"
        >
          {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
        </button>
      </div>
      {highlighted ? (
        <div
          className="bb-shiki overflow-x-auto p-[1em_1.2em] font-mono text-[0.85em] leading-[1.55] text-[#d4d4d4] [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      ) : (
        <pre className="overflow-x-auto p-[1em_1.2em] font-mono text-[0.85em] leading-[1.55] text-[#d4d4d4]">
          <code>{children}</code>
        </pre>
      )}
    </div>
  );
}

// ── Mermaid diagram block ──────────────────────────────────────────────────
// Fenced ```mermaid blocks render as inline SVG via the lazy-loaded mermaid
// library. Failure (bad syntax) falls back to the raw code so users can fix it.
function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await getMermaid();
        const id = `bb-mermaid-${Math.abs(code.split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0))}`;
        const { svg } = await m.render(id, code);
        if (!cancelled) { setSvg(svg); setError(null); }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Mermaid render failed");
      }
    })();
    return () => { cancelled = true; };
  }, [code]);
  if (error) {
    return (
      <div className="not-prose my-5 min-w-0 max-w-full overflow-hidden rounded-xl border border-[var(--bb-border-strong)] bg-[var(--bb-bg-2)] p-4">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--bb-text-4)]">Mermaid (syntax error)</div>
        <pre className="overflow-x-auto font-mono text-[13px] text-[var(--bb-text-2)]"><code>{code}</code></pre>
      </div>
    );
  }
  return (
    <div className="not-prose my-5 flex min-w-0 max-w-full justify-center overflow-x-auto rounded-xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-4">
      {svg ? <div className="bb-mermaid max-w-full [&_svg]:max-w-full [&_svg]:h-auto" dangerouslySetInnerHTML={{ __html: svg }} /> : (
        <div className="py-6 text-[11px] text-[var(--bb-text-4)]">Loading diagram…</div>
      )}
    </div>
  );
}

// ── Visual File Tree / Folder Structure Block (Pillar 4 / Ponytail) ────────
function FileTreeBlock({ code }: { code: string }) {
  const lines = code.trim().split(/\r?\n/).filter(Boolean);
  return (
    <div className="not-prose my-4 min-w-0 max-w-full overflow-x-auto rounded-2xl border border-[var(--bb-border)] bg-[var(--bb-bg-0)] p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between border-b border-[var(--bb-border)] pb-2.5 text-xs font-semibold text-[var(--bb-text-3)]">
        <div className="flex items-center gap-2">
          <FolderTree className="h-4 w-4 text-[var(--beebot-accent,#f4d35e)]" />
          <span>Directory Structure</span>
        </div>
        <span className="rounded bg-[var(--bb-bg-2)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--bb-text-4)] border border-[var(--bb-border)]">File Tree</span>
      </div>
      <div className="space-y-1.5 font-mono text-xs">
        {lines.map((line, idx) => {
          const match = line.match(/^([│├└─\s]*)(.*)$/);
          const prefix = match ? match[1] : "";
          const content = match ? match[2].trim() : line.trim();
          const descMatch = content.match(/^([^\s(]+)\s*\(([^)]+)\).*$/);
          const name = descMatch ? descMatch[1] : content;
          const desc = descMatch ? descMatch[2] : "";
          const isFolder = name.endsWith("/") || (!name.includes(".") && !descMatch && idx === 0);

          return (
            <div key={idx} className="flex items-center gap-2 text-[var(--bb-text-1)] hover:bg-[var(--bb-bg-1)] px-2 py-1 rounded-lg transition-colors">
              <span className="text-[var(--bb-text-4)] select-none whitespace-pre">{prefix}</span>
              {isFolder ? (
                <Folder className="h-3.5 w-3.5 text-amber-400 shrink-0 fill-amber-400/20" />
              ) : (
                <File className="h-3.5 w-3.5 text-sky-400 shrink-0" />
              )}
              <span className={cn("font-medium", isFolder ? "text-amber-300 font-semibold" : "text-[var(--bb-text-1)]")}>
                {name}
              </span>
              {desc && (
                <span className="ml-2 rounded bg-[var(--bb-bg-2)] px-1.5 py-0.5 text-[10px] font-sans text-[var(--bb-text-3)] border border-[var(--bb-border)]">
                  {desc}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Directive cards (:::memory / :::skill / :::agent / :::note / :::warn) ──
// Markdown becomes a database: any `:::name\n…body…\n:::` block in a note is
// rendered as a typed React card. Pure additive feature — old notes unaffected.
const DIRECTIVE_VARIANTS: Record<string, { Icon: typeof Brain; label: string; tone: "neutral" | "accent" | "warn" | "success" | "info" }> = {
  memory:  { Icon: Brain,         label: "Memory",  tone: "accent" },
  skill:   { Icon: Sparkles,      label: "Skill",   tone: "accent" },
  agent:   { Icon: Bot,           label: "Agent",   tone: "accent" },
  note:    { Icon: Info,          label: "Note",    tone: "info" },
  info:    { Icon: Info,          label: "Info",    tone: "info" },
  warn:    { Icon: AlertTriangle, label: "Warning", tone: "warn" },
  warning: { Icon: AlertTriangle, label: "Warning", tone: "warn" },
  success: { Icon: CheckCircle2,  label: "Success", tone: "success" },
  tip:     { Icon: Sparkles,      label: "Tip",     tone: "accent" },
};
function DirectiveCard({ name, title, children }: { name: string; title?: string; children: ReactNode }) {
  const variant = DIRECTIVE_VARIANTS[name] ?? DIRECTIVE_VARIANTS.note;
  const { Icon, label, tone } = variant;
  const toneClasses: Record<typeof tone, { ring: string; iconBg: string; iconColor: string }> = {
    neutral: { ring: "border-[var(--bb-border)]",         iconBg: "bg-[var(--bb-bg-3)]",  iconColor: "text-[var(--bb-text-2)]" },
    accent:  { ring: "border-[var(--bb-border-strong)]",  iconBg: "bg-[var(--bb-accent-soft)]", iconColor: "text-[var(--bb-accent)]" },
    info:    { ring: "border-[var(--bb-border-strong)]",  iconBg: "bg-[rgba(0,119,170,0.18)]", iconColor: "text-[#5BB0E0]" },
    warn:    { ring: "border-[var(--bb-border-strong)]",  iconBg: "bg-[rgba(168,110,0,0.22)]", iconColor: "text-[#E0A85B]" },
    success: { ring: "border-[var(--bb-border-strong)]",  iconBg: "bg-[rgba(22,135,90,0.20)]", iconColor: "text-[#6BD5A2]" },
  } as const;
  const t = toneClasses[tone];
  return (
    <aside className={cn("not-prose my-6 overflow-hidden rounded-2xl border bg-[var(--bb-bg-2)]", t.ring)}>
      <div className="flex items-center gap-2 border-b border-[var(--bb-border)] px-4 py-2.5">
        <span className={cn("inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md", t.iconBg, t.iconColor)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--bb-text-2)]">{label}</span>
        {title && <span className="ml-2 truncate text-[13px] text-[var(--bb-text-1)]">{title}</span>}
      </div>
      <div className="px-4 py-3 text-[14.5px] leading-[1.7] text-[var(--bb-text-2)] [&>p]:my-1.5 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
        {children}
      </div>
    </aside>
  );
}

// ── Embed block (transcludes another note's body inline) ──────────────────
// `spec` is the raw `[[…]]` inside, e.g. "Welcome" or "Roadmap#Phase 1".
// Depth-guarded recursion: nested NoteReader gets _depth+1; >=3 stops.
function EmbedBlock({ spec, depth, getNoteContent, onWikilinkActivate, isResolvedTarget }: {
  spec: string;
  depth: number;
  getNoteContent?: (target: string) => string | null | undefined;
  onWikilinkActivate?: (target: string) => void;
  isResolvedTarget?: (target: string) => boolean;
}) {
  const [target, heading] = spec.split("#").map((s) => s.trim());
  const noteBody = getNoteContent ? getNoteContent(target) : null;

  // Click-through opens the source note in a new tab via the wikilink handler.
  const onOpen = () => onWikilinkActivate?.(target);

  // Recursion guard. The card header still shows + offers click-through.
  const tooDeep = depth >= MAX_EMBED_DEPTH;
  // Resolution failed (note not found OR cache cold) → degrade gracefully.
  const resolved = noteBody != null;
  const sectioned = resolved && heading ? extractSection(noteBody!, heading) : noteBody;

  return (
    <aside className="not-prose my-5 overflow-hidden rounded-2xl border border-[var(--bb-border)] bg-[var(--bb-bg-1)]">
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full items-center gap-2 border-b border-[var(--bb-border)] px-4 py-2 text-left transition-colors hover:bg-[var(--bb-bg-3)]"
        title={onWikilinkActivate ? `Open ${target}` : undefined}
      >
        <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--bb-text-4)]" />
        <span className="truncate text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--bb-text-3)] group-hover:text-[var(--bb-text-1)]">
          {target}{heading && <span className="ml-1 normal-case tracking-normal text-[var(--bb-text-4)] font-normal">› {heading}</span>}
        </span>
      </button>
      <div className="px-4 py-3">
        {tooDeep ? (
          <p className="text-[13px] text-[var(--bb-text-4)] italic">Embed nesting limit reached. <button type="button" onClick={onOpen} className="text-[var(--bb-accent)] hover:underline">Open {target} →</button></p>
        ) : !resolved ? (
          <p className="text-[13px] text-[var(--bb-text-4)] italic">
            <button type="button" onClick={onOpen} className="text-[var(--bb-accent)] hover:underline">{target}</button> not loaded yet.
          </p>
        ) : sectioned === null ? (
          <p className="text-[13px] text-[var(--bb-text-4)] italic">Section &ldquo;{heading}&rdquo; not found in {target}.</p>
        ) : (
          // Nested reader — same renderers + tokens, just deeper. We strip
          // the className margin so the embed sits flush inside the card.
          <NoteReader
            content={sectioned || ""}
            className="!mx-0 !max-w-none !px-0 !py-0"
            onWikilinkActivate={onWikilinkActivate}
            isResolvedTarget={isResolvedTarget}
            getNoteContent={getNoteContent}
            _depth={depth + 1}
          />
        )}
      </div>
    </aside>
  );
}

// remark-directive ships the parser; this tiny plugin maps containerDirective
// nodes (`:::name[Title]\nbody\n:::`) onto a plain `<div>` with data-attrs so
// react-markdown's component map can swap in our DirectiveCard.
function remarkDirectiveToHtml() {
  return (tree: { children?: unknown[] }) => {
    const walk = (node: { type?: string; name?: string; children?: { type?: string; value?: string }[]; data?: Record<string, unknown> }) => {
      if (node.type === "containerDirective" || node.type === "leafDirective" || node.type === "textDirective") {
        // First paragraph's text is treated as the inline title attribute
        // (`:::memory[User likes Bitcoin]` → title="User likes Bitcoin").
        const labelChildren = (node.children?.[0] as { data?: { directiveLabel?: boolean }; children?: { type?: string; value?: string }[] } | undefined);
        let title: string | undefined;
        if (labelChildren?.data?.directiveLabel && labelChildren.children) {
          title = labelChildren.children.map((c) => c.value || "").join("");
          node.children?.shift();
        }
        node.data = node.data || {};
        node.data.hName = "div";
        node.data.hProperties = { "data-directive": node.name || "note", ...(title ? { "data-directive-title": title } : {}) };
      }
      if (Array.isArray((node as { children?: unknown[] }).children)) {
        for (const c of (node as { children: unknown[] }).children) walk(c as { type?: string; name?: string; children?: { type?: string; value?: string }[]; data?: Record<string, unknown> });
      }
    };
    walk(tree as { type?: string; name?: string; children?: { type?: string; value?: string }[]; data?: Record<string, unknown> });
  };
}

// ── Embed transclusion (![[Target]] / ![[Target#Heading]]) ────────────────
// Standalone `![[X]]` lines render the linked note inline as a card. Inline
// `![[X]]` inside a paragraph is left for the next iteration — Obsidian's
// own convention is block-level embed on its own line.
const EMBED_LINE = /^!\[\[([^[\]\r\n]+)\]\]\s*$/gm;

function preprocessEmbeds(body: string): string {
  let res = body.replace(EMBED_LINE, (_m, spec) => {
    // remark-directive labels can't contain `]`, but `#` and `|` are fine.
    return `:::embed[${spec.trim()}]\n:::`;
  });
  // ponytail: replace 3+ consecutive newlines (\n\n\n+) with proper independent spacer paragraphs (\n\n&nbsp;\n\n) so skipped lines never get deleted or merged!
  res = res.replace(/\n{3,}/g, (match) => {
    const extraLines = match.length - 2;
    return "\n\n" + "&nbsp;\n\n".repeat(extraLines);
  });
  return res;
}

// Extract just the heading-anchored section from a full note body.
// Matches the heading line (any level) whose text === target, then returns
// the body until the NEXT heading of same-or-shallower depth.
function extractSection(body: string, headingText: string): string | null {
  const lines = body.split(/\r?\n/);
  const target = headingText.trim().toLowerCase();
  let startIdx = -1;
  let startLevel = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (m && m[2].trim().toLowerCase() === target) {
      startIdx = i;
      startLevel = m[1].length;
      break;
    }
  }
  if (startIdx === -1) return null;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const m = lines[i].match(/^(#{1,6})\s+/);
    if (m && m[1].length <= startLevel) { endIdx = i; break; }
  }
  return lines.slice(startIdx, endIdx).join("\n");
}

// ── Optional wikilink resolver / activation ────────────────────────────────
export interface NoteReaderProps {
  content: string;
  className?: string;
  /** Called on Cmd/Ctrl-click of a `[[wikilink]]`. Falls back to plain text if absent. */
  onWikilinkActivate?: (target: string) => void;
  isResolvedTarget?: (target: string) => boolean;
  /** Resolves an embed `![[Target]]` to that note's full markdown body. */
  getNoteContent?: (target: string) => string | null | undefined;
  /** Notes array for live Dataview embedded queries. */
  notes?: NoteItem[];
  /** Internal: tracks recursive embed depth to prevent infinite loops. */
  _depth?: number;
}

// Hard cap embed nesting; anything deeper renders as a plain link instead.
const MAX_EMBED_DEPTH = 3;

// Match `[[Target]]` or `[[Target|Display]]` for inline rendering.
const WIKILINK = /\[\[([^[\]\r\n|]+)(?:\|([^[\]\r\n]+))?\]\]/g;

function renderWithWikilinks(
  text: string,
  onActivate: ((target: string) => void) | undefined,
  isResolved: ((target: string) => boolean) | undefined,
): ReactNode {
  if (!onActivate || !text.includes("[[")) return text;
  const out: ReactNode[] = [];
  let last = 0;
  WIKILINK.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKILINK.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const target = m[1].trim();
    const display = (m[2] || m[1]).trim();
    const resolved = isResolved ? isResolved(target) : true;
    out.push(
      <button
        key={`${m.index}-${target}`}
        type="button"
        onClick={(event) => { event.preventDefault(); onActivate(target); }}
        className={cn(
          "inline rounded-[5px] px-[6px] py-[1px] font-medium transition-colors no-underline cursor-pointer",
          resolved
            ? "text-[var(--beebot-accent,#f4d35e)] bg-[color-mix(in_oklab,var(--beebot-accent,#f4d35e)_11%,transparent)] hover:bg-[color-mix(in_oklab,var(--beebot-accent,#f4d35e)_20%,transparent)]"
            : "text-[#9b9b9d] bg-[rgba(255,255,255,0.05)]",
        )}
        title={resolved ? display : `${target} (no matching note)`}
      >
        {display}
      </button>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : text;
}

// Walk react-markdown children and process strings through the wikilink renderer.
function withWikilinks(children: ReactNode, onActivate: ((t: string) => void) | undefined, isResolved: ((t: string) => boolean) | undefined): ReactNode {
  if (!onActivate) return children;
  if (typeof children === "string") return renderWithWikilinks(children, onActivate, isResolved);
  if (Array.isArray(children)) return children.map((c, i) => (
    typeof c === "string" ? <span key={i}>{renderWithWikilinks(c, onActivate, isResolved)}</span> : c
  ));
  return children;
}

// ── Hex color swatch detector ───────────────────────────────────────────────
// Codex's signature: any `#RRGGBB` (or `#RGB`) string in a table cell or inline
// code is decorated with a tiny filled square showing the actual color. Auto-
// detect via regex so existing Markdown tables get the treatment for free.
const HEX_COLOR = /#(?:[0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g;

function decorateHexSwatches(text: string): ReactNode {
  if (!text || !text.includes("#")) return text;
  HEX_COLOR.lastIndex = 0;
  const out: ReactNode[] = [];
  let last = 0;
  let matchCount = 0;
  let m: RegExpExecArray | null;
  while ((m = HEX_COLOR.exec(text)) !== null) {
    matchCount += 1;
    if (m.index > last) out.push(text.slice(last, m.index));
    const hex = m[0];
    out.push(
      <span key={`${m.index}-${hex}`} className="inline-flex items-center gap-1.5 align-middle">
        <span className="font-mono text-[0.95em] tabular-nums text-[var(--bb-text-1)]">{hex}</span>
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 shrink-0 rounded-[3px] ring-1 ring-inset ring-[var(--bb-border-strong)]"
          style={{ backgroundColor: hex }}
        />
      </span>,
    );
    last = m.index + hex.length;
  }
  if (last < text.length) out.push(text.slice(last));
  // Return decorated nodes whenever we found at least one hex — even when the
  // cell is JUST a hex (e.g. "#0B0C0F"), out.length === 1 and matchCount === 1.
  return matchCount > 0 ? out : text;
}

// Combined walker — wikilinks first, then hex swatches on the leftover strings.
function withInlineDecorations(children: ReactNode, onActivate: ((t: string) => void) | undefined, isResolved: ((t: string) => boolean) | undefined, withSwatches: boolean): ReactNode {
  const handleString = (s: string, key?: number): ReactNode => {
    const withLinks = onActivate ? renderWithWikilinks(s, onActivate, isResolved) : s;
    if (!withSwatches) return withLinks;
    if (typeof withLinks === "string") return decorateHexSwatches(withLinks);
    if (Array.isArray(withLinks)) {
      return withLinks.map((part, i) => typeof part === "string" ? <span key={`${key ?? 0}-${i}`}>{decorateHexSwatches(part)}</span> : part);
    }
    return withLinks;
  };
  if (typeof children === "string") return handleString(children);
  if (Array.isArray(children)) return children.map((c, i) => typeof c === "string" ? <span key={i}>{handleString(c, i)}</span> : c);
  return children;
}

function extractCalloutInfo(children: ReactNode): { type: string | null; cleanedChildren: ReactNode } {
  const childArray = Children.toArray(children);
  let firstIdx = 0;
  while (firstIdx < childArray.length && typeof childArray[firstIdx] === "string" && !childArray[firstIdx].toString().trim()) {
    firstIdx += 1;
  }
  if (firstIdx >= childArray.length) return { type: null, cleanedChildren: children };

  const first = childArray[firstIdx];
  if (isValidElement(first)) {
    const pChildren = Children.toArray((first.props as { children?: ReactNode }).children);
    let pIdx = 0;
    while (pIdx < pChildren.length && typeof pChildren[pIdx] === "string" && !pChildren[pIdx].toString().trim()) {
      pIdx += 1;
    }
    if (pIdx < pChildren.length && typeof pChildren[pIdx] === "string") {
      const match = /^\s*\[!([a-zA-Z0-9_-]+)\]\s*(.*)$/s.exec(pChildren[pIdx] as string);
      if (match) {
        const type = match[1];
        const restText = match[2];
        const newPChildren = restText ? [...pChildren.slice(0, pIdx), restText, ...pChildren.slice(pIdx + 1)] : [...pChildren.slice(0, pIdx), ...pChildren.slice(pIdx + 1)];
        const newFirst = newPChildren.length > 0 ? cloneElement(first as ReactElement<{ children?: ReactNode }>, { ...(first.props as object), children: newPChildren }) : null;
        const cleanedArray = newFirst ? [...childArray.slice(0, firstIdx), newFirst, ...childArray.slice(firstIdx + 1)] : [...childArray.slice(0, firstIdx), ...childArray.slice(firstIdx + 1)];
        return { type, cleanedChildren: cleanedArray };
      }
    }
  } else if (typeof first === "string") {
    const match = /^\s*\[!([a-zA-Z0-9_-]+)\]\s*(.*)$/s.exec(first);
    if (match) {
      const type = match[1];
      const restText = match[2];
      const cleanedArray = restText ? [...childArray.slice(0, firstIdx), restText, ...childArray.slice(firstIdx + 1)] : [...childArray.slice(0, firstIdx), ...childArray.slice(firstIdx + 1)];
      return { type, cleanedChildren: cleanedArray };
    }
  }
  return { type: null, cleanedChildren: children };
}

// ── Main reader ────────────────────────────────────────────────────────────
export const NoteReader = memo(function NoteReader({ content, className, onWikilinkActivate, isResolvedTarget, getNoteContent, notes = [], _depth = 0 }: NoteReaderProps) {
  const { fm, body: rawBody } = useMemo(() => splitFrontmatter(content), [content]);
  // Preprocess standalone ![[…]] lines into :::embed[…]:::  directives so the
  // existing remark-directive pipeline picks them up.
  const body = useMemo(() => {
    return preprocessEmbeds(rawBody);
  }, [rawBody]);
  const metadata = useMemo(() => (fm ? parseFrontmatter(fm) : null), [fm]);
  // KaTeX CSS only matters if the body contains math — cheap substring check
  // beats lazy-loading the (~25KB) stylesheet on every reader mount.
  useEffect(() => {
    if (body.includes("$") || body.includes("\\(") || body.includes("\\[")) ensureKatexCss();
  }, [body]);

  const components: Components = useMemo(() => ({
    h1: ({ children, ...props }) => (
      <h1 {...props} className="mt-[1em] mb-[0.4em] text-[1.8em] font-[700] leading-[1.3] text-[var(--bb-text-1)]">
        {withInlineDecorations(children, onWikilinkActivate, isResolvedTarget, true)}
      </h1>
    ),
    h2: ({ children, ...props }) => (
      <h2 {...props} className="mt-[1em] mb-[0.4em] text-[1.5em] font-[700] leading-[1.3] text-[var(--bb-text-1)]">
        {withInlineDecorations(children, onWikilinkActivate, isResolvedTarget, true)}
      </h2>
    ),
    h3: ({ children, ...props }) => (
      <h3 {...props} className="mt-[1em] mb-[0.4em] text-[1.3em] font-[700] leading-[1.3] text-[var(--bb-text-1)]">
        {withInlineDecorations(children, onWikilinkActivate, isResolvedTarget, true)}
      </h3>
    ),
    h4: ({ children, ...props }) => (
      <h4 {...props} className="mt-6 mb-2 text-[1.05em] font-[650] text-[var(--bb-text-1)]">
        {withInlineDecorations(children, onWikilinkActivate, isResolvedTarget, true)}
      </h4>
    ),
    h5: ({ children, ...props }) => (
      <h5 {...props} className="mt-4 mb-1.5 text-[1em] font-[650] text-[var(--bb-text-1)]">
        {withInlineDecorations(children, onWikilinkActivate, isResolvedTarget, true)}
      </h5>
    ),
    h6: ({ children, ...props }) => (
      <h6 {...props} className="mt-4 mb-1.5 text-[0.95em] font-[650] text-[var(--bb-text-2)]">
        {withInlineDecorations(children, onWikilinkActivate, isResolvedTarget, true)}
      </h6>
    ),
    p: ({ children, ...props }) => (
      <p {...props} className="my-[0.62em] text-[16px] leading-[1.68] tracking-[-0.003em] text-[var(--bb-text-1)]">
        {withInlineDecorations(children, onWikilinkActivate, isResolvedTarget, true)}
      </p>
    ),
    a: ({ children, href, ...props }) => (
      <a {...props} href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="text-[var(--beebot-accent,#f4d35e)] underline decoration-[color-mix(in_oklab,var(--beebot-accent,#f4d35e)_30%,transparent)] underline-offset-[3px] transition-colors hover:decoration-[var(--beebot-accent,#f4d35e)]">
        {children}
      </a>
    ),
    strong: ({ children, ...props }) => (
      <strong {...props} className="font-[650] text-[var(--bb-text-1)]">{withInlineDecorations(children, onWikilinkActivate, isResolvedTarget, true)}</strong>
    ),
    em: ({ children, ...props }) => (
      <em {...props} className="italic text-[var(--bb-text-1)]">{withInlineDecorations(children, onWikilinkActivate, isResolvedTarget, true)}</em>
    ),
    del: ({ children, ...props }) => (
      <del {...props} className="line-through text-[#6a6a6c]">{withInlineDecorations(children, onWikilinkActivate, isResolvedTarget, true)}</del>
    ),
    mark: ({ children, ...props }) => (
      <mark {...props} className="bg-[rgba(255,225,120,0.26)] rounded-[4px] px-[0.16em] py-0 text-inherit">{withInlineDecorations(children, onWikilinkActivate, isResolvedTarget, true)}</mark>
    ),
    ul: ({ children, className: ulClass, ...props }) => (
      <ul {...props} className={cn("my-[0.55em] text-[var(--bb-text-1)] text-[16px] leading-[1.68] tracking-[-0.003em] space-y-[0.3em] [&_ul]:my-[0.3em] [&_ul]:pl-[1.2em] marker:text-[var(--beebot-accent,#f4d35e)]", ulClass?.includes("contains-task-list") ? "list-none pl-[0.2em]" : "list-disc pl-[1.4em]")}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol {...props} className="my-[0.55em] pl-[1.4em] list-decimal text-[var(--bb-text-1)] text-[16px] leading-[1.68] tracking-[-0.003em] space-y-[0.3em] [&_ol]:my-[0.3em] [&_ol]:pl-[1.2em] marker:text-[var(--bb-text-2)] marker:font-[600]">
        {children}
      </ol>
    ),
    li: ({ children, className: liClass, ...props }) => (
      <li {...props} className={cn("my-[0.3em] text-[16px] leading-[1.68] text-[var(--bb-text-1)]", liClass?.includes("task-list-item") ? "flex items-center list-none" : "")}>
        {withInlineDecorations(children, onWikilinkActivate, isResolvedTarget, true)}
      </li>
    ),
    blockquote: ({ children, ...props }) => {
      const { type, cleanedChildren } = extractCalloutInfo(children);
      const t = type ? type.toLowerCase() : null;
      const icon = t === "note" || t === "info" ? "📝" :
                   t === "tip" || t === "hint" || t === "suggestion" ? "💡" :
                   t === "warning" || t === "caution" || t === "attention" ? "⚠️" :
                   t === "important" || t === "danger" || t === "error" || t === "bug" ? "🚨" :
                   t === "pass" || t === "success" || t === "done" || t === "check" || t === "ok" ? "✅" :
                   t === "question" || t === "help" ? "❓" :
                   t === "quote" || t === "cite" ? "💬" : "✨";
      const title = t === "insight" ? "Insight" :
                    t === "note" || t === "info" ? "Note" :
                    t === "tip" || t === "hint" || t === "suggestion" ? "Tip" :
                    t === "warning" || t === "caution" || t === "attention" ? "Warning" :
                    t === "important" || t === "danger" || t === "error" || t === "bug" ? "Important" :
                    t === "pass" || t === "success" || t === "done" || t === "check" || t === "ok" ? "Pass" :
                    t === "question" || t === "help" ? "Question" :
                    type ? type.charAt(0).toUpperCase() + type.slice(1).toLowerCase() : "";
      const borderClass = t === "important" || t === "danger" || t === "error" || t === "bug" ? "border-l-[#ef4444] bg-[rgba(239,68,68,0.08)]" :
                          t === "tip" || t === "hint" || t === "suggestion" ? "border-l-[#10b981] bg-[rgba(16,185,129,0.08)]" :
                          t === "warning" || t === "caution" || t === "attention" ? "border-l-[#f59e0b] bg-[rgba(245,158,11,0.08)]" :
                          t === "pass" || t === "success" || t === "done" || t === "check" || t === "ok" ? "border-l-[#22c55e] bg-[rgba(34,197,94,0.08)]" :
                          t === "note" || t === "info" ? "border-l-[#0ea5e9] bg-[rgba(14,165,233,0.08)]" :
                          t === "question" || t === "help" ? "border-l-[#a855f7] bg-[rgba(168,85,247,0.08)]" :
                          "border-l-[var(--beebot-accent,#f4d35e)] bg-[color-mix(in_oklab,var(--beebot-accent,#f4d35e)_5%,transparent)]";
      const titleColorClass = t === "important" || t === "danger" || t === "error" || t === "bug" ? "text-[#ef4444]" :
                              t === "tip" || t === "hint" || t === "suggestion" ? "text-[#10b981]" :
                              t === "warning" || t === "caution" || t === "attention" ? "text-[#f59e0b]" :
                              t === "pass" || t === "success" || t === "done" || t === "check" || t === "ok" ? "text-[#22c55e]" :
                              t === "note" || t === "info" ? "text-[#0ea5e9]" :
                              t === "question" || t === "help" ? "text-[#a855f7]" :
                              "text-[var(--beebot-accent,#f4d35e)]";
      return (
        <blockquote {...props} className={`my-[1.2em] rounded-[14px] border border-[#242426] border-l-[3px] py-[0.9em] px-[1.1em] text-[#c4c4c6] text-[14px] not-italic leading-[1.68] ${borderClass}`}>
          {type && (
            <div className={`font-semibold text-[13px] mb-[4px] flex items-center gap-[6px] select-none ${titleColorClass}`}>
              <span>{icon}</span>
              <span>{title}</span>
            </div>
          )}
          {withInlineDecorations(cleanedChildren, onWikilinkActivate, isResolvedTarget, true)}
        </blockquote>
      );
    },
    hr: () => <hr className="my-[1em] border-0 border-t border-[#262628]" />,
    code: ({ children, className: codeClass, ...props }: { children?: ReactNode; className?: string; node?: unknown }) => {
      const rawText = typeof children === "string" ? children : Array.isArray(children) && children.every((c) => typeof c === "string") ? children.join("") : String(children || "");
      const isMultiLineOrTree = rawText.includes("\n") || rawText.includes("├──") || rawText.includes("└──") || rawText.includes("│   ") || rawText.includes("+--") || rawText.includes("|--");
      const isInline = (!codeClass || !codeClass.includes("language-")) && !isMultiLineOrTree;
      if (isInline) {
        // Auto-decorate hex colors with a tiny swatch (Codex signature look).
        const text = typeof children === "string" ? children : Array.isArray(children) && children.every((c) => typeof c === "string") ? children.join("") : null;
        const decorated = text ? decorateHexSwatches(text) : children;
        return (
          <code {...props} className="rounded-[5px] bg-[#1c1c1e] px-[0.4em] py-[0.12em] font-mono text-[0.87em] text-[#e6c07b]">
            {decorated}
          </code>
        );
      }
      const language = codeClass?.replace(/^language-/, "") || "text";
      const text = rawText.replace(/\n$/, "");
      // Fenced ```mermaid blocks render as live SVG diagrams instead of code.
      if (language === "mermaid") return <MermaidBlock code={text} />;
      if (language === "query" || language === "dataview") return <DataviewQueryCard code={text} notes={notes} onOpenNote={onWikilinkActivate} />;
      if (language === "tree" || language === "folder" || language === "dir" || language === "filetree" || ((language === "text" || !language || language === "ascii") && isMultiLineOrTree && (text.includes("├──") || text.includes("└──") || text.includes("│   ") || text.includes("+--") || text.includes("|--")))) {
        return <FileTreeBlock code={text} />;
      }
      return <CodeBlock language={language}>{text}</CodeBlock>;
    },
    pre: ({ children }) => <>{children}</>, // CodeBlock already provides <pre>
    table: ({ children, ...props }) => (
      <div className="not-prose my-[0.7em] min-w-0 max-w-full overflow-x-auto">
        <table {...props} className="w-full border-collapse text-[14px]">{children}</table>
      </div>
    ),
    thead: ({ children, ...props }) => <thead {...props} className="border-b border-[var(--bb-border-strong)]">{children}</thead>,
    th: ({ children, ...props }) => <th {...props} className="px-4 py-3 text-left text-[13.5px] font-semibold text-[var(--bb-text-1)]">{children}</th>,
    td: ({ children, ...props }) => <td {...props} className="border-b border-[var(--bb-border)] px-4 py-3.5 text-[14px] leading-[1.5] text-[var(--bb-text-2)] align-top">{withInlineDecorations(children, onWikilinkActivate, isResolvedTarget, true)}</td>,
    img: ({ alt, src, ...props }) => {
      const attachmentId = typeof src === "string" && src.startsWith("attachment:") ? src.slice("attachment:".length) : null;
      return (
        <span className="not-prose my-5 block overflow-hidden rounded-xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)]">
          {attachmentId
            ? <AttachmentMedia id={attachmentId} alt={alt} />
            : <img {...props} src={src} alt={alt} className="block w-full h-auto" />}
        </span>
      );
    },
    input: ({ checked, type, ...props }) => (
      type === "checkbox"
        ? (
          checked ? (
            <span className="inline-flex items-center justify-center h-[17px] w-[17px] border-[1.5px] border-[var(--beebot-accent,#f4d35e)] bg-[var(--beebot-accent,#f4d35e)] rounded-full mr-2 align-[-3px] text-[#000] text-[11px] font-[700]">✓</span>
          ) : (
            <span className="inline-block h-[17px] w-[17px] border-[1.5px] border-[#6a6a6c] rounded-full mr-2 align-[-3px]"></span>
          )
        )
        : <input type={type} {...props} />
    ),
    // Directive containers transformed to <div data-directive="…"> by our
    // remarkDirectiveToHtml plugin. Anything without data-directive renders
    // as a plain div so unrelated raw HTML still works.
    div: ({ children, ...rest }: { children?: ReactNode; "data-directive"?: string; "data-directive-title"?: string }) => {
      const directive = rest["data-directive"];
      if (directive === "embed") {
        // The title slot holds the `Target[#Heading]` spec — see preprocessEmbeds.
        const spec = rest["data-directive-title"] || "";
        return (
          <EmbedBlock
            spec={spec}
            depth={_depth}
            getNoteContent={getNoteContent}
            onWikilinkActivate={onWikilinkActivate}
            isResolvedTarget={isResolvedTarget}
          />
        );
      }
      if (directive === "query" || directive === "dataview") {
        return <DataviewQueryCard spec={rest["data-directive-title"]} code={typeof children === "string" ? children : ""} notes={notes} onOpenNote={onWikilinkActivate} />;
      }
      if (directive) {
        return <DirectiveCard name={directive} title={rest["data-directive-title"]}>{children}</DirectiveCard>;
      }
      return <div {...rest}>{children}</div>;
    },
  }), [onWikilinkActivate, isResolvedTarget, getNoteContent, notes, _depth]);

  return (
    <article className={cn("mx-auto max-w-3xl min-w-0 max-w-full break-words px-2 py-6 text-[var(--bb-text-1)]", className)}>
      {metadata && metadata.length > 0 && <MetadataCard entries={metadata} />}
      <ReactMarkdown
        remarkPlugins={[remarkFrontmatter, remarkGfm, remarkDirective, remarkDirectiveToHtml, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, output: "html" }]]}
        components={components}
      >
        {/* react-markdown will skip the frontmatter node by default since remark-frontmatter parses it out */}
        {body}
      </ReactMarkdown>
      {!body.trim() && !metadata && (
        <div className="flex flex-col items-center justify-center py-16 text-center text-[var(--bb-text-4)]">
          <FileText className="mb-2 h-8 w-8 opacity-50" />
          <p className="text-sm">This note is empty.</p>
        </div>
      )}
    </article>
  );
});

export default NoteReader;

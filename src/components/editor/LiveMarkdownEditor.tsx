import { useState, useEffect, useLayoutEffect, useRef, type CSSProperties, type MutableRefObject } from "react";
import { EditorState, Compartment, Prec } from "@codemirror/state";
import { EditorView, keymap, drawSelection, dropCursor, highlightActiveLine, Decoration, WidgetType, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { saveAttachment, getAttachment } from "@/repositories/local/attachmentStore";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, HighlightStyle, syntaxTree, foldGutter, foldKeymap, indentOnInput, bracketMatching } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { openSearchPanel, searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { tags as t } from "@lezer/highlight";
import { cn } from "@/lib/utils";
import { VisualTableEditor } from "@/components/editor/VisualTableEditor";

// Note metadata used by the wikilink autocompletion + click resolver.
export interface WikiNote {
  path: string;
  title: string;
}

// ── Public types ───────────────────────────────────────────────────────────
export type MarkdownCommand =
  | "bold" | "italic" | "strikethrough" | "highlight" | "link" | "inline-code"
  | "math" | "comment" | "clear" | "code-block" | "math-block"
  | "bullet-list" | "numbered-list" | "task-list" | "quote" | "callout" | "body"
  | "footnote" | "table" | "horizontal-rule"
  | `heading-${1 | 2 | 3 | 4 | 5 | 6}`;

export interface RunCommandOptions {
  /** For "link", the URL to apply (the page collects this via askInput). */
  url?: string;
}

export interface LiveEditorHandle {
  getMarkdown(): string;
  setMarkdown(value: string): void;
  focus(): void;
  runCommand(name: MarkdownCommand, options?: RunCommandOptions): void;
  /** Open CodeMirror's in-document search panel (Cmd+F). */
  openSearch(): void;
  /** Returns true if the link prompt should be triggered (caller handles UI). */
  requestLink(): { selection: string };
}

export interface LiveMarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  editable?: boolean;
  spellCheck?: boolean;
  placeholder?: string;
  fontFamily?: string;
  className?: string;
  editorRef?: MutableRefObject<LiveEditorHandle | null>;
  /** Called when the user presses ⌘K — the page opens its in-app link dialog. */
  onLinkShortcut?: () => void;
  /** Live workspace notes for wikilink autocomplete + resolution. */
  notes?: WikiNote[];
  /** Resolver — called on Cmd/Ctrl-click of a wikilink. */
  onWikilinkActivate?: (target: string) => void;
  /** Used to render unresolved wikilinks in a muted color. */
  isResolvedTarget?: (target: string) => boolean;
  /** Fired when the editor loses focus — drives the silent title→filename sync. */
  onBlur?: () => void;
}

// ── Live-preview decorations (Obsidian-style) ──────────────────────────────
// Hide markdown markers (#, *, _, ~, `, [, ], ==, $) on lines NOT containing
// the caret. The lezer-markdown parse tree drives this so it matches what
// CodeMirror's highlight sees — no regex disagreement.
// Render an unordered list "-"/"*"/"+" marker as a real bullet glyph.
class BulletWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-bullet";
    span.textContent = "•";
    return span;
  }
}

// Render a task "[ ]" / "[x]" marker as a checkbox glyph.
class TaskWidget extends WidgetType {
  constructor(readonly checked: boolean) { super(); }
  eq(other: TaskWidget) { return other.checked === this.checked; }
  toDOM() {
    const span = document.createElement("span");
    span.className = this.checked ? "cm-task cm-task-done" : "cm-task";
    if (this.checked) {
      span.innerHTML = `<span style="display:inline-flex; align-items:center; justify-content:center; height:17px; width:17px; border:1.5px solid var(--beebot-accent, #f4d35e); background:var(--beebot-accent, #f4d35e); border-radius:50%; margin-right:8px; vertical-align:-3px; color:#000; font-size:11px; font-weight:700;">✓</span>`;
    } else {
      span.innerHTML = `<span style="display:inline-block; height:17px; width:17px; border:1.5px solid #6a6a6c; border-radius:50%; margin-right:8px; vertical-align:-3px;"></span>`;
    }
    return span;
  }
}

// Render a thematic break "---" / "***" / "___" as a horizontal rule line.
class HrWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-hr";
    return span;
  }
}

// Render `![alt](src)` inline as the actual image (or a file chip for PDFs/other),
// Obsidian-style — only off the caret line, so the raw markdown reveals for editing.
// attachment: refs resolve async from IndexedDB; resolved meta is cached so re-renders
// during typing are instant (no flicker).
type AttachmentMeta = { kind: "image" | "file"; url: string; name: string };
const attachmentMetaCache = new Map<string, AttachmentMeta>();

class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) { super(); }
  eq(other: ImageWidget) { return other.src === this.src && other.alt === this.alt; }
  private mediaFor(meta: AttachmentMeta): HTMLElement {
    if (meta.kind === "image") {
      const img = document.createElement("img");
      img.className = "cm-inline-image";
      img.src = meta.url;
      img.alt = this.alt || meta.name;
      return img;
    }
    return this.chip(`📄 ${meta.name || "file"}`);
  }
  private chip(label: string): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-file-chip";
    span.textContent = label;
    span.setAttribute("role", "img");
    span.setAttribute("aria-label", label);
    return span;
  }
  toDOM() {
    const wrap = document.createElement("span");
    wrap.className = "cm-inline-media";
    if (!this.src.startsWith("attachment:")) {
      const img = document.createElement("img");
      img.className = "cm-inline-image";
      img.src = this.src;
      img.alt = this.alt;
      wrap.appendChild(img);
      return wrap;
    }
    const id = this.src.slice("attachment:".length);
    const cached = attachmentMetaCache.get(id);
    if (cached) { wrap.appendChild(this.mediaFor(cached)); return wrap; }
    void getAttachment(id).then((data) => {
      if (!data) { wrap.appendChild(this.chip("⚠ attachment missing")); return; }
      const meta: AttachmentMeta = {
        kind: data.type.startsWith("image/") ? "image" : "file",
        url: data.url,
        name: data.name || this.alt,
      };
      attachmentMetaCache.set(id, meta);
      wrap.appendChild(this.mediaFor(meta));
    }).catch(() => {});
    return wrap;
  }
}

class CalloutHeaderWidget extends WidgetType {
  constructor(readonly type: string) { super(); }
  eq(other: CalloutHeaderWidget) { return this.type.toLowerCase() === other.type.toLowerCase(); }
  toDOM() {
    const div = document.createElement("div");
    div.className = "cm-callout-header";
    const t = this.type.toLowerCase();
    const icon = t === "note" || t === "info" ? "📝" :
                 t === "tip" || t === "hint" ? "💡" :
                 t === "warning" || t === "caution" ? "⚠️" :
                 t === "important" || t === "danger" ? "🚨" :
                 t === "quote" || t === "cite" ? "💬" : "✨";
    const title = t === "insight" ? "Insight" :
                  t === "note" ? "Note" :
                  t === "tip" ? "Tip" :
                  t === "warning" ? "Warning" :
                  t === "important" ? "Important" :
                  this.type.charAt(0).toUpperCase() + this.type.slice(1).toLowerCase();
    div.innerHTML = `<span style="margin-right: 6px;">${icon}</span><span>${title}</span>`;
    return div;
  }
}

// A quote line gets a left bar. It's structural STYLE, not a marker — so it stays even on
// the caret line (only the raw ">" reveals when you edit).
const quoteLineDeco = Decoration.line({ class: "cm-quoteline" });
const quoteLineSingleDeco = Decoration.line({ class: "cm-quoteline cm-quote-single" });
const quoteLineFirstDeco = Decoration.line({ class: "cm-quoteline cm-quote-first" });
const quoteLineMiddleDeco = Decoration.line({ class: "cm-quoteline cm-quote-middle" });
const quoteLineLastDeco = Decoration.line({ class: "cm-quoteline cm-quote-last" });
// The note's first non-empty line is its title (Obsidian-style) — render it larger + bold,
// whether or not it's a "# heading". Stays styled even while editing (it's a line, not a marker).
const titleLineDeco = Decoration.line({ class: "cm-inline-title" });

// Resilience: a decoration build that throws must not kill the editor. Degrade to
// no decorations (raw markdown stays editable) and recover on the next update.
function safeDecorations(build: () => DecorationSet): DecorationSet {
  try { return build(); } catch (err) { console.error("[editor] decoration build failed", err); return Decoration.none; }
}

function buildLivePreviewDecorations(view: EditorView): DecorationSet {
  const builder: { from: number; to: number; deco: Decoration }[] = [];
  const quoteLineStarts: number[] = [];
  const quoteSeen = new Set<number>();
  const docTotal = view.state.doc.length;
  // Lines the caret(s) sit on — those keep raw markers visible.
  const liveLines = new Set<number>();
  for (const range of view.state.selection.ranges) {
    const lineFrom = view.state.doc.lineAt(range.from).number;
    const lineTo = view.state.doc.lineAt(range.to).number;
    for (let i = lineFrom; i <= lineTo; i += 1) liveLines.add(i);
  }
  // First non-empty line (after any frontmatter) = the title line → cm-inline-title.
  let titleLineFrom: number | null = null;
  {
    const doc = view.state.doc;
    let i = 1;
    if (doc.lines >= 1 && doc.line(1).text.trim() === "---") {
      i = 2;
      while (i <= doc.lines && doc.line(i).text.trim() !== "---") i += 1;
      i += 1; // line after the closing ---
    }
    for (; i <= doc.lines; i += 1) {
      if (doc.line(i).text.trim()) { titleLineFrom = doc.line(i).from; break; }
    }
  }
  // Hide-marker decoration (atomic so caret skips over hidden ranges)
  const hide = Decoration.replace({});
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const startLine = view.state.doc.lineAt(node.from).number;
        const endLine = view.state.doc.lineAt(Math.min(node.to, docTotal)).number;
        let onLiveLine = false;
        for (let i = startLine; i <= endLine; i += 1) if (liveLines.has(i)) { onLiveLine = true; break; }

        // Quote bar is structural — register it for EVERY quote line, caret or not.
        if (node.name === "QuoteMark") {
          const line = view.state.doc.lineAt(node.from);
          if (!quoteSeen.has(line.number)) { quoteSeen.add(line.number); quoteLineStarts.push(line.from); }
        }

        if (onLiveLine) return;

        // `![alt](src)` → inline image/file widget. Return false to skip the
        // node's children (LinkMark/URL) so they don't overlap the replace.
        if (node.name === "Image") {
          const text = view.state.sliceDoc(node.from, node.to);
          const m = /^!\[([^\]]*)\]\(([^)\s]+)/.exec(text);
          if (m) builder.push({ from: node.from, to: node.to, deco: Decoration.replace({ widget: new ImageWidget(m[2], m[1]) }) });
          return false;
        }

        switch (node.name) {
          case "HeaderMark": {
            let stop = node.to;
            if (view.state.sliceDoc(stop, stop + 1) === " ") stop += 1;
            if (stop > node.from) builder.push({ from: node.from, to: stop, deco: hide });
            return;
          }
          case "QuoteMark": {
            let stop = node.to;
            if (view.state.sliceDoc(stop, stop + 1) === " ") stop += 1;
            const lineSlice = view.state.sliceDoc(stop, stop + 40);
            const calloutMatch = /^\[!([a-zA-Z0-9_-]+)\]\s*/.exec(lineSlice);
            if (calloutMatch) {
              builder.push({ from: node.from, to: stop + calloutMatch[0].length, deco: Decoration.replace({ widget: new CalloutHeaderWidget(calloutMatch[1]) }) });
            } else if (stop > node.from) {
              builder.push({ from: node.from, to: stop, deco: hide });
            }
            return;
          }
          case "EmphasisMark":
          case "StrongEmphasisMark":
          case "StrikethroughMark":
          case "CodeMark":
          case "HighlightMark":
          case "LinkMark": {
            if (node.to > node.from) builder.push({ from: node.from, to: node.to, deco: hide });
            return;
          }
          case "Highlight": {
            if (node.to > node.from) {
              builder.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-highlight" }) });
            }
            return;
          }
          case "Task": {
            const lineText = view.state.sliceDoc(node.from, node.to);
            const markerMatch = /^\s*[-*+]\s+\[[xX]\]\s*/.exec(lineText);
            if (markerMatch) {
              const textFrom = node.from + markerMatch[0].length;
              if (node.to > textFrom) {
                builder.push({ from: textFrom, to: node.to, deco: Decoration.mark({ class: "cm-task-text-done" }) });
              }
            }
            return;
          }
          case "HorizontalRule": {
            builder.push({ from: node.from, to: node.to, deco: Decoration.replace({ widget: new HrWidget() }) });
            return;
          }
          case "ListMark": {
            // Unordered "-"/"*"/"+" → a bullet glyph; ordered "1." keeps its number.
            const markText = view.state.sliceDoc(node.from, node.to).trim();
            if (/^[-*+]$/.test(markText)) {
              const isTask = /^\s*[-*+]\s+\[[ xX]\]/.test(view.state.doc.lineAt(node.from).text);
              // Task lines get a checkbox (below) instead of a bullet — hide the list dash.
              builder.push({ from: node.from, to: node.to, deco: isTask ? hide : Decoration.replace({ widget: new BulletWidget() }) });
            }
            return;
          }
          case "TaskMarker": {
            const checked = /[xX]/.test(view.state.sliceDoc(node.from, node.to));
            builder.push({ from: node.from, to: node.to, deco: Decoration.replace({ widget: new TaskWidget(checked) }) });
            return;
          }
          default:
            return;
        }
      },
    });
  }
  const quoteLineNumbers = new Set(quoteLineStarts.map((pos) => view.state.doc.lineAt(pos).number));
  const quoteDecos = quoteLineStarts.map((pos) => {
    const lineNum = view.state.doc.lineAt(pos).number;
    const hasPrev = quoteLineNumbers.has(lineNum - 1);
    const hasNext = quoteLineNumbers.has(lineNum + 1);
    if (!hasPrev && !hasNext) return quoteLineSingleDeco.range(pos);
    if (!hasPrev && hasNext) return quoteLineFirstDeco.range(pos);
    if (hasPrev && hasNext) return quoteLineMiddleDeco.range(pos);
    return quoteLineLastDeco.range(pos);
  });
  // Line decorations (quote bars) + the mark/widget decorations, sorted by CodeMirror.
  const ranges = [
    ...(titleLineFrom !== null ? [titleLineDeco.range(titleLineFrom)] : []),
    ...quoteDecos,
    ...builder.map(({ from, to, deco }) => deco.range(from, to)),
  ];
  return Decoration.set(ranges, true);
}

// ── Wikilink decorations [[Note]] / [[Note|Display]] ────────────────────────
const WIKILINK_RE = /\[\[([^[\]\r\n|]+)(\|[^[\]\r\n]*)?\]\]/g;

function buildWikilinkDecorations(view: EditorView, notesRef: { current: WikiNote[] }, resolvedRef: { current: ((t: string) => boolean) | undefined }): DecorationSet {
  const builder: { from: number; to: number; deco: Decoration }[] = [];
  const sel = view.state.selection.main;
  const liveLines = new Set<number>();
  for (const range of view.state.selection.ranges) {
    const lineFrom = view.state.doc.lineAt(range.from).number;
    const lineTo = view.state.doc.lineAt(range.to).number;
    for (let i = lineFrom; i <= lineTo; i += 1) liveLines.add(i);
  }
  const hide = Decoration.replace({});
  const resolved = resolvedRef.current;
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    WIKILINK_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WIKILINK_RE.exec(text)) !== null) {
      const start = from + match.index;
      const end = start + match[0].length;
      const target = match[1].trim();
      const display = match[2] ? match[2].slice(1).trim() : target;
      const innerStart = start + 2 + match[1].length;
      const innerEnd = end - 2;
      // Style the inner display text
      const isResolved = resolved ? resolved(target) : true;
      const mark = Decoration.mark({
        class: isResolved ? "cm-wikilink" : "cm-wikilink cm-wikilink-broken",
        attributes: { "data-target": target, title: display },
      });
      // Hide the [[ / ]] brackets when caret is off the line
      const startLine = view.state.doc.lineAt(start).number;
      const onLive = liveLines.has(startLine);
      if (!onLive) {
        builder.push({ from: start, to: start + 2, deco: hide });
        if (match[2]) {
          // Hide the "|alias" part too — keep only the display side
          const pipeStart = start + 2 + match[1].length;
          builder.push({ from: pipeStart, to: innerEnd, deco: hide });
          builder.push({ from: innerEnd, to: end, deco: hide });
          // The display part stays — wrap inner text with mark
          builder.push({ from: pipeStart + 1, to: innerEnd, deco: mark });
        } else {
          builder.push({ from: end - 2, to: end, deco: hide });
          builder.push({ from: start + 2, to: end - 2, deco: mark });
        }
      } else {
        // Caret on this line: keep brackets visible, still mark the inner area
        if (match[2]) {
          builder.push({ from: start + 2 + match[1].length + 1, to: end - 2, deco: mark });
        } else {
          builder.push({ from: start + 2, to: end - 2, deco: mark });
        }
      }
    }
  }
  builder.sort((a, b) => a.from - b.from || (a.to - a.from) - (b.to - b.from));
  return Decoration.set(builder.map(({ from, to, deco }) => deco.range(from, to)), true);
}

function makeWikilinkPlugin(notesRef: { current: WikiNote[] }, resolvedRef: { current: ((t: string) => boolean) | undefined }, activateRef: { current: ((target: string) => void) | undefined }) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) { this.decorations = safeDecorations(() => buildWikilinkDecorations(view, notesRef, resolvedRef)); }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet)
          this.decorations = safeDecorations(() => buildWikilinkDecorations(update.view, notesRef, resolvedRef));
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        mousedown(event: MouseEvent) {
          if (!(event.metaKey || event.ctrlKey)) return false;
          const el = event.target as HTMLElement | null;
          const linkEl = el?.closest("[data-target]") as HTMLElement | null;
          const target = linkEl?.getAttribute("data-target");
          if (!target) return false;
          event.preventDefault();
          activateRef.current?.(target);
          return true;
        },
      },
    },
  );
}

function makeWikilinkCompletions(notesRef: { current: WikiNote[] }) {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);
    const open = before.lastIndexOf("[[");
    if (open < 0) return null;
    const after = before.slice(open + 2);
    if (/[[\]\n]/.test(after)) return null;
    const from = line.from + open + 2;
    const notes = notesRef.current;
    const query = after.toLowerCase();
    const options = notes
      .filter((note) => !query || note.title.toLowerCase().includes(query) || note.path.toLowerCase().includes(query))
      .slice(0, 30)
      .map((note) => ({
        label: note.title,
        detail: note.path.split("/").slice(0, -1).join("/") || undefined,
        type: "text",
        apply: `${note.title}]]`,
      }));
    return { from, options, validFor: /^[^[\]\n]*$/ };
  };
}

function makeSlashCompletions() {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);
    const slashIdx = before.lastIndexOf("/");
    if (slashIdx < 0) return null;
    if (slashIdx > 0 && !/\s$/.test(before.slice(0, slashIdx))) return null;
    const after = before.slice(slashIdx + 1);
    if (/\s/.test(after)) return null;
    const from = line.from + slashIdx;

    const options = [
      { label: "/h1", detail: "Heading 1", type: "keyword", apply: "# " },
      { label: "/h2", detail: "Heading 2", type: "keyword", apply: "## " },
      { label: "/h3", detail: "Heading 3", type: "keyword", apply: "### " },
      { label: "/table", detail: "Insert Markdown Table", type: "keyword", apply: "| Column 1 | Column 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n" },
      { label: "/callout", detail: "Note Callout Box", type: "keyword", apply: "> [!NOTE]\n> " },
      { label: "/tip", detail: "Tip Callout Box", type: "keyword", apply: "> [!TIP]\n> " },
      { label: "/warning", detail: "Warning Callout Box", type: "keyword", apply: "> [!WARNING]\n> " },
      { label: "/code", detail: "Fenced Code Block", type: "keyword", apply: "```ts\n// Code here\n```\n" },
      { label: "/mermaid", detail: "Mermaid Diagram Block", type: "keyword", apply: "```mermaid\ngraph TD\n  A[Start] --> B[Done]\n```\n" },
      { label: "/math", detail: "LaTeX Math Block", type: "keyword", apply: "$$\nE = mc^2\n$$\n" },
      { label: "/task", detail: "Task Checkbox Item", type: "keyword", apply: "- [ ] " },
      { label: "/bullet", detail: "Bullet List Item", type: "keyword", apply: "- " },
      { label: "/quote", detail: "Blockquote", type: "keyword", apply: "> " },
      { label: "/hr", detail: "Horizontal Rule", type: "keyword", apply: "---\n" },
    ].filter((o) => !after || o.label.slice(1).toLowerCase().startsWith(after.toLowerCase()));

    return { from, options, validFor: /^\/[a-zA-Z0-9]*$/ };
  };
}

const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = safeDecorations(() => buildLivePreviewDecorations(view)); }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet)
        this.decorations = safeDecorations(() => buildLivePreviewDecorations(update.view));
    }
  },
  { decorations: (v) => v.decorations },
);

// ── Highlight style (heading sizes, code style, link color etc.) ────────────
const beebotMarkdownHighlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: "33px", fontWeight: "720", color: "#f4f4f4", lineHeight: "1.12", letterSpacing: "-0.028em" },
  { tag: t.heading2, fontSize: "1.4em", fontWeight: "680", color: "#f2f2f2", lineHeight: "1.3", letterSpacing: "-0.018em" },
  { tag: t.heading3, fontSize: "1.14em", fontWeight: "680", color: "#f2f2f2", letterSpacing: "-0.012em" },
  { tag: t.heading4, fontSize: "1.05em", fontWeight: "650", color: "#ededed" },
  { tag: t.heading5, fontWeight: "650", color: "#ededed" },
  { tag: t.heading6, fontWeight: "650", color: "#d4d4d4" },
  { tag: t.strong, fontWeight: "650", color: "#f2f2f2" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through", color: "#6a6a6c" },
  { tag: t.monospace, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', background: "#1c1c1e", padding: ".12em .4em", borderRadius: "5px", fontSize: "0.87em", color: "#e6c07b" },
  { tag: t.url, color: "var(--beebot-accent, #f4d35e)" },
  { tag: t.link, color: "var(--beebot-accent, #f4d35e)", textDecoration: "underline" },
  { tag: t.quote, color: "#c4c4c6", fontStyle: "normal" },
  { tag: t.list, color: "#d4d4d4" },
  { tag: t.atom, color: "#d4d4d4" },
]);

// ── Theme (pure-black, mac-clean) ──────────────────────────────────────────
const beebotTheme = EditorView.theme({
  "&": { color: "#ededed", backgroundColor: "transparent", height: "100%", fontSize: "16px" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.68", letterSpacing: "-0.003em" },
  ".cm-content": { caretColor: "var(--beebot-accent, #f4d35e)", padding: "8px 0" },
  ".cm-line": { padding: "0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--beebot-accent, #f4d35e)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "var(--bb-accent-soft, rgba(244,211,94,0.18))" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-panels": { background: "var(--bb-bg-1)", color: "#ededed", borderColor: "var(--bb-bg-4)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--bb-bg-4)" },
  ".cm-textfield": { background: "var(--bb-bg-2)", color: "#ededed", border: "1px solid var(--bb-border)", borderRadius: "6px", padding: "4px 8px" },
  ".cm-button": { background: "var(--bb-bg-3)", color: "#ededed", border: "1px solid var(--bb-border)", borderRadius: "6px" },
  ".cm-button:hover": { background: "var(--bb-border)" },
  ".cm-foldPlaceholder": { background: "var(--bb-bg-4)", color: "#9b9b9d", border: "1px solid var(--bb-border-strong)", padding: "0 4px" },
  ".cm-wikilink": { color: "var(--beebot-accent, #f4d35e)", background: "color-mix(in oklab, var(--beebot-accent, #f4d35e) 11%, transparent)", borderRadius: "5px", padding: "1px 6px", cursor: "pointer", textDecoration: "none" },
  ".cm-wikilink-broken": { color: "var(--bb-text-4)", background: "rgba(255,255,255,0.05)", textDecoration: "none" },
  ".cm-bullet": { color: "var(--beebot-accent, #f4d35e)" },
  ".cm-task": { color: "#9b9b9d" },
  ".cm-task-done": { color: "#6a6a6c" },
  ".cm-task-text-done": { textDecoration: "line-through", color: "#6a6a6c" },
  ".cm-quoteline": { border: "1px solid #242426", borderLeft: "3px solid var(--beebot-accent, #f4d35e)", background: "color-mix(in oklab, var(--beebot-accent, #f4d35e) 5%, transparent)", padding: "0.5em 1.1em", color: "#c4c4c6", fontSize: "14px" },
  ".cm-quote-single": { borderRadius: "14px", margin: "4px 0" },
  ".cm-quote-first": { borderTopLeftRadius: "14px", borderTopRightRadius: "14px", borderBottomLeftRadius: "0", borderBottomRightRadius: "0", borderBottom: "none", marginTop: "4px", marginBottom: "0", paddingBottom: "0.25em" },
  ".cm-quote-middle": { borderRadius: "0", borderTop: "none", borderBottom: "none", margin: "0", paddingTop: "0.25em", paddingBottom: "0.25em" },
  ".cm-quote-last": { borderBottomLeftRadius: "14px", borderBottomRightRadius: "14px", borderTopLeftRadius: "0", borderTopRightRadius: "0", borderTop: "none", marginTop: "0", marginBottom: "4px", paddingTop: "0.25em" },
  ".cm-callout-header": { fontWeight: "600", color: "var(--beebot-accent, #f4d35e)", fontSize: "13px", marginBottom: "4px", display: "flex", alignItems: "center" },
  ".cm-inline-title": { fontSize: "33px", fontWeight: "720", letterSpacing: "-0.028em", color: "#f4f4f4", lineHeight: "1.12", marginBottom: "14px" },
  ".cm-hr": { display: "inline-block", width: "100%", borderTop: "1px solid #262628", verticalAlign: "middle", opacity: "1", margin: "14px 0" },
  ".cm-inline-image": { display: "block", maxWidth: "100%", maxHeight: "360px", height: "auto", borderRadius: "8px", margin: "4px 0", border: "1px solid var(--bb-border)" },
  ".cm-file-chip": { display: "inline-flex", alignItems: "center", gap: "0.4em", padding: "2px 10px", borderRadius: "6px", background: "var(--bb-bg-3)", color: "#9b9b9d", fontSize: "0.9em" },
  ".cm-tooltip-autocomplete": { background: "#161618", border: "1px solid #262628", borderRadius: "10px", padding: "4px", color: "#ededed", boxShadow: "0 14px 40px rgba(0,0,0,0.55)" },
  ".cm-tooltip-autocomplete ul li": { padding: "6px 10px", borderRadius: "6px", color: "#9b9b9d" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { background: "rgba(255,255,255,0.09)", color: "#f2f2f2" },
  ".cm-tooltip-autocomplete .cm-completionDetail": { color: "var(--bb-text-4)", marginLeft: "8px", fontStyle: "normal" },
});

// ── Command implementations ────────────────────────────────────────────────
function wrapInline(view: EditorView, prefix: string, suffix = prefix, placeholder = "text") {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const inner = selected || placeholder;
  // Smart toggle: if selection already wrapped, unwrap.
  if (selected.startsWith(prefix) && selected.endsWith(suffix) && selected.length >= prefix.length + suffix.length) {
    const inside = selected.slice(prefix.length, selected.length - suffix.length);
    view.dispatch({ changes: { from, to, insert: inside }, selection: { anchor: from, head: from + inside.length } });
    return;
  }
  const insert = `${prefix}${inner}${suffix}`;
  const anchor = selected ? from : from + prefix.length;
  const head = selected ? from + insert.length : from + prefix.length + inner.length;
  view.dispatch({ changes: { from, to, insert }, selection: { anchor, head } });
}

function prefixLines(view: EditorView, transform: (line: string, index: number) => string) {
  const { from, to } = view.state.selection.main;
  const startLine = view.state.doc.lineAt(from);
  const endLine = view.state.doc.lineAt(to);
  const lines: string[] = [];
  for (let i = startLine.number; i <= endLine.number; i += 1) {
    const line = view.state.doc.line(i);
    lines.push(transform(line.text, i - startLine.number));
  }
  const replacement = lines.join("\n");
  view.dispatch({
    changes: { from: startLine.from, to: endLine.to, insert: replacement },
    selection: { anchor: startLine.from, head: startLine.from + replacement.length },
  });
}

function insertAtCursor(view: EditorView, text: string, selectFrom?: number, selectTo?: number) {
  const { from, to } = view.state.selection.main;
  const before = from > 0 && view.state.sliceDoc(from - 1, from) !== "\n" ? "\n" : "";
  const after = to < view.state.doc.length && view.state.sliceDoc(to, to + 1) !== "\n" ? "\n" : "";
  const insert = `${before}${text}${after}`;
  const baseAnchor = from + before.length + (selectFrom ?? 0);
  const baseHead = from + before.length + (selectTo ?? selectFrom ?? text.length);
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: baseAnchor, head: baseHead } });
}

function stripListPrefix(line: string): string {
  return line.replace(/^(\s*)([-*+]\s+\[[ x]\]\s+|[-*+]\s+|\d+\.\s+)/, "$1");
}

function runCommandOn(view: EditorView, command: MarkdownCommand, options?: RunCommandOptions) {
  switch (command) {
    case "bold": wrapInline(view, "**"); return;
    case "italic": wrapInline(view, "*"); return;
    case "strikethrough": wrapInline(view, "~~"); return;
    case "highlight": wrapInline(view, "=="); return;
    case "inline-code": wrapInline(view, "`", "`", "code"); return;
    case "math": wrapInline(view, "$", "$", "x^2"); return;
    case "comment": wrapInline(view, "%%", "%%", "comment"); return;
    case "footnote": wrapInline(view, "[^", "]", "1"); return;
    case "link": {
      const { from, to } = view.state.selection.main;
      const selected = view.state.sliceDoc(from, to) || "link";
      const url = options?.url?.trim();
      if (!url) return;
      const insert = `[${selected}](${url})`;
      view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + 1, head: from + 1 + selected.length } });
      return;
    }
    case "clear": {
      const { from, to } = view.state.selection.main;
      const cleaned = view.state.sliceDoc(from, to)
        .replace(/[*_~`=$%]/g, "")
        .replace(/^>+\s*/gm, "")
        .replace(/^[-*+]\s+|^[0-9]+\.\s+|^-\s\[[ x]\]\s+/gm, "");
      view.dispatch({ changes: { from, to, insert: cleaned }, selection: { anchor: from, head: from + cleaned.length } });
      return;
    }
    case "code-block": {
      const { from, to } = view.state.selection.main;
      const selected = view.state.sliceDoc(from, to) || "code";
      const insert = `\n\`\`\`\n${selected}\n\`\`\`\n`;
      const codeStart = from + 5; // \n```\n
      view.dispatch({ changes: { from, to, insert }, selection: { anchor: codeStart, head: codeStart + selected.length } });
      return;
    }
    case "math-block": {
      const { from, to } = view.state.selection.main;
      const selected = view.state.sliceDoc(from, to) || "x = a";
      const insert = `\n$$\n${selected}\n$$\n`;
      const mathStart = from + 4;
      view.dispatch({ changes: { from, to, insert }, selection: { anchor: mathStart, head: mathStart + selected.length } });
      return;
    }
    case "table": {
      const table = `\n| Column 1 | Column 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n`;
      insertAtCursor(view, table.trim(), 0, table.trim().length);
      return;
    }
    case "horizontal-rule":
      insertAtCursor(view, "---", 3, 3);
      return;
    case "bullet-list":
      prefixLines(view, (line) => `- ${stripListPrefix(line)}`);
      return;
    case "numbered-list":
      prefixLines(view, (line, index) => `${index + 1}. ${stripListPrefix(line)}`);
      return;
    case "task-list":
      prefixLines(view, (line) => `- [ ] ${stripListPrefix(line)}`);
      return;
    case "quote":
      prefixLines(view, (line) => `> ${line.replace(/^>\s*/, "")}`);
      return;
    case "callout": {
      const { from, to } = view.state.selection.main;
      const startLine = view.state.doc.lineAt(from);
      const endLine = view.state.doc.lineAt(to);
      const inner = view.state.sliceDoc(startLine.from, endLine.to).split("\n").map((line) => `> ${line.replace(/^>\s*/, "")}`).join("\n");
      const insert = `> [!note]\n${inner}`;
      view.dispatch({ changes: { from: startLine.from, to: endLine.to, insert }, selection: { anchor: startLine.from, head: startLine.from + insert.length } });
      return;
    }
    case "body":
      prefixLines(view, (line) => line.replace(/^#{1,6}\s+/, ""));
      return;
    default:
      if (command.startsWith("heading-")) {
        const level = Number(command.replace("heading-", ""));
        const prefix = `${"#".repeat(level)} `;
        prefixLines(view, (line) => `${prefix}${line.replace(/^#{1,6}\s+/, "")}`);
      }
  }
}

function getTableBoundsAtPos(state: EditorState, pos: number): { from: number; to: number; markdown: string } | null {
  const line = state.doc.lineAt(pos);
  if (!line.text.trim().startsWith("|")) return null;

  let startNumber = line.number;
  while (startNumber > 1) {
    const prev = state.doc.line(startNumber - 1);
    if (!prev.text.trim().startsWith("|")) break;
    startNumber--;
  }

  let endNumber = line.number;
  while (endNumber < state.doc.lines) {
    const next = state.doc.line(endNumber + 1);
    if (!next.text.trim().startsWith("|")) break;
    endNumber++;
  }

  const startLine = state.doc.line(startNumber);
  const endLine = state.doc.line(endNumber);
  return {
    from: startLine.from,
    to: endLine.to,
    markdown: state.doc.sliceString(startLine.from, endLine.to),
  };
}

// ── React component ────────────────────────────────────────────────────────
export function LiveMarkdownEditor({
  value,
  onChange,
  editable = true,
  spellCheck = false,
  placeholder = "Start writing…",
  fontFamily,
  className,
  editorRef,
  onLinkShortcut,
  notes,
  onWikilinkActivate,
  isResolvedTarget,
  onBlur,
}: LiveMarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [bubbleMenu, setBubbleMenu] = useState<{ top: number; left: number } | null>(null);
  const [activeTable, setActiveTable] = useState<{ top: number; left: number; from: number; to: number; markdown: string } | null>(null);
  const [tableEditorOpen, setTableEditorOpen] = useState(false);
  const [editingTableMarkdown, setEditingTableMarkdown] = useState("");
  const tableReplaceRangeRef = useRef<{ from: number; to: number } | null>(null);
  const editableCompartment = useRef(new Compartment());
  const spellCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onLinkShortcutRef = useRef(onLinkShortcut);
  const notesRef = useRef<WikiNote[]>(notes || []);
  const onWikilinkActivateRef = useRef(onWikilinkActivate);
  const isResolvedTargetRef = useRef(isResolvedTarget);
  const onBlurRef = useRef(onBlur);

  onChangeRef.current = onChange;
  onLinkShortcutRef.current = onLinkShortcut;
  notesRef.current = notes || [];
  onWikilinkActivateRef.current = onWikilinkActivate;
  isResolvedTargetRef.current = isResolvedTarget;
  onBlurRef.current = onBlur;

  // Mount EditorView once.
  useLayoutEffect(() => {
    if (!hostRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        drawSelection(),
        dropCursor(),
        // Paste a file (image, PDF, …) from the clipboard → store it + insert an
        // `![name](attachment:id)` ref at the cursor. Falls through to normal
        // text paste when the clipboard has no files.
        EditorView.domEventHandlers({
          paste(event, view) {
            const files = Array.from(event.clipboardData?.files ?? []);
            if (!files.length) return false;
            event.preventDefault();
            void (async () => {
              const refs: string[] = [];
              for (const file of files) {
                const id = await saveAttachment(file, file.name);
                refs.push(`![${file.name || "file"}](attachment:${id})`);
              }
              const insert = refs.join("\n") + "\n";
              const { from, to } = view.state.selection.main;
              view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length } });
            })();
            return true;
          },
        }),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        foldGutter({ markerDOM: () => document.createElement("span") }),
        highlightSelectionMatches(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        markdown({ base: markdownLanguage, addKeymap: true }),
        syntaxHighlighting(beebotMarkdownHighlight),
        livePreview,
        makeWikilinkPlugin(notesRef, isResolvedTargetRef, onWikilinkActivateRef),
        autocompletion({
          override: [makeWikilinkCompletions(notesRef), makeSlashCompletions()],
          activateOnTyping: true,
          closeOnBlur: true,
          maxRenderedOptions: 12,
        }),
        beebotTheme,
        editableCompartment.current.of(EditorView.editable.of(editable)),
        spellCompartment.current.of(EditorView.contentAttributes.of({ spellcheck: String(spellCheck), "data-placeholder": placeholder, "aria-label": "Note editor", "aria-multiline": "true" })),
        Prec.high(keymap.of([
          { key: "Mod-b", run: (view) => { runCommandOn(view, "bold"); return true; } },
          { key: "Mod-i", run: (view) => { runCommandOn(view, "italic"); return true; } },
          { key: "Mod-k", run: () => { onLinkShortcutRef.current?.(); return true; } },
        ])),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap, indentWithTab]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          if (update.selectionSet || update.docChanged || update.focusChanged) {
            const sel = update.state.selection.main;
            if (!sel.empty && update.view.hasFocus && (sel.to - sel.from) > 1) {
              const coords = update.view.coordsAtPos(sel.from);
              const hostRect = hostRef.current?.getBoundingClientRect();
              if (coords && hostRect) {
                setBubbleMenu({
                  top: Math.max(8, coords.top - hostRect.top - 44),
                  left: Math.max(16, coords.left - hostRect.left - 20),
                });
                setActiveTable(null);
                return;
              }
            }
            setBubbleMenu(null);

            if (update.view.hasFocus) {
              const tableInfo = getTableBoundsAtPos(update.state, sel.head);
              if (tableInfo) {
                const coords = update.view.coordsAtPos(tableInfo.from);
                const hostRect = hostRef.current?.getBoundingClientRect();
                if (coords && hostRect) {
                  setActiveTable({
                    top: Math.max(8, coords.top - hostRect.top - 36),
                    left: Math.max(16, coords.left - hostRect.left),
                    ...tableInfo,
                  });
                  return;
                }
              }
            }
            setActiveTable(null);
          }
        }),
        EditorView.domEventHandlers({
          blur: () => { onBlurRef.current?.(); return false; },
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

    // Expose imperative handle.
    if (editorRef) {
      editorRef.current = {
        getMarkdown: () => view.state.doc.toString(),
        setMarkdown: (next: string) => {
          if (next === view.state.doc.toString()) return;
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
        },
        focus: () => view.focus(),
        runCommand: (name, options) => runCommandOn(view, name, options),
        openSearch: () => openSearchPanel(view),
        requestLink: () => ({ selection: view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to) }),
      };
    }

    return () => {
      view.destroy();
      viewRef.current = null;
      if (editorRef) editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value → editor without clobbering the cursor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value === current) return;
    // While the user is actively editing (editor focused), the EDITOR is the source of
    // truth. The `value` prop is a DEBOUNCED echo of the user's own typing, so it lags the
    // live document — re-applying it here did a full-doc replace that remapped the caret to
    // position 0 (the top heading) and dropped the chars typed during the debounce window.
    // External loads (note switch, programmatic) happen while the editor is blurred, so this
    // guard only suppresses the self-echo, never a genuine external change.
    if (view.hasFocus) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: editableCompartment.current.reconfigure(EditorView.editable.of(editable)) });
  }, [editable]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: spellCompartment.current.reconfigure(EditorView.contentAttributes.of({ spellcheck: String(spellCheck), "data-placeholder": placeholder, "aria-label": "Note editor", "aria-multiline": "true" })) });
  }, [spellCheck, placeholder]);

  const style: CSSProperties = { height: "100%" };
  if (fontFamily) style.fontFamily = fontFamily;

  return (
    <div className={cn("beebot-live-editor-wrapper relative h-full w-full", className)}>
      {bubbleMenu && editable && (
        <div
          className="absolute z-50 flex items-center gap-1 rounded-full border border-[var(--bb-border-strong)] bg-[var(--bb-bg-1)]/95 backdrop-blur-md px-2 py-1 shadow-xl transition-all duration-150 animate-in fade-in zoom-in-95"
          style={{ top: `${bubbleMenu.top}px`, left: `${bubbleMenu.left}px` }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            type="button"
            onClick={() => { const v = viewRef.current; if (v) runCommandOn(v, "bold"); }}
            className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-[var(--bb-text-1)] hover:bg-[var(--bb-bg-3)] transition-colors"
            title="Bold (Cmd+B)"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => { const v = viewRef.current; if (v) runCommandOn(v, "italic"); }}
            className="flex h-7 w-7 items-center justify-center rounded-full text-xs italic font-serif text-[var(--bb-text-1)] hover:bg-[var(--bb-bg-3)] transition-colors"
            title="Italic (Cmd+I)"
          >
            I
          </button>
          <button
            type="button"
            onClick={() => { const v = viewRef.current; if (v) runCommandOn(v, "strikethrough"); }}
            className="flex h-7 w-7 items-center justify-center rounded-full text-xs line-through text-[var(--bb-text-2)] hover:bg-[var(--bb-bg-3)] transition-colors"
            title="Strikethrough"
          >
            S
          </button>
          <button
            type="button"
            onClick={() => { const v = viewRef.current; if (v) runCommandOn(v, "highlight"); }}
            className="flex h-7 w-7 items-center justify-center rounded-full text-xs text-[var(--beebot-accent,#f4d35e)] bg-[var(--beebot-accent,#f4d35e)]/15 hover:bg-[var(--beebot-accent,#f4d35e)]/25 transition-colors font-semibold"
            title="Highlight"
          >
            H
          </button>
          <div className="h-4 w-[1px] bg-[var(--bb-border)] mx-0.5" />
          <button
            type="button"
            onClick={() => { const v = viewRef.current; if (v) runCommandOn(v, "inline-code"); }}
            className="flex h-7 px-2 items-center justify-center rounded-full font-mono text-xs text-[var(--bb-text-1)] hover:bg-[var(--bb-bg-3)] transition-colors"
            title="Inline Code"
          >
            `code`
          </button>
          <button
            type="button"
            onClick={() => {
              if (onLinkShortcutRef.current) onLinkShortcutRef.current();
              else { const v = viewRef.current; if (v) runCommandOn(v, "link"); }
            }}
            className="flex h-7 px-2.5 items-center justify-center rounded-full text-xs font-medium text-[var(--bb-text-1)] hover:bg-[var(--bb-bg-3)] transition-colors gap-1"
            title="Add Link (Cmd+K)"
          >
            <span>🔗</span>
            <span>Link</span>
          </button>
        </div>
      )}
      {activeTable && editable && !tableEditorOpen && (
        <button
          type="button"
          onClick={() => {
            tableReplaceRangeRef.current = { from: activeTable.from, to: activeTable.to };
            setEditingTableMarkdown(activeTable.markdown);
            setTableEditorOpen(true);
          }}
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-40 flex items-center gap-1.5 rounded-full border border-[var(--beebot-accent,#f4d35e)] bg-[var(--bb-bg-1)]/95 backdrop-blur-md px-3 py-1 shadow-lg text-xs font-semibold text-[var(--bb-text-1)] hover:bg-[var(--beebot-accent,#f4d35e)] hover:text-black transition-all duration-150 animate-in fade-in zoom-in-95"
          style={{ top: `${activeTable.top}px`, left: `${activeTable.left}px` }}
          title="Edit table in visual spreadsheet grid"
        >
          <span>📊</span>
          <span>Edit Table Grid</span>
        </button>
      )}
      <VisualTableEditor
        open={tableEditorOpen}
        onOpenChange={setTableEditorOpen}
        initialMarkdown={editingTableMarkdown}
        onApply={(formatted) => {
          const v = viewRef.current;
          const r = tableReplaceRangeRef.current;
          if (v && r) {
            v.dispatch({
              changes: { from: r.from, to: r.to, insert: formatted.trim() + "\n" },
              selection: { anchor: r.from + formatted.trim().length + 1 },
            });
          }
        }}
      />
      <div ref={hostRef} className="beebot-live-editor-host h-full w-full" style={style} />
    </div>
  );
}

export default LiveMarkdownEditor;

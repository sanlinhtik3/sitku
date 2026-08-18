import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { type MarkdownCommand, type RunCommandOptions } from "./types";
import { transformMarkdownLines } from "./blockCommands";

// ── Highlight style (heading sizes, code style, link color etc.) ────────────
export const beebotMarkdownHighlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: "33px", fontWeight: "720", color: "var(--bb-text-1)", lineHeight: "1.12", letterSpacing: "-0.028em" },
  { tag: t.heading2, fontSize: "1.4em", fontWeight: "680", color: "var(--bb-text-1)", lineHeight: "1.3", letterSpacing: "-0.018em" },
  { tag: t.heading3, fontSize: "1.14em", fontWeight: "680", color: "var(--bb-text-1)", letterSpacing: "-0.012em" },
  { tag: t.heading4, fontSize: "1.05em", fontWeight: "650", color: "var(--bb-text-1)" },
  { tag: t.heading5, fontWeight: "650", color: "var(--bb-text-1)" },
  { tag: t.heading6, fontWeight: "650", color: "var(--bb-text-2)" },
  { tag: t.strong, fontWeight: "650", color: "var(--bb-text-1)" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through", color: "var(--bb-text-4)" },
  { tag: t.monospace, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', background: "var(--bb-bg-3)", padding: ".12em .4em", borderRadius: "var(--bb-radius-control)", fontSize: "0.87em", color: "var(--bb-warning)" },
  { tag: t.url, color: "var(--beebot-accent, #f4d35e)" },
  { tag: t.link, color: "var(--beebot-accent, #f4d35e)", textDecoration: "underline" },
  { tag: t.quote, color: "var(--bb-text-2)", fontStyle: "normal" },
  { tag: t.list, color: "var(--bb-text-2)" },
  { tag: t.atom, color: "var(--bb-text-2)" },
]);

// ── Theme (pure-black, mac-clean) ──────────────────────────────────────────
export const beebotTheme = EditorView.theme({
  "&": { color: "var(--bb-text-1)", backgroundColor: "transparent", height: "100%", fontSize: "16px" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.68", letterSpacing: "-0.003em", overflow: "auto", minHeight: "0", contain: "layout style", overflowAnchor: "none" },
  ".cm-content": { caretColor: "var(--beebot-accent, #f4d35e)", padding: "8px 0 96px" },
  ".cm-line": { padding: "0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--beebot-accent, #f4d35e)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "var(--bb-accent-soft, rgba(244,211,94,0.18))" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-panels": { background: "var(--bb-bg-1)", color: "var(--bb-text-1)", borderColor: "var(--bb-bg-4)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--bb-bg-4)" },
  ".cm-textfield": { background: "var(--bb-bg-2)", color: "var(--bb-text-1)", border: "1px solid var(--bb-border)", borderRadius: "var(--bb-radius-control)", padding: "4px 8px" },
  ".cm-button": { background: "var(--bb-bg-3)", color: "var(--bb-text-1)", border: "1px solid var(--bb-border)", borderRadius: "var(--bb-radius-control)" },
  ".cm-button:hover": { background: "var(--bb-border)" },
  ".cm-foldPlaceholder": { background: "var(--bb-bg-4)", color: "var(--bb-text-3)", border: "1px solid var(--bb-border-strong)", padding: "0 4px" },
  ".cm-wikilink": { color: "var(--beebot-accent, #f4d35e)", background: "color-mix(in oklab, var(--beebot-accent, #f4d35e) 11%, transparent)", borderRadius: "5px", padding: "1px 6px", cursor: "pointer", textDecoration: "none" },
  ".cm-wikilink-broken": { color: "var(--bb-text-4)", background: "color-mix(in oklab, var(--bb-text-4) 8%, transparent)", textDecoration: "none" },
  ".cm-bullet": { color: "var(--beebot-accent, #f4d35e)" },
  ".cm-task": { color: "var(--bb-text-3)" },
  ".cm-task-done": { color: "var(--bb-text-4)" },
  ".cm-task-text-done": { textDecoration: "line-through", color: "var(--bb-text-4)" },
  ".cm-quoteline": { border: "1px solid var(--bb-border)", borderLeft: "3px solid var(--bb-accent)", background: "color-mix(in oklab, var(--bb-accent) 5%, transparent)", padding: "0.5em 1.1em", color: "var(--bb-text-2)", fontSize: "14px" },
  ".cm-quote-single": { borderRadius: "var(--bb-radius-panel)", margin: "0", paddingTop: "8px", paddingBottom: "8px" },
  ".cm-quote-first": { borderTopLeftRadius: "var(--bb-radius-panel)", borderTopRightRadius: "var(--bb-radius-panel)", borderBottomLeftRadius: "0", borderBottomRightRadius: "0", borderBottom: "none", margin: "0", paddingTop: "8px", paddingBottom: "0.25em" },
  ".cm-quote-middle": { borderRadius: "0", borderTop: "none", borderBottom: "none", margin: "0", paddingTop: "0.25em", paddingBottom: "0.25em" },
  ".cm-quote-last": { borderBottomLeftRadius: "var(--bb-radius-panel)", borderBottomRightRadius: "var(--bb-radius-panel)", borderTopLeftRadius: "0", borderTopRightRadius: "0", borderTop: "none", margin: "0", paddingTop: "0.25em", paddingBottom: "8px" },
  ".cm-codeblock-line": { borderLeft: "1px solid var(--bb-border)", borderRight: "1px solid var(--bb-border)", background: "var(--bb-bg-1)", padding: "0 1.2em", fontFamily: "var(--bb-font-mono, monospace)", fontSize: "0.88em", color: "var(--bb-text-2)" },
  ".cm-codeblock-single": { borderTop: "1px solid var(--bb-border)", borderBottom: "1px solid var(--bb-border)", borderRadius: "var(--bb-radius-panel)", margin: "0.5em 0", paddingTop: "12px", paddingBottom: "12px" },
  ".cm-codeblock-first": { borderTop: "1px solid var(--bb-border)", borderTopLeftRadius: "var(--bb-radius-panel)", borderTopRightRadius: "var(--bb-radius-panel)", borderBottomLeftRadius: "0", borderBottomRightRadius: "0", borderBottom: "none", margin: "0.5em 0 0 0", paddingTop: "8px", paddingBottom: "2px" },
  ".cm-codeblock-middle": { borderRadius: "0", borderTop: "none", borderBottom: "none", margin: "0", paddingTop: "2px", paddingBottom: "2px" },
  ".cm-codeblock-last": { borderBottom: "1px solid var(--bb-border)", borderBottomLeftRadius: "var(--bb-radius-panel)", borderBottomRightRadius: "var(--bb-radius-panel)", borderTopLeftRadius: "0", borderTopRightRadius: "0", borderTop: "none", margin: "0 0 0.5em 0", paddingTop: "2px", paddingBottom: "8px" },
  ".cm-callout-header": { fontWeight: "600", fontSize: "13px", paddingBottom: "4px", display: "inline-flex", alignItems: "center" },
  ".cm-callout-red": { borderLeft: "3px solid var(--bb-negative) !important", background: "color-mix(in oklab, var(--bb-negative) 8%, transparent) !important" },
  ".cm-callout-green, .cm-callout-emerald": { borderLeft: "3px solid var(--bb-positive) !important", background: "color-mix(in oklab, var(--bb-positive) 8%, transparent) !important" },
  ".cm-callout-yellow": { borderLeft: "3px solid var(--bb-warning) !important", background: "color-mix(in oklab, var(--bb-warning) 8%, transparent) !important" },
  ".cm-callout-blue": { borderLeft: "3px solid var(--bb-info) !important", background: "color-mix(in oklab, var(--bb-info) 8%, transparent) !important" },
  ".cm-callout-purple, .cm-callout-default": { borderLeft: "3px solid var(--bb-accent) !important", background: "color-mix(in oklab, var(--bb-accent) 8%, transparent) !important" },
  ".cm-inline-title": { fontSize: "33px", fontWeight: "720", letterSpacing: "-0.028em", color: "var(--bb-text-1)", lineHeight: "1.12", margin: "0", paddingBottom: "14px" },
  ".cm-hr": { display: "inline-flex", alignItems: "center", width: "100%", height: "29px", margin: "0", padding: "0" },
  ".cm-inline-image": { display: "block", maxWidth: "100%", maxHeight: "360px", height: "auto", borderRadius: "8px", margin: "0", padding: "4px 0", border: "1px solid var(--bb-border)" },
  ".cm-file-chip": { display: "inline-flex", alignItems: "center", gap: "0.4em", padding: "2px 10px", borderRadius: "var(--bb-radius-control)", background: "var(--bb-bg-3)", color: "var(--bb-text-3)", fontSize: "0.9em" },
  ".cm-tooltip-autocomplete": { background: "var(--bb-bg-2)", border: "1px solid var(--bb-border)", borderRadius: "var(--bb-radius-panel)", padding: "4px", color: "var(--bb-text-1)", boxShadow: "var(--bb-shadow-panel)" },
  ".cm-tooltip-autocomplete ul li": { padding: "6px 10px", borderRadius: "var(--bb-radius-control)", color: "var(--bb-text-3)" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { background: "var(--bb-sidebar-hover)", color: "var(--bb-text-1)" },
  ".cm-tooltip-autocomplete .cm-completionDetail": { color: "var(--bb-text-4)", marginLeft: "8px", fontStyle: "normal" },
});

// ── Command implementations ────────────────────────────────────────────────
function wrapInline(view: EditorView, prefix: string, suffix = prefix, placeholder = "text") {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const inner = selected || placeholder;
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

function replaceSelectedLines(view: EditorView, command: MarkdownCommand) {
  const { from, to } = view.state.selection.main;
  const startLine = view.state.doc.lineAt(from);
  const endLine = view.state.doc.lineAt(to);
  const lines: string[] = [];
  for (let i = startLine.number; i <= endLine.number; i += 1) {
    lines.push(view.state.doc.line(i).text);
  }
  const replacement = transformMarkdownLines(lines, command).join("\n");
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

export function runCommandOn(view: EditorView, command: MarkdownCommand, options?: RunCommandOptions) {
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
      const codeStart = from + 5;
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
      replaceSelectedLines(view, "bullet-list");
      return;
    case "numbered-list":
      replaceSelectedLines(view, "numbered-list");
      return;
    case "task-list":
      replaceSelectedLines(view, "task-list");
      return;
    case "quote":
      replaceSelectedLines(view, "quote");
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
      replaceSelectedLines(view, "body");
      return;
    default:
      if (command.startsWith("heading-")) {
        replaceSelectedLines(view, command);
      }
  }
}

export function getTableBoundsAtPos(state: EditorState, pos: number): { from: number; to: number; markdown: string } | null {
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

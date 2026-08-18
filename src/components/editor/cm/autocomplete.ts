import { ViewPlugin, Decoration, type DecorationSet, type ViewUpdate, type EditorView } from "@codemirror/view";
import { type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { type WikiNote } from "./types";
import { changedLinesMatch, safeDecorations, getLiveLines, getReplacedBlockLines, previewLineNumbers, previewRangesForViewport, sameLiveLines } from "./livePreview";
import { querySlashCommandItems } from "./blockCommands";

// ── Wikilink decorations [[Note]] / [[Note|Display]] ────────────────────────
const WIKILINK_RE = /\[\[([^[\]\r\n|]+)(\|[^[\]\r\n]*)?\]\]/g;

function buildWikilinkDecorations(view: EditorView, notesRef: { current: WikiNote[] }, resolvedRef: { current: ((t: string) => boolean) | undefined }): DecorationSet {
  const builder: { from: number; to: number; deco: Decoration }[] = [];
  const liveLines = getLiveLines(view.state);
  const hide = Decoration.replace({});
  const resolved = resolvedRef.current;
  const previewRanges = previewRangesForViewport(view.state, view.visibleRanges);
  const replacedLines = getReplacedBlockLines(view.state, liveLines, previewLineNumbers(view.state, previewRanges));
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    WIKILINK_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WIKILINK_RE.exec(text)) !== null) {
      const start = from + match.index;
      const end = start + match[0].length;
      const startLine = view.state.doc.lineAt(start).number;
      if (replacedLines.has(startLine)) continue;
      const target = match[1].trim();
      const display = match[2] ? match[2].slice(1).trim() : target;
      const innerEnd = end - 2;
      const isResolved = resolved ? resolved(target) : true;
      const mark = Decoration.mark({
        class: isResolved ? "cm-wikilink" : "cm-wikilink cm-wikilink-broken",
        attributes: { "data-target": target, title: display },
      });
      const onLive = liveLines.has(startLine);
      if (!onLive) {
        if (match[2]) {
          const pipeStart = start + 2 + match[1].length;
          builder.push({ from: start, to: pipeStart + 1, deco: hide });
          builder.push({ from: innerEnd, to: end, deco: hide });
          builder.push({ from: pipeStart + 1, to: innerEnd, deco: mark });
        } else {
          builder.push({ from: start, to: start + 2, deco: hide });
          builder.push({ from: end - 2, to: end, deco: hide });
          builder.push({ from: start + 2, to: end - 2, deco: mark });
        }
      } else {
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

export function makeWikilinkPlugin(notesRef: { current: WikiNote[] }, resolvedRef: { current: ((t: string) => boolean) | undefined }, activateRef: { current: ((target: string) => void) | undefined }) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) { this.decorations = safeDecorations(() => buildWikilinkDecorations(view, notesRef, resolvedRef)); }
      update(update: ViewUpdate) {
        if (!update.docChanged && !update.viewportChanged && !update.selectionSet) return;
        if (
          !update.viewportChanged
          && sameLiveLines(update.startState, update.state)
          && (!update.docChanged || !changedLinesMatch(update, /[[\]]/))
        ) {
          if (update.docChanged) this.decorations = this.decorations.map(update.changes);
          return;
        }
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

export function makeWikilinkCompletions(notesRef: { current: WikiNote[] }) {
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

export function makeSlashCompletions() {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);
    const slashIdx = before.lastIndexOf("/");
    if (slashIdx < 0) return null;
    if (slashIdx > 0 && !/\s$/.test(before.slice(0, slashIdx))) return null;
    const after = before.slice(slashIdx + 1);
    if (/\s/.test(after)) return null;
    const from = line.from + slashIdx;

    const options = querySlashCommandItems(after);

    return { from, options, validFor: /^\/[a-zA-Z0-9]*$/ };
  };
}

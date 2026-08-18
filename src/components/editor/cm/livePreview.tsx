import { useState, useEffect } from "react";
import { EditorState, EditorSelection, StateEffect, StateField, type Extension, type Transaction } from "@codemirror/state";
import { EditorView, Decoration, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { NoteReader, ObsidianPropertiesCard, parseFrontmatter, splitFrontmatter, serializeFrontmatter, type FrontmatterEntry } from "@/components/editor/NoteReader";
import { NotionTableCard } from "@/components/editor/VisualTableEditor";
import { isMarkdownBlockLine } from "@/components/editor/markdownReading";
import { type RichRefs } from "./types";
import { BulletWidget, TaskWidget, HrWidget, ImageWidget, CalloutHeaderWidget, ReactBlockWidget } from "./widgets";

// A quote line gets a left bar. It's structural STYLE, not a marker — so it stays even on
// the caret line (only the raw ">" reveals when you edit).
const quoteLineDeco = Decoration.line({ class: "cm-quoteline" });
const codeblockSingleDeco = Decoration.line({ class: "cm-codeblock-line cm-codeblock-single" });
const codeblockFirstDeco = Decoration.line({ class: "cm-codeblock-line cm-codeblock-first" });
const codeblockMiddleDeco = Decoration.line({ class: "cm-codeblock-line cm-codeblock-middle" });
const codeblockLastDeco = Decoration.line({ class: "cm-codeblock-line cm-codeblock-last" });
const titleLineDeco = Decoration.line({ class: "cm-inline-title" });
const DECORATED_NODE_NAMES = new Set([
  "Image", "HeaderMark", "QuoteMark", "EmphasisMark", "StrongEmphasisMark",
  "StrikethroughMark", "CodeMark", "HighlightMark", "LinkMark", "Highlight",
  "Task", "HorizontalRule", "ListMark", "TaskMarker",
]);

// Resilience: a decoration build that throws must not kill the editor. Degrade to
// no decorations (raw markdown stays editable) and recover on the next update.
export function safeDecorations(build: () => DecorationSet): DecorationSet {
  try { return build(); } catch (err) { console.error("[editor] decoration build failed", err); return Decoration.none; }
}

// Ponytail senior dev fix: Get all lines currently touched by selections or carets.
export function getLiveLines(state: EditorState): Set<number> {
  const liveLines = new Set<number>();
  const doc = state.doc;
  for (const range of state.selection.ranges) {
    const a = doc.lineAt(range.from).number;
    let b = doc.lineAt(range.to).number;
    if (b > a && range.to === doc.line(b).from) {
      b -= 1;
    }
    for (let i = a; i <= b; i += 1) liveLines.add(i);
  }
  return liveLines;
}

export function sameLiveLines(left: EditorState, right: EditorState): boolean {
  const leftLines = getLiveLines(left);
  const rightLines = getLiveLines(right);
  if (leftLines.size !== rightLines.size) return false;
  for (const line of leftLines) if (!rightLines.has(line)) return false;
  return true;
}

export function changedLinesMatch(update: ViewUpdate, pattern: RegExp): boolean {
  let matches = false;
  update.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    if (matches) return;
    const oldDoc = update.startState.doc;
    const newDoc = update.state.doc;
    const oldStart = oldDoc.lineAt(Math.min(fromA, oldDoc.length));
    const oldEnd = oldDoc.lineAt(Math.min(toA, oldDoc.length));
    const newStart = newDoc.lineAt(Math.min(fromB, newDoc.length));
    const newEnd = newDoc.lineAt(Math.min(toB, newDoc.length));
    matches = pattern.test(oldDoc.sliceString(oldStart.from, oldEnd.to))
      || pattern.test(newDoc.sliceString(newStart.from, newEnd.to));
  });
  return matches;
}

// Ponytail senior dev fix: In Markdown / Note-taking apps, selecting a line or double-clicking a heading
// should NEVER bleed into or highlight the start of the next line!
export const targetSelectionFilter = EditorState.transactionFilter.of((tr) => {
  if (!tr.selection || tr.docChanged) return tr;
  const doc = tr.newDoc;
  let modified = false;
  const newRanges = tr.selection.ranges.map((r) => {
    if (r.from < r.to) {
      const lineTo = doc.lineAt(r.to);
      if (r.to === lineTo.from && lineTo.number > 1) {
        modified = true;
        const newTo = r.to - 1;
        return r.anchor <= r.head
          ? EditorSelection.range(r.anchor, newTo)
          : EditorSelection.range(newTo, r.head);
      }
    }
    return r;
  });
  if (!modified) return tr;
  return [tr, { selection: EditorSelection.create(newRanges, tr.selection.mainIndex) }];
});

export interface DocStructure {
  fmRanges: Array<[number, number]>;
  fencedRanges: Array<[number, number]>;
  mathRanges: Array<[number, number]>;
  tableRanges: Array<[number, number]>;
  quoteLineNumbers: Set<number>;
  quoteLineStarts: number[];
  lineCalloutType: Map<number, string>;
  embedLineNumbers: Set<number>;
  inFm: (ln: number) => boolean;
  inFenced: (ln: number) => boolean;
}

const EMBED_LINE_RE = /^!\[\[[^[\]\r\n]+\]\]$/;

function computeDocStructure(state: EditorState): DocStructure {
  const doc = state.doc;
  const fmRanges: Array<[number, number]> = [];
  if (doc.lines >= 2 && doc.line(1).text.trim() === "---") {
    let endLn = 2;
    while (endLn <= doc.lines && doc.line(endLn).text.trim() !== "---") endLn += 1;
    if (endLn <= doc.lines) {
      fmRanges.push([1, endLn]);
    }
  }
  const inFm = (ln: number) => fmRanges.some(([a, b]) => ln >= a && ln <= b);

  const fencedRanges: Array<[number, number]> = [];
  for (let ln = 1; ln <= doc.lines; ) {
    if (inFm(ln)) { ln += 1; continue; }
    const text = doc.line(ln).text.trim();
    if (text.startsWith("```") || text.startsWith("~~~")) {
      const fence = text.slice(0, 3);
      let endLn = ln + 1;
      while (endLn <= doc.lines && !doc.line(endLn).text.trim().startsWith(fence)) endLn += 1;
      if (endLn <= doc.lines) {
        fencedRanges.push([ln, endLn]);
        ln = endLn + 1; continue;
      }
    }
    ln += 1;
  }
  const inFenced = (ln: number) => fencedRanges.some(([a, b]) => ln >= a && ln <= b);

  const mathRanges: Array<[number, number]> = [];
  const tableRanges: Array<[number, number]> = [];
  const quoteLineNumbers = new Set<number>();
  const quoteLineStarts: number[] = [];
  const lineCalloutType = new Map<number, string>();
  const embedLineNumbers = new Set<number>();

  let currentCalloutType: string | null = null;

  for (let ln = 1; ln <= doc.lines; ) {
    if (inFenced(ln) || inFm(ln)) { ln += 1; continue; }
    const line = doc.line(ln);
    const text = line.text.trim();

    if (text.startsWith(">")) {
      quoteLineNumbers.add(ln);
      quoteLineStarts.push(line.from);
      const m = /^>\s*\[!([a-zA-Z0-9_-]+)\]/.exec(text);
      if (m) currentCalloutType = m[1].toLowerCase();
      if (currentCalloutType) lineCalloutType.set(ln, currentCalloutType);
    } else {
      currentCalloutType = null;
    }

    if (EMBED_LINE_RE.test(text)) {
      embedLineNumbers.add(ln);
      ln += 1; continue;
    }
    if (text.includes("|") && ln + 1 <= doc.lines) {
      const nextText = doc.line(ln + 1).text.trim();
      if (nextText.includes("|") && nextText.includes("-") && !/[a-zA-Z0-9]/.test(nextText)) {
        let endLn = ln + 1;
        while (endLn + 1 <= doc.lines && doc.line(endLn + 1).text.trim().includes("|")) {
          endLn += 1;
        }
        tableRanges.push([ln, endLn]);
        ln = endLn + 1; continue;
      }
    }
    if (text.startsWith("$$")) {
      let endLn = ln;
      if (!(text.length >= 4 && text.endsWith("$$"))) {
        endLn = ln + 1;
        while (endLn <= doc.lines && !doc.line(endLn).text.trim().endsWith("$$")) endLn += 1;
      }
      if (endLn <= doc.lines) {
        mathRanges.push([ln, endLn]);
        ln = endLn + 1; continue;
      }
    }
    ln += 1;
  }
  return { fmRanges, fencedRanges, mathRanges, tableRanges, quoteLineNumbers, quoteLineStarts, lineCalloutType, embedLineNumbers, inFm, inFenced };
}

function lineCanAffectStructure(text: string) {
  const trimmed = text.trim();
  return (
    trimmed === "---"
    || trimmed.startsWith("```")
    || trimmed.startsWith("~~~")
    || trimmed.startsWith("$$")
    || trimmed.startsWith(">")
    || trimmed.startsWith("![[")
    || trimmed.includes("|")
  );
}

export function docStructureNeedsRefresh(transaction: Transaction) {
  if (!transaction.docChanged) return false;
  let refresh = false;
  transaction.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    if (refresh) return;
    const oldDoc = transaction.startState.doc;
    const newDoc = transaction.newDoc;
    const oldStart = oldDoc.lineAt(Math.min(fromA, oldDoc.length));
    const oldEnd = oldDoc.lineAt(Math.min(toA, oldDoc.length));
    const newStart = newDoc.lineAt(Math.min(fromB, newDoc.length));
    const newEnd = newDoc.lineAt(Math.min(toB, newDoc.length));
    if (oldStart.number !== oldEnd.number || newStart.number !== newEnd.number) {
      refresh = true;
      return;
    }
    refresh = lineCanAffectStructure(oldStart.text) || lineCanAffectStructure(newStart.text);
  });
  return refresh;
}

function docChangeTouchesRichBlock(transaction: Transaction) {
  if (!transaction.docChanged) return false;
  const structure = transaction.startState.field(docStructureField);
  const isInsideRange = (line: number, ranges: Array<[number, number]>) =>
    ranges.some(([from, to]) => line >= from && line <= to);
  let touchesRichBlock = false;
  transaction.changes.iterChangedRanges((fromA, toA) => {
    if (touchesRichBlock) return;
    const oldDoc = transaction.startState.doc;
    const first = oldDoc.lineAt(Math.min(fromA, oldDoc.length)).number;
    const last = oldDoc.lineAt(Math.min(toA, oldDoc.length)).number;
    for (let line = first; line <= last; line += 1) {
      if (
        isInsideRange(line, structure.fmRanges)
        || isInsideRange(line, structure.fencedRanges)
        || isInsideRange(line, structure.mathRanges)
        || isInsideRange(line, structure.tableRanges)
        || structure.embedLineNumbers.has(line)
      ) {
        touchesRichBlock = true;
        break;
      }
    }
  });
  return touchesRichBlock;
}

export const docStructureField = StateField.define<DocStructure>({
  create: (state) => computeDocStructure(state),
  update: (value, tr) => docStructureNeedsRefresh(tr) ? computeDocStructure(tr.state) : value,
});

export interface PreviewRange { from: number; to: number }

export function previewLineNumbers(state: EditorState, ranges: readonly PreviewRange[]): Set<number> {
  const lines = new Set<number>();
  for (const range of ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let line = first; line <= last; line += 1) lines.add(line);
  }
  return lines;
}

export function getReplacedBlockLines(state: EditorState, liveLines: Set<number>, visibleLines?: ReadonlySet<number>): Set<number> {
  const replaced = new Set<number>();
  const struct = state.field(docStructureField);
  const anyLive = (startLine: number, endLine: number) => {
    for (let i = startLine; i <= endLine; i += 1) if (liveLines.has(i)) return true;
    return false;
  };

  if (visibleLines) {
    for (const line of visibleLines) {
      if (struct.fmRanges.some(([a, b]) => line >= a && line <= b)) replaced.add(line);
      if (struct.fencedRanges.some(([a, b]) => line >= a && line <= b && !anyLive(a, b))) replaced.add(line);
      if (struct.embedLineNumbers.has(line) && !liveLines.has(line)) replaced.add(line);
      if (struct.mathRanges.some(([a, b]) => line >= a && line <= b && !anyLive(a, b))) replaced.add(line);
      if (struct.tableRanges.some(([a, b]) => line >= a && line <= b)) replaced.add(line);
    }
    return replaced;
  }

  for (const [a, b] of struct.fmRanges) {
    for (let i = a; i <= b; i += 1) replaced.add(i);
  }
  for (const [a, b] of struct.fencedRanges) {
    if (!anyLive(a, b)) {
      for (let i = a; i <= b; i += 1) replaced.add(i);
    }
  }
  for (const ln of struct.embedLineNumbers) {
    if (!liveLines.has(ln)) replaced.add(ln);
  }
  for (const [a, b] of struct.mathRanges) {
    if (!anyLive(a, b)) {
      for (let i = a; i <= b; i += 1) replaced.add(i);
    }
  }
  for (const [a, b] of struct.tableRanges) {
    for (let i = a; i <= b; i += 1) replaced.add(i);
  }
  return replaced;
}

export function previewRangesForViewport(state: EditorState, ranges: readonly PreviewRange[], overscanLines = 1): PreviewRange[] {
  const expanded = ranges.map(({ from, to }) => {
    const first = Math.max(1, state.doc.lineAt(Math.max(0, from)).number - overscanLines);
    const last = Math.min(state.doc.lines, state.doc.lineAt(Math.min(state.doc.length, to)).number + overscanLines);
    return { from: state.doc.line(first).from, to: state.doc.line(last).to };
  }).sort((a, b) => a.from - b.from);

  const merged: PreviewRange[] = [];
  for (const range of expanded) {
    const previous = merged[merged.length - 1];
    if (previous && range.from <= previous.to + 1) previous.to = Math.max(previous.to, range.to);
    else merged.push({ ...range });
  }
  return merged;
}

function buildLivePreviewDecorations(state: EditorState, richRefs: RichRefs, previewRanges: readonly PreviewRange[]): DecorationSet {
  const builder: { from: number; to: number; deco: Decoration }[] = [];
  const docTotal = state.doc.length;
  const liveLines = getLiveLines(state);
  const visibleLines = previewLineNumbers(state, previewRanges);
  const replacedLines = getReplacedBlockLines(state, liveLines, visibleLines);
  let implicitTitleIndex = -1;
  let titleSearchStart = 1;
  if (state.doc.line(1).text.trim() === "---") {
    for (let line = 2; line <= state.doc.lines; line += 1) {
      if (state.doc.line(line).text.trim() === "---") {
        titleSearchStart = line + 1;
        break;
      }
    }
  }
  for (let line = titleSearchStart; line <= state.doc.lines; line += 1) {
    const text = state.doc.line(line).text;
    if (!text.trim()) continue;
    if (!isMarkdownBlockLine(text)) implicitTitleIndex = line - 1;
    break;
  }
  const titleLineFrom = implicitTitleIndex >= 0 ? state.doc.line(implicitTitleIndex + 1).from : null;

  const struct = state.field(docStructureField);
  const quoteLineNumbers = struct.quoteLineNumbers;
  const lineCalloutType = struct.lineCalloutType;

  const hide = Decoration.replace({});
  const visitRange = ({ from, to }: PreviewRange) => syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      if (!DECORATED_NODE_NAMES.has(node.name)) return;
      if (node.from > docTotal) return false;
      const safeFrom = Math.max(0, Math.min(node.from, docTotal));
      const safeTo = Math.max(0, Math.min(node.to, docTotal));
      const startLine = state.doc.lineAt(safeFrom).number;
      const endLine = state.doc.lineAt(safeTo).number;
      let onLiveLine = false;
      let onReplacedLine = false;
      for (let i = startLine; i <= endLine; i += 1) {
        if (liveLines.has(i)) onLiveLine = true;
        if (replacedLines.has(i)) onReplacedLine = true;
      }

      if (onLiveLine || onReplacedLine) return;

      if (node.name === "Image") {
        const text = state.sliceDoc(node.from, node.to);
        const m = /^!\[([^\]]*)\]\(([^)\s]+)/.exec(text);
        if (m) builder.push({ from: node.from, to: node.to, deco: Decoration.replace({ widget: new ImageWidget(m[2], m[1]) }) });
        return false;
      }

      switch (node.name) {
        case "HeaderMark": {
          let stop = node.to;
          if (state.sliceDoc(stop, stop + 1) === " ") stop += 1;
          if (stop > node.from) builder.push({ from: node.from, to: stop, deco: hide });
          return;
        }
        case "QuoteMark": {
          let stop = node.to;
          if (state.sliceDoc(stop, stop + 1) === " ") stop += 1;
          const lineSlice = state.sliceDoc(stop, stop + 40);
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
        case "CodeMark": {
          const markText = state.sliceDoc(node.from, node.to);
          if (markText.length >= 3 && (/^`{3,}$/.test(markText) || /^~{3,}$/.test(markText))) return;
          if (node.to > node.from) builder.push({ from: node.from, to: node.to, deco: hide });
          return;
        }
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
          const lineText = state.sliceDoc(node.from, node.to);
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
          const markText = state.sliceDoc(node.from, node.to).trim();
          if (/^[-*+]$/.test(markText)) {
            const isTask = /^\s*[-*+]\s+\[[ xX]\]/.test(state.doc.lineAt(node.from).text);
            builder.push({ from: node.from, to: node.to, deco: isTask ? hide : Decoration.replace({ widget: new BulletWidget() }) });
          }
          return;
        }
        case "TaskMarker": {
          const checked = /[xX]/.test(state.sliceDoc(node.from, node.to));
          builder.push({ from: node.from, to: node.to, deco: Decoration.replace({ widget: new TaskWidget(checked) }) });
          return;
        }
        default:
          return;
      }
    },
  });
  for (const range of previewRanges) visitRange(range);

  const isVisible = (from: number, to = from) => previewRanges.some((range) => to >= range.from && from <= range.to);
  const visibleQuoteStarts = [...visibleLines]
    .filter((line) => quoteLineNumbers.has(line))
    .map((line) => state.doc.line(line).from);
  const quoteDecos = visibleQuoteStarts.map((pos) => {
    const lineNum = state.doc.lineAt(pos).number;
    const hasPrev = quoteLineNumbers.has(lineNum - 1);
    const hasNext = quoteLineNumbers.has(lineNum + 1);
    const cType = lineCalloutType.get(lineNum);
    let cls = "cm-quoteline";
    if (!hasPrev && !hasNext) cls += " cm-quote-single";
    else if (!hasPrev && hasNext) cls += " cm-quote-first";
    else if (hasPrev && hasNext) cls += " cm-quote-middle";
    else cls += " cm-quote-last";
    if (cType) {
      if (cType === "important" || cType === "danger" || cType === "error" || cType === "bug") cls += " cm-callout-red";
      else if (cType === "tip" || cType === "hint" || cType === "suggestion") cls += " cm-callout-green";
      else if (cType === "warning" || cType === "caution" || cType === "attention") cls += " cm-callout-yellow";
      else if (cType === "pass" || cType === "success" || cType === "done" || cType === "check" || cType === "ok") cls += " cm-callout-emerald";
      else if (cType === "note" || cType === "info") cls += " cm-callout-blue";
      else if (cType === "question" || cType === "help") cls += " cm-callout-purple";
      else cls += " cm-callout-default";
    }
    return Decoration.line({ class: cls }).range(pos);
  });
  const ranges = [
    ...(titleLineFrom !== null && isVisible(titleLineFrom) ? [titleLineDeco.range(titleLineFrom)] : []),
    ...quoteDecos,
    ...builder.map(({ from, to, deco }) => deco.range(from, to)),
  ];
  return Decoration.set(ranges, true);
}

export function makeLivePreviewPlugin(richRefs: RichRefs) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      if (!shouldRenderRichDocumentWidgets(view.state.doc.length, view.state.doc.lines)) {
        this.decorations = Decoration.none;
        return;
      }
      const ranges = previewRangesForViewport(view.state, view.visibleRanges);
      this.decorations = safeDecorations(() => buildLivePreviewDecorations(view.state, richRefs, ranges));
    }

    update(update: ViewUpdate) {
      const allowRichPreview = shouldRenderRichDocumentWidgets(update.state.doc.length, update.state.doc.lines);
      if (!allowRichPreview) {
        this.decorations = Decoration.none;
        return;
      }
      const previouslyAllowed = shouldRenderRichDocumentWidgets(update.startState.doc.length, update.startState.doc.lines);
      if (!previouslyAllowed) {
        const ranges = previewRangesForViewport(update.state, update.view.visibleRanges);
        this.decorations = safeDecorations(() => buildLivePreviewDecorations(update.state, richRefs, ranges));
        return;
      }
      if (!update.docChanged && !update.selectionSet && !update.viewportChanged) return;
      const sameLiveSelection = sameLiveLines(update.startState, update.state);
      if (
        !update.viewportChanged
        && sameLiveSelection
        && (!update.docChanged || !changedLinesMatch(update, /[*_~`#>[\]!|$=\\+-]/))
      ) {
        if (update.docChanged) this.decorations = this.decorations.map(update.changes);
        return;
      }
      const ranges = previewRangesForViewport(update.state, update.view.visibleRanges);
      this.decorations = safeDecorations(() => buildLivePreviewDecorations(update.state, richRefs, ranges));
    }
  }, { decorations: (plugin) => plugin.decorations });
}

function embedResolver(richRefs: RichRefs) {
  return (target: string): string | null | undefined => {
    const t = target.split("#")[0].trim().toLowerCase();
    const hit = richRefs.notesRef.current.find((n) => {
      const base = (n.path.replace(/\.md$/i, "").split("/").pop() || n.path).toLowerCase();
      return n.title.toLowerCase() === t || n.path.toLowerCase() === t || base === t;
    });
    const body = hit?.content;
    return body && body.trim() ? body : richRefs.getNoteContentRef.current?.(target);
  };
}

function noteReaderBlock(md: string, richRefs: RichRefs, estimatedHeightVal: number = 150): Decoration {
  return Decoration.replace({
    block: true,
    widget: new ReactBlockWidget(md, () => (
      <NoteReader
        content={md}
        className="!mx-0 !my-0 !max-w-none !px-0 !py-0"
        notes={richRefs.notesRef.current}
        onWikilinkActivate={richRefs.onWikilinkActivateRef.current}
        isResolvedTarget={richRefs.isResolvedTargetRef.current}
        getNoteContent={embedResolver(richRefs)}
      />
    ), estimatedHeightVal),
  });
}

function LiveFrontmatterCard({ rawFm, view }: { rawFm: string; view?: EditorView }) {
  const [entries, setEntries] = useState(() => parseFrontmatter(rawFm) || []);

  useEffect(() => {
    setEntries(parseFrontmatter(rawFm) || []);
  }, [rawFm]);

  const handleUpdate = (newEntries: Array<FrontmatterEntry>) => {
    setEntries(newEntries);
    if (!view || view.destroyed) return;
    const fullDoc = view.state.doc.toString();
    const { body } = splitFrontmatter(fullDoc);
    const newDoc = serializeFrontmatter(newEntries, body);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: newDoc },
    });
  };

  const handleAdd = () => {
    const newEntries = [...entries, { key: "", value: "" }];
    handleUpdate(newEntries);
  };

  return (
    <div className="cm-property-interactive">
      <ObsidianPropertiesCard
        entries={entries}
        editable={true}
        onUpdate={handleUpdate}
        onAdd={handleAdd}
      />
    </div>
  );
}

function frontmatterBlock(fmText: string): Decoration {
  const linesCount = fmText.split("\n").length;
  const estimatedFmHeight = Math.max(120, linesCount * 32 + 60);
  return Decoration.replace({
    block: true,
    widget: new ReactBlockWidget("frontmatter-block:" + fmText, (view) => (
      <LiveFrontmatterCard rawFm={fmText} view={view} />
    ), estimatedFmHeight),
  });
}

function tableBlock(tableText: string, from: number, to: number): Decoration {
  const linesCount = tableText.split("\n").length;
  const estimatedHeight = Math.max(160, linesCount * 36 + 70);
  return Decoration.replace({
    block: true,
    widget: new ReactBlockWidget("table-block:" + tableText, (view) => (
      <NotionTableCard initialMarkdown={tableText} from={from} to={to} view={view} editable={true} />
    ), estimatedHeight),
  });
}

export const MAX_RICH_BLOCK_LINES = 160;
export const MAX_RICH_BLOCK_CHARS = 20_000;
export const MAX_RICH_DOCUMENT_LINES = 800;
export const MAX_RICH_DOCUMENT_CHARS = 48_000;

export function shouldRenderRichBlockWidget(markdown: string, lineCount: number): boolean {
  return lineCount <= MAX_RICH_BLOCK_LINES && markdown.length <= MAX_RICH_BLOCK_CHARS;
}

export function shouldRenderRichDocumentWidgets(charCount: number, lineCount: number): boolean {
  return lineCount <= MAX_RICH_DOCUMENT_LINES && charCount <= MAX_RICH_DOCUMENT_CHARS;
}

function buildBlockDecorations(state: EditorState, richRefs: RichRefs, previewRanges: readonly PreviewRange[]): DecorationSet {
  const ranges: { from: number; to: number; deco: Decoration }[] = [];
  const doc = state.doc;
  // React block widgets can change height after CodeMirror measures a viewport.
  // Large documents contain enough blocks for those remeasurements to cascade
  // during fast scrolling, so keep their edit surface virtualized and textual.
  // Reading mode still renders the complete rich Markdown document.
  const allowRichWidgets = shouldRenderRichDocumentWidgets(doc.length, doc.lines);
  const liveLines = getLiveLines(state);
  const anyLive = (startLine: number, endLine: number) => {
    for (let i = startLine; i <= endLine; i += 1) if (liveLines.has(i)) return true;
    return false;
  };

  const struct = state.field(docStructureField);
  const intersects = (startLine: number, endLine: number) => {
    const from = doc.line(startLine).from;
    const to = doc.line(endLine).to;
    return previewRanges.some((range) => to >= range.from && from <= range.to);
  };
  const fmRanges = struct.fmRanges;
  for (const [a, b] of fmRanges) {
    if (!allowRichWidgets || !intersects(a, b)) continue;
    const from = doc.line(a).from;
    const to = doc.line(b).to;
    const fmText = state.sliceDoc(from, to);
    ranges.push({ from, to, deco: frontmatterBlock(fmText) });
  }
  const inFm = (ln: number) => struct.inFm(ln);

  for (const [a, b] of struct.tableRanges) {
    if (!allowRichWidgets || !intersects(a, b)) continue;
    const from = doc.line(a).from;
    const to = doc.line(b).to;
    const tableText = state.sliceDoc(from, to);
    ranges.push({ from, to, deco: tableBlock(tableText, from, to) });
  }

  const fencedRanges = struct.fencedRanges;
  for (const [ln, endLn] of fencedRanges) {
    if (!intersects(ln, endLn)) continue;
    const isLive = anyLive(ln, endLn);
    const from = doc.line(ln).from;
    const to = doc.line(endLn).to;
    const markdown = state.sliceDoc(from, to);
    const lineCount = endLn - ln + 1;
    const useRichWidget = allowRichWidgets && !isLive && shouldRenderRichBlockWidget(markdown, lineCount);
    if (useRichWidget) {
      const estHeight = Math.max(80, lineCount * 24 + 48);
      ranges.push({ from, to, deco: noteReaderBlock(markdown, richRefs, estHeight) });
    } else {
      const isSingle = endLn === ln;
      const visibleLines = previewRanges.flatMap((range) => {
        const start = Math.max(ln, doc.lineAt(range.from).number);
        const end = Math.min(endLn, doc.lineAt(range.to).number);
        return start <= end ? [[start, end] as const] : [];
      });
      for (const [visibleStart, visibleEnd] of visibleLines) for (let i = visibleStart; i <= visibleEnd; i += 1) {
        const lineFrom = doc.line(i).from;
        if (isSingle) ranges.push({ from: lineFrom, to: lineFrom, deco: codeblockSingleDeco });
        else if (i === ln) ranges.push({ from: lineFrom, to: lineFrom, deco: codeblockFirstDeco });
        else if (i === endLn) ranges.push({ from: lineFrom, to: lineFrom, deco: codeblockLastDeco });
        else ranges.push({ from: lineFrom, to: lineFrom, deco: codeblockMiddleDeco });
      }
    }
  }
  const inFenced = (ln: number) => fencedRanges.some(([a, b]) => ln >= a && ln <= b);

  for (const range of previewRanges) {
    let ln = doc.lineAt(range.from).number;
    const lastLine = doc.lineAt(range.to).number;
    for (; ln <= lastLine; ) {
    if (inFenced(ln) || inFm(ln)) { ln += 1; continue; }
    const line = doc.line(ln);
    const text = line.text.trim();

    if (EMBED_LINE_RE.test(text)) {
      if (allowRichWidgets && !liveLines.has(ln)) ranges.push({ from: line.from, to: line.to, deco: noteReaderBlock(text, richRefs, 140) });
      ln += 1; continue;
    }

    if (text.startsWith("$$")) {
      let endLn = ln;
      if (!(text.length >= 4 && text.endsWith("$$"))) {
        endLn = ln + 1;
        while (endLn <= doc.lines && !doc.line(endLn).text.trim().endsWith("$$")) endLn += 1;
      }
      if (endLn <= doc.lines) {
        const from = line.from;
        const to = doc.line(endLn).to;
        const estHeight = Math.max(60, (endLn - ln + 1) * 28 + 20);
        if (allowRichWidgets && !anyLive(ln, endLn)) ranges.push({ from, to, deco: noteReaderBlock(state.sliceDoc(from, to), richRefs, estHeight) });
        ln = endLn + 1; continue;
      }
    }
      ln += 1;
    }
  }

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(ranges.map(({ from, to, deco }) => deco.range(from, to)), true);
}

export function makeBlockPlugin(richRefs: RichRefs) {
  type BlockPreviewState = {
    ranges: PreviewRange[];
    decorations: DecorationSet;
  };

  const initialRanges = (state: EditorState): PreviewRange[] => {
    const lastLine = Math.min(state.doc.lines, 120);
    return [{ from: 0, to: state.doc.line(lastLine).to }];
  };
  const rangesEqual = (left: readonly PreviewRange[], right: readonly PreviewRange[]) =>
    left.length === right.length
    && left.every((range, index) => range.from === right[index]?.from && range.to === right[index]?.to);
  const setPreviewRanges = StateEffect.define<PreviewRange[]>();

  const field = StateField.define<BlockPreviewState>({
    create(state) {
      if (!shouldRenderRichDocumentWidgets(state.doc.length, state.doc.lines)) {
        return { ranges: [], decorations: Decoration.none };
      }
      const ranges = initialRanges(state);
      return {
        ranges,
        decorations: safeDecorations(() => buildBlockDecorations(state, richRefs, ranges)),
      };
    },
    update(value, transaction) {
      if (!shouldRenderRichDocumentWidgets(transaction.state.doc.length, transaction.state.doc.lines)) {
        return value.ranges.length === 0 && value.decorations.size === 0
          ? value
          : { ranges: [], decorations: Decoration.none };
      }
      let ranges = value.ranges.map((range) => ({
        from: transaction.changes.mapPos(range.from, -1),
        to: transaction.changes.mapPos(range.to, 1),
      }));
      let viewportRangesChanged = false;
      for (const effect of transaction.effects) {
        if (effect.is(setPreviewRanges)) {
          viewportRangesChanged = !rangesEqual(ranges, effect.value);
          ranges = effect.value;
        }
      }
      const liveSelectionChanged = transaction.selection
        ? !sameLiveLines(transaction.startState, transaction.state)
        : false;
      const richBlockChanged = docChangeTouchesRichBlock(transaction);
      const structureChanged = docStructureNeedsRefresh(transaction);
      if (!viewportRangesChanged && !liveSelectionChanged && !structureChanged && !richBlockChanged) {
        if (transaction.docChanged) {
          return {
            ranges,
            decorations: value.decorations.map(transaction.changes),
          };
        }
        if (rangesEqual(ranges, value.ranges)) return value;
      }
      if (
        !transaction.docChanged
        && !transaction.selection
        && !viewportRangesChanged
        && rangesEqual(ranges, value.ranges)
      ) {
        return value;
      }
      return {
        ranges,
        decorations: safeDecorations(() => buildBlockDecorations(transaction.state, richRefs, ranges)),
      };
    },
    provide: (stateField) => EditorView.decorations.from(stateField, (value) => value.decorations),
  });

  // Layout-changing decorations must be provided by a StateField. The view
  // plugin only reports the measured viewport back to that field.
  const viewportTracker = ViewPlugin.fromClass(class {
    private queued = false;
    private destroyed = false;

    constructor(private view: EditorView) {
      this.schedule();
    }

    update(update: ViewUpdate) {
      this.view = update.view;
      if (update.docChanged || update.viewportChanged) this.schedule();
    }

    private schedule() {
      if (this.queued) return;
      if (!shouldRenderRichDocumentWidgets(this.view.state.doc.length, this.view.state.doc.lines)) return;
      this.queued = true;
      queueMicrotask(() => {
        this.queued = false;
        if (this.destroyed || this.view.destroyed) return;
        const ranges = previewRangesForViewport(this.view.state, this.view.visibleRanges, 8);
        const current = this.view.state.field(field).ranges;
        if (!rangesEqual(ranges, current)) {
          this.view.dispatch({ effects: setPreviewRanges.of(ranges) });
        }
      });
    }

    destroy() {
      this.destroyed = true;
    }
  });

  return [field, viewportTracker] satisfies Extension;
}

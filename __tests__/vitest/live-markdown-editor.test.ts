import { describe, it, expect } from "vitest";
import { EditorState, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { querySlashCommandItems, transformMarkdownLines } from "../../src/components/editor/cm/blockCommands";
import { parseCodeBlockFence, type MarkdownCommand, type WikiNote } from "../../src/components/editor/cm/types";
import { docStructureField, makeBlockPlugin, previewRangesForViewport, sameLiveLines, shouldRenderRichBlockWidget, shouldRenderRichDocumentWidgets } from "../../src/components/editor/cm/livePreview";
import LiveMarkdownEditor from "../../src/components/editor/LiveMarkdownEditor";
import { shouldSyntaxHighlightCodeBlock } from "../../src/components/editor/NoteReader";
import { reuseContextValue } from "../../src/pages/workspace/WorkspaceContext";

describe("LiveMarkdownEditor Modularization & Helper Verification", () => {
  it("correctly parses markdown code block fences with backticks and tildes", () => {
    expect(parseCodeBlockFence("```ts")).toEqual({ isFence: true, fence: "```", lang: "ts" });
    expect(parseCodeBlockFence("~~~python")).toEqual({ isFence: true, fence: "~~~", lang: "python" });
    expect(parseCodeBlockFence("````javascript")).toEqual({ isFence: true, fence: "````", lang: "javascript" });
    expect(parseCodeBlockFence("```")).toEqual({ isFence: true, fence: "```", lang: "" });
    expect(parseCodeBlockFence("not a code fence")).toEqual({ isFence: false, fence: "", lang: "" });
  });

  it("exports LiveMarkdownEditor component and re-exports public types cleanly", () => {
    expect(typeof LiveMarkdownEditor).toBe("function");
    const testNote: WikiNote = { path: "test.md", title: "Test Note", content: "hello world" };
    expect(testNote.title).toBe("Test Note");
    const cmd: MarkdownCommand = "bold";
    expect(cmd).toBe("bold");
  });

  it("transforms markdown lines as reversible block commands", () => {
    expect(transformMarkdownLines(["Ship finder"], "task-list")).toEqual(["- [ ] Ship finder"]);
    expect(transformMarkdownLines(["- [ ] Ship finder"], "task-list")).toEqual(["Ship finder"]);
    expect(transformMarkdownLines(["Plan"], "heading-2")).toEqual(["## Plan"]);
    expect(transformMarkdownLines(["## Plan"], "heading-2")).toEqual(["Plan"]);
    expect(transformMarkdownLines(["> Quote"], "quote")).toEqual(["Quote"]);
  });

  it("keeps the slash menu small while supporting Notion-like aliases", () => {
    const taskResults = querySlashCommandItems("todo");
    expect(taskResults[0].label).toBe("/task");
    expect(querySlashCommandItems("").length).toBeLessThanOrEqual(9);
  });

  it("limits live-preview work to visible lines plus a small overscan", () => {
    const state = EditorState.create({ doc: Array.from({ length: 1000 }, (_, i) => `Line ${i + 1}`).join("\n") });
    const visible = { from: state.doc.line(500).from, to: state.doc.line(510).to };
    const ranges = previewRangesForViewport(state, [visible]);

    expect(ranges).toHaveLength(1);
    expect(state.doc.lineAt(ranges[0].from).number).toBe(499);
    expect(state.doc.lineAt(ranges[0].to).number).toBe(511);
    expect(ranges[0].to - ranges[0].from).toBeLessThan(state.doc.length / 10);
  });

  it("provides layout-changing block decorations through editor state, not a view plugin", () => {
    const current = <T,>(value: T) => ({ current: value });
    const blockField = makeBlockPlugin({
      notesRef: current([]),
      onWikilinkActivateRef: current(undefined),
      isResolvedTargetRef: current(undefined),
      getNoteContentRef: current(undefined),
    });
    const state = EditorState.create({
      doc: "Title\n\n| A | B |\n| - | - |\n| 1 | 2 |",
      extensions: [docStructureField, blockField],
    });

    const decorationSources = state.facet(EditorView.decorations);
    expect(decorationSources).toHaveLength(1);
    expect(decorationSources[0].size).toBeGreaterThan(0);
  });

  it("does not build offscreen block widgets for a long note", () => {
    const current = <T,>(value: T) => ({ current: value });
    const lines = Array.from({ length: 400 }, (_, index) => `Paragraph ${index + 1}`);
    lines.splice(300, 0, "| A | B |", "| - | - |", "| 1 | 2 |");
    const state = EditorState.create({
      doc: lines.join("\n"),
      extensions: [
        docStructureField,
        makeBlockPlugin({
          notesRef: current([]),
          onWikilinkActivateRef: current(undefined),
          isResolvedTargetRef: current(undefined),
          getNoteContentRef: current(undefined),
        }),
      ],
    });

    const decorationSources = state.facet(EditorView.decorations);
    expect(decorationSources).toHaveLength(1);
    expect(decorationSources[0].size).toBe(0);
  });

  it("keeps oversized fenced blocks out of React widgets and syntax highlighting", () => {
    const largeBlock = Array.from({ length: 300 }, (_, index) => `line ${index + 1}`).join("\n");
    expect(shouldRenderRichBlockWidget(largeBlock, 300)).toBe(false);
    expect(shouldSyntaxHighlightCodeBlock(largeBlock)).toBe(false);
    expect(shouldRenderRichBlockWidget("```ts\nconst ok = true\n```", 3)).toBe(true);
    expect(shouldSyntaxHighlightCodeBlock("const ok = true")).toBe(true);
  });

  it("keeps large documents free of layout-changing React widgets while editing", () => {
    expect(shouldRenderRichDocumentWidgets(29_887, 1_545)).toBe(false);
    expect(shouldRenderRichDocumentWidgets(12_000, 300)).toBe(true);
  });

  it("keeps the structure index stable during Burmese IME and rapid plain typing", () => {
    let state = EditorState.create({
      doc: "ခေါင်းစဉ်\n\nစာရေးနေပါတယ်",
      extensions: [docStructureField],
    });
    const structure = state.field(docStructureField);

    for (const character of " မြန်မာစာကိုချောမွေ့စွာရေးမယ်") {
      state = state.update({
        changes: { from: state.doc.length, insert: character },
        annotations: Transaction.userEvent.of("input.type.compose"),
      }).state;
      expect(state.field(docStructureField)).toBe(structure);
    }
  });

  it("keeps live-preview selection stable while the caret moves within one line", () => {
    const state = EditorState.create({
      doc: "မြန်မာစာကို ချောမွေ့စွာ ရေးမယ်\nSecond line",
      selection: { anchor: 4 },
    });
    const sameLine = state.update({ selection: { anchor: 12 } }).state;
    const nextLine = state.update({ selection: { anchor: state.doc.line(2).from } }).state;

    expect(sameLiveLines(state, sameLine)).toBe(true);
    expect(sameLiveLines(state, nextLine)).toBe(false);
  });

  it("preserves block decorations through rapid plain typing before a rich block", () => {
    const current = <T,>(value: T) => ({ current: value });
    let state = EditorState.create({
      doc: "Draft\n\n| A | B |\n| - | - |\n| 1 | 2 |",
      selection: { anchor: 5 },
      extensions: [
        docStructureField,
        makeBlockPlugin({
          notesRef: current([]),
          onWikilinkActivateRef: current(undefined),
          isResolvedTargetRef: current(undefined),
          getNoteContentRef: current(undefined),
        }),
      ],
    });
    const initialSize = state.facet(EditorView.decorations)[0].size;

    for (const character of " မြန်မာစာ") {
      state = state.update({
        changes: { from: state.selection.main.head, insert: character },
        selection: { anchor: state.selection.main.head + character.length },
        annotations: Transaction.userEvent.of("input.type.compose"),
      }).state;
    }

    expect(state.facet(EditorView.decorations)[0].size).toBe(initialSize);
    expect(state.doc.toString()).toContain("| A | B |");
  });

  it("refreshes the structure index when a structural block is inserted", () => {
    const state = EditorState.create({
      doc: "Title\nBody",
      extensions: [docStructureField],
    });
    const structure = state.field(docStructureField);
    const next = state.update({
      changes: { from: state.doc.length, insert: "\n> [!note] Important" },
    }).state;

    expect(next.field(docStructureField)).not.toBe(structure);
    expect(next.field(docStructureField).quoteLineNumbers.has(3)).toBe(true);
  });

  it("keeps shell consumers asleep for editor-only context updates", () => {
    const previous = { draft: "a", liveNotes: ["a"], sidebarOpen: true };
    const next = { draft: "ab", liveNotes: ["ab"], sidebarOpen: true };
    const reused = reuseContextValue(previous, next, new Set(["draft", "liveNotes"]));

    expect(reused).toBe(previous);
    expect(reused.draft).toBe("ab");
    expect(reuseContextValue(reused, { ...next, sidebarOpen: false }, new Set(["draft", "liveNotes"]))).not.toBe(reused);
  });
});

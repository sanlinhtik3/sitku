import { useState, useEffect, useLayoutEffect, useRef, type CSSProperties, type MutableRefObject } from "react";
import { EditorState, Compartment, Prec } from "@codemirror/state";
import { EditorView, keymap, drawSelection, dropCursor, highlightActiveLine } from "@codemirror/view";
import { saveAttachment } from "@/repositories/local/attachmentStore";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, foldGutter, foldKeymap, indentOnInput, bracketMatching } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { openSearchPanel, searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion } from "@codemirror/autocomplete";
import { cn } from "@/lib/utils";
import { VisualTableEditor } from "@/components/editor/VisualTableEditor";

// Re-export all public interfaces and helper functions for Zero-Breaking-Change compatibility!
export type { WikiNote, MarkdownCommand, RunCommandOptions, LiveEditorHandle } from "./cm/types";
export { parseCodeBlockFence } from "./cm/types";

import { type WikiNote, type LiveEditorHandle } from "./cm/types";
import { targetSelectionFilter, docStructureField, makeLivePreviewPlugin, makeBlockPlugin } from "./cm/livePreview";
import { makeWikilinkPlugin, makeWikilinkCompletions, makeSlashCompletions } from "./cm/autocomplete";
import { beebotMarkdownHighlight, beebotTheme, runCommandOn, getTableBoundsAtPos } from "./cm/commands";

export interface LiveMarkdownEditorProps {
  value: string;
  onChange?: (markdown: string) => void;
  /** Lightweight typing signal. When provided, the host pulls Markdown only when needed. */
  onDirty?: () => void;
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
  /** Resolves an `![[Target]]` embed to that note's body — for inline transclusion rendering. */
  getNoteContent?: (target: string) => string | null | undefined;
  /** Fired when the editor loses focus — drives the silent title→filename sync. */
  onBlur?: () => void;
}

export function editorContentAttributes(spellCheck: boolean, placeholder: string): Record<string, string> {
  return {
    spellcheck: String(spellCheck),
    autocomplete: "off",
    autocorrect: "off",
    autocapitalize: "off",
    writingsuggestions: "false",
    "data-gramm": "false",
    "data-gramm_editor": "false",
    "data-enable-grammarly": "false",
    "data-placeholder": placeholder,
    "aria-label": "Note editor",
    "aria-multiline": "true",
  };
}

// ── React component ────────────────────────────────────────────────────────
export function LiveMarkdownEditor({
  value,
  onChange,
  onDirty,
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
  getNoteContent,
  onBlur,
}: LiveMarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [activeTable, setActiveTable] = useState<{ top: number; left: number; from: number; to: number; markdown: string } | null>(null);
  const [tableEditorOpen, setTableEditorOpen] = useState(false);
  const [editingTableMarkdown, setEditingTableMarkdown] = useState("");
  const tableReplaceRangeRef = useRef<{ from: number; to: number } | null>(null);
  const editableCompartment = useRef(new Compartment());
  const spellCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onDirtyRef = useRef(onDirty);
  const onLinkShortcutRef = useRef(onLinkShortcut);
  const notesRef = useRef<WikiNote[]>(notes || []);
  const onWikilinkActivateRef = useRef(onWikilinkActivate);
  const isResolvedTargetRef = useRef(isResolvedTarget);
  const getNoteContentRef = useRef(getNoteContent);
  const onBlurRef = useRef(onBlur);

  onChangeRef.current = onChange;
  onDirtyRef.current = onDirty;
  onLinkShortcutRef.current = onLinkShortcut;
  notesRef.current = notes || [];
  onWikilinkActivateRef.current = onWikilinkActivate;
  isResolvedTargetRef.current = isResolvedTarget;
  getNoteContentRef.current = getNoteContent;
  onBlurRef.current = onBlur;

  // Mount EditorView once.
  useLayoutEffect(() => {
    if (!hostRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        targetSelectionFilter,
        drawSelection(),
        dropCursor(),
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
        docStructureField,
        makeLivePreviewPlugin({ notesRef, onWikilinkActivateRef, isResolvedTargetRef, getNoteContentRef }),
        makeBlockPlugin({ notesRef, onWikilinkActivateRef, isResolvedTargetRef, getNoteContentRef }),
        makeWikilinkPlugin(notesRef, isResolvedTargetRef, onWikilinkActivateRef),
        autocompletion({
          override: [makeWikilinkCompletions(notesRef), makeSlashCompletions()],
          activateOnTyping: true,
          closeOnBlur: true,
          maxRenderedOptions: 12,
        }),
        beebotTheme,
        editableCompartment.current.of(EditorView.editable.of(editable)),
        spellCompartment.current.of(EditorView.contentAttributes.of(editorContentAttributes(spellCheck, placeholder))),
        Prec.high(keymap.of([
          { key: "Mod-b", run: (view) => { runCommandOn(view, "bold"); return true; } },
          { key: "Mod-i", run: (view) => { runCommandOn(view, "italic"); return true; } },
          { key: "Mod-k", run: () => { onLinkShortcutRef.current?.(); return true; } },
        ])),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap, indentWithTab]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            if (onDirtyRef.current) onDirtyRef.current();
            else onChangeRef.current?.(update.state.doc.toString());
            // Lightweight signal for optional editor-adjacent features. They pull a
            // snapshot after an idle window instead of subscribing to every transaction.
            window.dispatchEvent(new Event("sitku:editor-dirty"));
          }
          if (update.selectionSet || update.docChanged || update.focusChanged) {
            const sel = update.state.selection.main;
            if (update.view.hasFocus) {
              const tableInfo = getTableBoundsAtPos(update.state, sel.head);
              if (tableInfo) {
                const coords = update.view.coordsAtPos(tableInfo.from);
                const hostRect = hostRef.current?.getBoundingClientRect();
                if (coords && hostRect) {
                  const nextTable = {
                    top: Math.max(8, coords.top - hostRect.top - 36),
                    left: Math.max(16, coords.left - hostRect.left),
                    ...tableInfo,
                  };
                  setActiveTable((current) => (
                    current
                    && current.top === nextTable.top
                    && current.left === nextTable.left
                    && current.from === nextTable.from
                    && current.to === nextTable.to
                    && current.markdown === nextTable.markdown
                  ) ? current : nextTable);
                  return;
                }
              }
            }
            setActiveTable((current) => current === null ? current : null);
          }
        }),
        EditorView.domEventHandlers({
          blur: () => { onBlurRef.current?.(); return false; },
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

    if (editorRef) {
      editorRef.current = {
        getMarkdown: () => view.state.doc.toString(),
        setMarkdown: (next: string) => {
          if (next === view.state.doc.toString()) return;
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
        },
        setCursor: (offset: number) => {
          const anchor = Math.max(0, Math.min(offset, view.state.doc.length));
          view.dispatch({ selection: { anchor }, scrollIntoView: true });
          view.focus();
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

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value === current) return;
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
    view.dispatch({
      effects: spellCompartment.current.reconfigure(
        EditorView.contentAttributes.of(editorContentAttributes(spellCheck, placeholder)),
      ),
    });
  }, [spellCheck, placeholder]);

  const style: CSSProperties = { height: "100%" };
  if (fontFamily) style.fontFamily = fontFamily;

  return (
    <div className={cn("beebot-live-editor-wrapper relative h-full w-full", className)}>
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
              changes: { from: r.from, to: r.to, insert: formatted.trim() },
              selection: { anchor: r.from + formatted.trim().length },
            });
          }
        }}
      />
      <div ref={hostRef} className="beebot-live-editor-host h-full w-full" style={style} />
    </div>
  );
}

export default LiveMarkdownEditor;

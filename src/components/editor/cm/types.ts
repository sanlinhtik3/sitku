import { type MutableRefObject } from "react";

// Note metadata used by the wikilink autocompletion + click resolver.
export interface WikiNote {
  path: string;
  title: string;
  // Optional body — only present when the host feeds content-bearing notes (so
  // dataview blocks rendered inside the editor can run their queries). Wikilink
  // autocomplete/resolution ignore it.
  content?: string;
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
  setCursor(offset: number): void;
  focus(): void;
  runCommand(name: MarkdownCommand, options?: RunCommandOptions): void;
  /** Open CodeMirror's in-document search panel (Cmd+F). */
  openSearch(): void;
  /** Returns true if the link prompt should be triggered (caller handles UI). */
  requestLink(): { selection: string };
}

// Refs bundle needed by CodeMirror plugins to access latest React state without reconfiguration.
export interface EditorContextRefs {
  notesRef: MutableRefObject<WikiNote[]>;
  onWikilinkActivateRef: MutableRefObject<((target: string) => void) | undefined>;
  isResolvedTargetRef: MutableRefObject<((target: string) => boolean) | undefined>;
  getNoteContentRef: MutableRefObject<((target: string) => string | null | undefined) | undefined>;
}

export type RichRefs = EditorContextRefs;

export function parseCodeBlockFence(text: string): { isFence: boolean; fence: string; lang: string } {
  const trimmed = text.trim();
  const match = trimmed.match(/^(`{3,}|~{3,})([a-zA-Z0-9_-]*)/);
  if (!match) return { isFence: false, fence: "", lang: "" };
  return { isFence: true, fence: match[1], lang: match[2].toLowerCase() };
}

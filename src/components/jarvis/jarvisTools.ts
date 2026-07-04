import type { NotesRepository } from "@/repositories/contracts/notes";
import type { SearchRepository } from "@/repositories/contracts/search";
// ponytail: action typed as string (not JarvisAction) so this file has NO import from
// jarvisBrain — avoids a circular import that stalls Vite's HMR when this file is new.

// JARVIS agent tools. search_notes + read_note give it vault RAG (answer questions about
// the user's own notes); the rest are app actions. One clear tool per real capability —
// all reuse the existing notes + search repositories, no new storage.
export const TOOL_DECLARATIONS = [
  {
    functionDeclarations: [
      {
        name: "search_notes",
        description:
          "Search the user's notes; returns matching titles + snippets. Use this to answer ANY question about what is in their notes before replying.",
        parameters: {
          type: "object",
          properties: { query: { type: "string", description: "what to look for" } },
          required: ["query"],
        },
      },
      {
        name: "read_note",
        description: "Read the full text of one note by its title (closest match).",
        parameters: {
          type: "object",
          properties: { query: { type: "string", description: "the note title" } },
          required: ["query"],
        },
      },
      { name: "open_cfo", description: "Open the Personal CFO / finance screen." },
      { name: "open_consultant", description: "Open the Agent Consultant screen." },
      { name: "close_app", description: "Close the current full-screen app (CFO/Consultant)." },
      {
        name: "create_note",
        description: "Create a new note with a clear title.",
        parameters: {
          type: "object",
          properties: { title: { type: "string", description: "the note title" } },
          required: ["title"],
        },
      },
    ],
  },
];

export type ToolResult = Record<string, unknown>;
export type ToolExecutor = (name: string, args?: Record<string, unknown>) => Promise<ToolResult>;

// Runs one tool call and returns DATA the model speaks about (search/read) or {ok} for
// side-effect actions. Errors are returned (not thrown) so the model can recover verbally.
export function makeToolExecutor(
  notes: NotesRepository,
  search: SearchRepository,
  execAction: (action: string, title?: string) => Promise<void>,
): ToolExecutor {
  return async function execTool(name, args = {}) {
    try {
      if (name === "search_notes") {
        const results = await search.search(String(args.query || ""), 5);
        return { results: results.map((r) => ({ title: r.title, snippet: r.snippet })) };
      }
      if (name === "read_note") {
        const q = String(args.query || "").trim().toLowerCase();
        if (!q) return { error: "no title given" };
        const list = await notes.listNotes({ limit: 500 });
        const hit =
          list.find((n) => n.title.toLowerCase() === q) ||
          list.find((n) => n.title.toLowerCase().includes(q));
        if (!hit) return { error: "note not found" };
        const full = await notes.readNote(hit.path);
        // ponytail: 4k-char cap keeps the tool response (and the model's next turn) small.
        return { title: hit.title, content: (full?.content || "").slice(0, 4000) };
      }
      if (name === "open_cfo" || name === "open_consultant" || name === "close_app" || name === "create_note") {
        const action = name === "close_app" ? "close" : name;
        await execAction(action, typeof args.title === "string" ? args.title : undefined);
        return { ok: true };
      }
      return { error: `unknown tool: ${name}` };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "tool failed" };
    }
  };
}

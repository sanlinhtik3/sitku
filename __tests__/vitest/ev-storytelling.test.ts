import { describe, expect, it, vi } from "vitest";
import type { NotesRepository } from "@/repositories/contracts/notes";
import type { EvOperatorAgent } from "@/features/ev-voice/operator";
import type { WorkspaceTruthSnapshot } from "@/features/ev-voice/workspace/contracts";
import {
  createEvStorytellingToolRegistry,
  EV_STORYTELLING_TOOL_DECLARATIONS,
} from "@/features/ev-voice/storytelling/storytellingRegistry";
import {
  parseStorytellingReview,
  parseStorytellingRevision,
  storytellingRevisionPrompt,
} from "@/features/ev-voice/storytelling/storytellingProtocol";
import { registerWorkspaceActionPort } from "@/features/ev-voice/workspace/workspaceContext";

const markdown = "# Hook\n\nContext.\n\nConflict.\n\nResolution.";

function snapshot(content = markdown, contentHash = "source-hash"): WorkspaceTruthSnapshot {
  return {
    snapshotId: `snapshot-${contentHash}`,
    capturedAt: "2026-08-13T00:00:00.000Z",
    room: "notes",
    openFiles: [{ path: "Story.md", title: "Story", active: true, split: false, dirty: true }],
    activeFile: {
      path: "Story.md", title: "Story", active: true, split: false, dirty: true,
      content, contentHash, source: "editor-draft",
    },
  };
}

function dependencies(result: string, capture = vi.fn(async () => snapshot())) {
  let saved = markdown;
  const notes = {
    listNotes: vi.fn(async () => [{ path: "Story.md", title: "Story", content: saved, contentHash: "source-hash" }]),
    readNote: vi.fn(async () => ({ path: "Story.md", title: "Story", content: saved, contentHash: "saved-hash" })),
  } as unknown as NotesRepository;
  const operator = {
    run: vi.fn(async () => ({ status: "completed", result })),
  } as unknown as EvOperatorAgent;
  return { notes, operator, capture, setSaved: (content: string) => { saved = content; } };
}

const reviewJson = JSON.stringify({
  summary: "A focused story.", verdict: "The hook works but the stakes are missing.", audienceFit: "Fits a Myanmar Facebook audience.",
  structure: [
    { beat: "hook", status: "strong", paragraph: 1, reason: "It opens clearly." },
    { beat: "stakes", status: "missing", paragraph: null, reason: "The viewer consequence is absent." },
  ],
  strengths: ["Clear opening"], gaps: ["No viewer stakes"],
  fixes: [{ title: "Add stakes", instruction: "Explain why the outcome matters.", paragraph: 3 }],
});

const revisionJson = JSON.stringify({
  scope: "hook", rationale: "Start with the consequence.",
  changes: [{ paragraph: 1, before: "# Hook", after: "# One decision changed everything", reason: "Creates curiosity." }],
  revisedMarkdown: "# One decision changed everything\n\nContext.\n\nConflict.\n\nResolution.",
});

describe("E.V Storytelling Master", () => {
  it("publishes create, review, scoped revision, and approval-gated apply capabilities", () => {
    expect(EV_STORYTELLING_TOOL_DECLARATIONS.map((tool) => tool.name)).toEqual([
      "storytelling_create_script",
      "storytelling_review_script",
      "storytelling_revise_script",
      "storytelling_apply_revision",
    ]);
  });

  it("validates review and complete-document revision contracts", () => {
    expect(parseStorytellingReview(reviewJson)).toEqual(expect.objectContaining({
      verdict: expect.stringContaining("stakes"), fixes: [expect.objectContaining({ paragraph: 3 })],
    }));
    expect(parseStorytellingRevision(revisionJson)).toEqual(expect.objectContaining({
      scope: "hook", revisedMarkdown: expect.stringContaining("One decision"),
    }));
    expect(() => parseStorytellingRevision('{"scope":"hook","rationale":"x","changes":[]}')).toThrow(/Revised Markdown/);
    expect(storytellingRevisionPrompt({ content: markdown, instruction: "Fix hook", scope: "hook", profile: {} }))
      .toContain("change only the requested scope");
  });

  it("reviews the authoritative active draft with evidence and no write", async () => {
    const deps = dependencies(reviewJson);
    const registry = createEvStorytellingToolRegistry(deps);
    const result = await registry.execute("storytelling_review_script", {}, { userTranscript: "ဒီ script ကို review လုပ်" });
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({ path: "Story.md", contentHash: "source-hash", review: expect.objectContaining({ summary: "A focused story." }) }),
      evidence: [expect.objectContaining({ path: "Story.md", contentHash: "source-hash" })],
    }));
    expect(deps.operator.run).toHaveBeenCalledWith(expect.objectContaining({
      request: expect.stringContaining(markdown),
      persistedRequest: "Storytelling review · Story.md · source-hash",
    }));
  });

  it("rejects a revision when the active draft changes during generation", async () => {
    let count = 0;
    const capture = vi.fn(async () => count++ === 0 ? snapshot() : snapshot(`${markdown}\nchanged`, "changed-hash"));
    const deps = dependencies(revisionJson, capture);
    const registry = createEvStorytellingToolRegistry(deps);
    const result = await registry.execute("storytelling_revise_script", { instruction: "Fix hook", scope: "hook" }, { userTranscript: "hook ပြင်" });
    expect(result).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "CONTENT_CHANGED" }) }));
  });

  it("returns a visible approval preview and does not apply on preview", async () => {
    const deps = dependencies(revisionJson);
    const registry = createEvStorytellingToolRegistry(deps);
    const revised = parseStorytellingRevision(revisionJson).revisedMarkdown;
    const preview = await registry.preview("storytelling_apply_revision", {
      path: "Story.md", content: revised, expectedContentHash: "source-hash", summary: "Fix the hook",
    }, { userTranscript: "apply it" });
    expect(preview).toEqual(expect.objectContaining({
      ok: true, requiresConfirmation: true, intent: "update_note", data: expect.objectContaining({ path: "Story.md" }),
    }));
    expect(deps.notes.readNote).not.toHaveBeenCalled();
  });

  it("applies an approved revision through the shared note CRUD port and verifies the saved content", async () => {
    const revised = `${parseStorytellingRevision(revisionJson).revisedMarkdown}\n`;
    const deps = dependencies(revisionJson);
    deps.setSaved(revised);
    const updateNote = vi.fn(async (input) => ({
      path: input.path,
      title: "Story",
      contentHash: "saved-hash",
      active: true,
    }));
    const unregister = registerWorkspaceActionPort({
      createNote: vi.fn(),
      openNote: vi.fn(),
      updateNote,
      deleteNote: vi.fn(),
      renameNote: vi.fn(),
    });
    try {
      const registry = createEvStorytellingToolRegistry(deps);
      const result = await registry.execute("storytelling_apply_revision", {
        path: "Story.md",
        content: revised,
        expectedContentHash: "source-hash",
      }, { userTranscript: "approved", approved: true });
      expect(updateNote).toHaveBeenCalledWith({
        path: "Story.md",
        content: revised,
        expectedContentHash: "source-hash",
      });
      expect(result).toEqual(expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ path: "Story.md", applied: true }),
        evidence: [expect.objectContaining({ path: "Story.md", contentHash: "saved-hash" })],
      }));
    } finally {
      unregister();
    }
  });
});

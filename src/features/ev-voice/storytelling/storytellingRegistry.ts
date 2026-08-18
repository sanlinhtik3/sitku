import type { NotesRepository } from "@/repositories/contracts/notes";
import type { EvOperatorAgent } from "@/features/ev-voice/operator";
import {
  captureWorkspaceTruth,
  runWorkspaceNoteAction,
  stableContentHash,
} from "@/features/ev-voice/workspace/workspaceContext";
import type {
  EvidenceRef,
  EvToolErrorCode,
  EvFunctionDeclaration,
  EvToolExecutionContext,
  EvToolPreview,
  EvToolRegistry,
  EvToolResult,
  WorkspaceActiveFile,
  WorkspaceTruthSnapshot,
} from "@/features/ev-voice/workspace/contracts";
import {
  parseStorytellingReview,
  parseStorytellingRevision,
  storytellingCreatePrompt,
  storytellingReviewPrompt,
  storytellingRevisionPrompt,
  type StorytellingScope,
} from "./storytellingProtocol";

interface StorytellingDependencies {
  notes: NotesRepository;
  operator: EvOperatorAgent;
  capture?: () => Promise<WorkspaceTruthSnapshot | null>;
}

const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
});

const profileProperties = {
  audience: { type: "string" },
  objective: { type: "string" },
  platform: { type: "string" },
  format: { type: "string" },
  language: { type: "string" },
};

export const EV_STORYTELLING_TOOL_DECLARATIONS: EvFunctionDeclaration[] = [
  {
    name: "storytelling_create_script",
    description: "Create a truthful, conversational storytelling script from a user brief using E.V's Burmese storytelling standard. This produces a draft but does not write a note.",
    parameters: objectSchema({
      brief: { type: "string" },
      sourceMaterial: { type: "string", description: "Only user-supplied facts, notes, or source material. Never invent this value." },
      ...profileProperties,
    }, ["brief"]),
  },
  {
    name: "storytelling_review_script",
    description: "Review the active or named note for hook, context, curiosity, conflict, stakes, evidence, resolution, CTA, audience fit, strengths, gaps, and up to three highest-leverage fixes.",
    parameters: objectSchema({ path: { type: "string" }, query: { type: "string" }, ...profileProperties }),
  },
  {
    name: "storytelling_revise_script",
    description: "Prepare an exact, scoped storytelling revision of the active or named note. Returns complete revised Markdown and a change list, but does not write until storytelling_apply_revision is approved.",
    parameters: objectSchema({
      instruction: { type: "string" },
      scope: { type: "string", enum: ["full_script", "hook", "context", "conflict", "stakes", "resolution", "cta", "paragraph"] },
      paragraph: { type: "number" },
      path: { type: "string" },
      query: { type: "string" },
      ...profileProperties,
    }, ["instruction", "scope"]),
  },
  {
    name: "storytelling_apply_revision",
    description: "Apply one previously generated storytelling revision to a note. This is a note write and always requires Sitku's visible approval dialog.",
    parameters: objectSchema({
      path: { type: "string" },
      content: { type: "string", description: "The exact complete revised Markdown returned by storytelling_revise_script." },
      expectedContentHash: { type: "string", description: "The source content hash returned by storytelling_revise_script." },
      summary: { type: "string", description: "Short human-readable summary of the proposed changes." },
    }, ["path", "content", "expectedContentHash"]),
  },
];

export function createEvStorytellingToolRegistry(deps: StorytellingDependencies): EvToolRegistry & {
  preview(name: string, args: Record<string, unknown>, context: EvToolExecutionContext): Promise<EvToolPreview | null>;
} {
  const capture = deps.capture || captureWorkspaceTruth;

  const execute = async (name: string, args: Record<string, unknown>, context: EvToolExecutionContext): Promise<EvToolResult<unknown>> => {
    try {
      if (name === "storytelling_create_script") {
        const brief = stringArg(args.brief);
        if (!brief) return failure("INVALID_INPUT", "A storytelling brief is required.", "Tell E.V the subject, audience, and desired outcome.");
        const job = await deps.operator.run({
          request: storytellingCreatePrompt({
            brief,
            sourceMaterial: stringArg(args.sourceMaterial),
            ...profile(args),
          }),
          persistedRequest: `Storytelling draft · ${stableContentHash(brief)}`,
          idempotencyKey: context.idempotencyKey || `storytelling-create:${stableContentHash(JSON.stringify(args))}`,
        });
        if (job.status !== "completed" || !job.result) return operatorFailure(job.error?.message);
        const script = stripMarkdownFence(job.result);
        if (!script) return operatorFailure("Storytelling provider returned an empty script.");
        return success({ script, profile: profile(args), nextAction: "Use create_note with this exact script only when the user asks to save it." }, []);
      }

      if (name === "storytelling_review_script" || name === "storytelling_revise_script") {
        const target = await resolveTarget(deps.notes, capture, stringArg(args.path) || stringArg(args.query));
        if (!target) return failure("NO_ACTIVE_FILE", "No storytelling note is available.", "Open a note or give E.V its exact title or path.");
        const isReview = name === "storytelling_review_script";
        const instruction = stringArg(args.instruction);
        const scope = scopeArg(args.scope);
        if (!isReview && (!instruction || !scope)) {
          return failure("INVALID_INPUT", "A revision instruction and scope are required.", "Say exactly what to revise, such as the hook, stakes, resolution, CTA, paragraph, or full script.");
        }
        const request = isReview
          ? storytellingReviewPrompt(target.file.content, profile(args))
          : storytellingRevisionPrompt({
              content: target.file.content,
              instruction,
              scope: scope!,
              paragraph: numberArg(args.paragraph),
              profile: profile(args),
            });
        const job = await deps.operator.run({
          request,
          persistedRequest: `${isReview ? "Storytelling review" : "Storytelling revision"} · ${target.file.path} · ${target.file.contentHash}`,
          idempotencyKey: context.idempotencyKey || `${isReview ? "storytelling-review" : "storytelling-revise"}:${target.file.contentHash}:${stableContentHash(JSON.stringify(args))}`,
        });
        if (job.status !== "completed" || !job.result) return operatorFailure(job.error?.message);
        if (await contentChanged(capture, target.file)) {
          return failure("CONTENT_CHANGED", "The note changed while E.V was working on it.", "Pause editing and ask E.V to run the storytelling operation again.", [target.evidence]);
        }
        if (isReview) return success({ review: parseStorytellingReview(job.result), path: target.file.path, contentHash: target.file.contentHash }, [target.evidence]);
        const revision = parseStorytellingRevision(job.result);
        return success({
          revision,
          path: target.file.path,
          expectedContentHash: target.file.contentHash,
          nextAction: "Call storytelling_apply_revision with this exact path, revisedMarkdown, and expectedContentHash only if the user asked to apply the edit.",
        }, [target.evidence]);
      }

      if (name === "storytelling_apply_revision") {
        const path = stringArg(args.path);
        const content = typeof args.content === "string" ? args.content : "";
        const expectedContentHash = stringArg(args.expectedContentHash);
        if (!path || !content || !expectedContentHash) return failure("INVALID_INPUT", "Path, complete revised Markdown, and source hash are required.", "Generate the revision again before applying it.");
        const receipt = await runWorkspaceNoteAction("updateNote", { path, content, expectedContentHash });
        const saved = await deps.notes.readNote(receipt.path);
        const actualHash = saved?.contentHash || (saved ? stableContentHash(saved.content) : receipt.contentHash);
        if (!saved || normalize(saved.content) !== normalize(content)) {
          return failure("ACTION_VERIFICATION_FAILED", "The revised note could not be verified after writing.", "Keep the current note open and retry after checking storage access.");
        }
        const evidence: EvidenceRef = {
          id: `note-${stableContentHash(`${receipt.path}:${actualHash}`)}`,
          type: "note",
          path: receipt.path,
          title: receipt.title,
          contentHash: actualHash,
          capturedAt: new Date().toISOString(),
        };
        return success({ path: receipt.path, contentHash: actualHash, applied: true }, [evidence]);
      }

      return failure("UNSUPPORTED_OPERATION", `Unsupported storytelling capability: ${name}`, "Use one of E.V's declared storytelling tools.");
    } catch (error) {
      return failure("UNSUPPORTED_OPERATION", error instanceof Error ? error.message : "Storytelling operation failed.", "Retry after checking the AI provider and note state.");
    }
  };

  return {
    declarations: EV_STORYTELLING_TOOL_DECLARATIONS,
    execute,
    cancel: () => undefined,
    preview: async (name, args) => {
      if (name !== "storytelling_apply_revision") return null;
      const path = stringArg(args.path);
      const content = stringArg(args.content);
      if (!path || !content) return { ok: false, error: { code: "INVALID_INPUT", message: "A target note and exact revised Markdown are required." }, recovery: "Generate the revision again." };
      return {
        ok: true,
        requiresConfirmation: true,
        prompt: `Apply storytelling revision to ${path}?`,
        intent: "update_note",
        skill: "notes_skill",
        mode: "command",
        data: { path, summary: stringArg(args.summary) || "Replace the note with the reviewed storytelling revision.", characters: content.length },
      };
    },
  };
}

type Target = { file: WorkspaceActiveFile; evidence: EvidenceRef };

async function resolveTarget(notes: NotesRepository, capture: () => Promise<WorkspaceTruthSnapshot | null>, requested: string): Promise<Target | null> {
  const snapshot = await capture();
  if (!requested && snapshot?.activeFile) return { file: snapshot.activeFile, evidence: noteEvidence(snapshot.activeFile, snapshot) };
  if (!requested) return null;
  if (snapshot?.activeFile && matches(snapshot.activeFile, requested)) return { file: snapshot.activeFile, evidence: noteEvidence(snapshot.activeFile, snapshot) };
  const notesList = await notes.listNotes({ limit: 500 });
  const query = requested.toLocaleLowerCase();
  const matchesList = notesList.filter((note) => note.path.toLocaleLowerCase() === query || note.title.toLocaleLowerCase() === query)
    .concat(notesList.filter((note) => note.path.toLocaleLowerCase().includes(query) || note.title.toLocaleLowerCase().includes(query)));
  const unique = matchesList.filter((note, index, all) => all.findIndex((candidate) => candidate.path === note.path) === index);
  if (unique.length !== 1) return null;
  const note = await notes.readNote(unique[0].path);
  if (!note) return null;
  const file: WorkspaceActiveFile = {
    path: note.path,
    title: note.title,
    content: note.content,
    contentHash: note.contentHash || stableContentHash(note.content),
    source: "repository",
    active: false,
    split: false,
    dirty: false,
    mtimeMs: note.mtimeMs,
  };
  return { file, evidence: noteEvidence(file, null) };
}

function matches(file: WorkspaceActiveFile, query: string) {
  const value = query.toLocaleLowerCase();
  return file.path.toLocaleLowerCase() === value || file.title.toLocaleLowerCase() === value;
}

async function contentChanged(capture: () => Promise<WorkspaceTruthSnapshot | null>, source: WorkspaceActiveFile) {
  const latest = await capture();
  return latest?.activeFile?.path === source.path && latest.activeFile.contentHash !== source.contentHash;
}

function noteEvidence(file: WorkspaceActiveFile, snapshot: WorkspaceTruthSnapshot | null): EvidenceRef {
  return {
    id: `note-${stableContentHash(`${file.path}:${file.contentHash}`)}`,
    type: "note",
    path: file.path,
    title: file.title,
    snapshotId: snapshot?.snapshotId,
    contentHash: file.contentHash,
    capturedAt: snapshot?.capturedAt || new Date().toISOString(),
  };
}

function profile(args: Record<string, unknown>) {
  return {
    audience: stringArg(args.audience) || "Myanmar general audience",
    objective: stringArg(args.objective) || "inform and engage",
    platform: stringArg(args.platform) || "Facebook",
    format: stringArg(args.format) || "social script",
    language: stringArg(args.language) || "Burmese",
  };
}

function scopeArg(value: unknown): StorytellingScope | null {
  const scope = stringArg(value) as StorytellingScope;
  return ["full_script", "hook", "context", "conflict", "stakes", "resolution", "cta", "paragraph"].includes(scope) ? scope : null;
}

function stringArg(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function numberArg(value: unknown) { const result = Number(value); return Number.isInteger(result) && result > 0 ? result : undefined; }
function stripMarkdownFence(value: string) { return value.trim().replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/i, "").trim(); }
function normalize(value: string) { return value.replace(/\r\n/g, "\n").trimEnd(); }
function success<T>(data: T, evidence: EvidenceRef[]): EvToolResult<T> { return { ok: true, data, evidence }; }
function failure(code: EvToolErrorCode, message: string, recovery: string, evidence: EvidenceRef[] = []): EvToolResult<never> { return { ok: false, error: { code, message }, recovery, evidence }; }
function operatorFailure(message = "The E.V Operator could not complete the storytelling work.") { return failure("SEARCH_UNAVAILABLE", message, "Check the AI provider connection and retry."); }

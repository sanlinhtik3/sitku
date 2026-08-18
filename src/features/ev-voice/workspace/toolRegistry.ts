import type { NotesRepository } from "@/repositories/contracts/notes";
import type { SearchRepository } from "@/repositories/contracts/search";
import type { EvOperatorAgent } from "@/features/ev-voice/operator";
import type { EvLongTermMemory, EvMemoryRepository } from "@/features/ev-voice/memory/contracts";
import {
  webSearchPolicy,
  webSearchQueryAllowed,
  planWebSearch,
  captureWorkspaceTruth,
  stableContentHash,
} from "./workspaceContext";
import type { AdaptiveWebSearchPlan, WebSearchPolicy } from "./workspaceContext";
import type {
  EvidenceRef,
  EvFunctionDeclaration,
  EvToolErrorCode,
  EvToolExecutionContext,
  EvToolRegistry,
  EvToolResult,
  GroundedAnswer,
  WorkspaceActiveFile,
  WorkspaceTruthSnapshot,
} from "./contracts";

const READ_CHUNK_SIZE = 1_400;
const MAX_ANALYSIS_CHARS = 120_000;

export interface GroundedWebResult {
  answer: string;
  sources: Array<{ title?: string; url: string; snippet?: string; score?: number | null; publishedDate?: string }>;
}

export interface GroundedWebOptions {
  searchDepth: "basic" | "advanced";
  maxResults: number;
  topic?: "general" | "news" | "finance";
  timeRange?: "day" | "week" | "month" | "year";
}

export const EV_WORKSPACE_CAPABILITIES = {
  web_search: {
    modes: ["current-fact", "research-decision"],
    risk: "read-only-network",
    requiresEvidence: true,
    minimumResults: 1,
    maximumResults: 10,
    supportsAdaptiveRetry: true,
  },
} as const;

interface RegistryDependencies {
  notes: NotesRepository;
  search: SearchRepository;
  operator: EvOperatorAgent;
  memory?: EvMemoryRepository;
  webSearch?: (query: string, signal?: AbortSignal, options?: GroundedWebOptions) => Promise<GroundedWebResult>;
  capture?: () => Promise<WorkspaceTruthSnapshot | null>;
}

type ContentTarget = {
  file: WorkspaceActiveFile;
  snapshot: WorkspaceTruthSnapshot | null;
  evidence: EvidenceRef;
};

type WebSearchRun = GroundedWebResult & {
  plan: AdaptiveWebSearchPlan;
  attempts: number;
  evidenceQuality: "sufficient" | "weak";
};

const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
});

export const EV_WORKSPACE_TOOL_DECLARATIONS: EvFunctionDeclaration[] = [
  {
    name: "workspace_get_state",
    description: "Get authoritative current Sitku room, open-file count, active-file metadata, dirty state, and snapshot identity. Use before making any workspace claim.",
    parameters: objectSchema({}),
  },
  {
    name: "workspace_list_open_files",
    description: "List authoritative currently open note tabs in UI order, including active, split-view, and unsaved state.",
    parameters: objectSchema({}),
  },
  {
    name: "workspace_read_active_file",
    description: "Read the authoritative active note, preferring the unsaved editor draft. Returns one sequential chunk. Keep calling with nextCursor until hasMore is false when the user asks for the full note.",
    parameters: objectSchema({
      cursor: { type: "number", description: "Character cursor returned by the previous call. Start at 0." },
      verbatim: { type: "boolean", description: "Keep Markdown syntax only when the user explicitly asks for verbatim reading." },
    }),
  },
  {
    name: "notes_read_file",
    description: "Read a note by exact path or closest title match. Returns sequential chunks without a hidden 4000-character cap.",
    parameters: objectSchema({
      path: { type: "string" },
      query: { type: "string" },
      cursor: { type: "number" },
      verbatim: { type: "boolean" },
    }),
  },
  {
    name: "notes_search_related",
    description: "Search the local vault for related notes. This never uses the web.",
    parameters: objectSchema({ query: { type: "string" }, limit: { type: "number" } }, ["query"]),
  },
  {
    name: "notes_summarize",
    description: "Summarize one immutable capture of the active note or named note with evidence. Never infer file content without this tool.",
    parameters: objectSchema({ path: { type: "string" }, query: { type: "string" } }),
  },
  {
    name: "notes_fact_check",
    description: "Check claims against local vault evidence. Add web grounding when the user explicitly requests it or the spoken query clearly needs current, changing information.",
    parameters: objectSchema({ query: { type: "string" }, path: { type: "string" } }, ["query"]),
  },
  {
    name: "web_search",
    description: "Search the live web with Tavily and return citable sources. Call automatically when the user asks for changing facts, recommendations, comparisons, product research, prices, news, weather, schedules, laws, leaders, or software releases; the policy layer will authorize eligible intent. Do not call for casual conversation, coaching, creative drafting, or app-local questions. Never send note or workspace content unless the user explicitly requests online verification.",
    parameters: objectSchema({
      query: { type: "string" },
      searchDepth: { type: "string", enum: ["basic", "advanced"] },
      maxResults: { type: "number" },
      topic: { type: "string", enum: ["general", "news", "finance"] },
      timeRange: { type: "string", enum: ["day", "week", "month", "year"] },
    }, ["query"]),
  },
  {
    name: "memory_recall",
    description: "Recall confirmed local E.V memories only when the user explicitly asks what E.V remembers, or asks to see remembered preferences, facts, decisions, or instructions. Never call this automatically and never use it as current workspace truth.",
    parameters: objectSchema({
      query: { type: "string", description: "The memory topic explicitly requested by the user." },
      limit: { type: "number", description: "Maximum memories to return, from 1 to 8." },
    }),
  },
];

export function createEvWorkspaceToolRegistry(deps: RegistryDependencies): EvToolRegistry {
  const activeControllers = new Map<string, {
    controller: AbortController;
    interruptibility: "foreground" | "background";
  }>();
  const capture = deps.capture || captureWorkspaceTruth;

  const run = async (
    name: string,
    args: Record<string, unknown>,
    context: EvToolExecutionContext,
  ): Promise<EvToolResult<unknown>> => {
    const executionId = context.executionId || `${name}:${crypto.randomUUID()}`;
    const controller = new AbortController();
    activeControllers.set(executionId, {
      controller,
      interruptibility: context.interruptibility || "foreground",
    });
    const signal = context.signal
      ? AbortSignal.any([context.signal, controller.signal])
      : controller.signal;
    try {
      switch (name) {
        case "workspace_get_state": {
          const snapshot = await capture();
          if (!snapshot) return failure("NO_WORKSPACE_CONTEXT", "Sitku workspace context is not available.", "Open the Notes workspace and try again.");
          const evidence = snapshotEvidence(snapshot);
          return success({
            snapshotId: snapshot.snapshotId,
            capturedAt: snapshot.capturedAt,
            room: snapshot.room,
            vault: snapshot.vault,
            openFileCount: snapshot.openFiles.length,
            activeFile: snapshot.activeFile ? publicFile(snapshot.activeFile) : null,
          }, evidence);
        }
        case "workspace_list_open_files": {
          const snapshot = await capture();
          if (!snapshot) return failure("NO_WORKSPACE_CONTEXT", "Sitku workspace context is not available.", "Open the Notes workspace and try again.");
          return success({ snapshotId: snapshot.snapshotId, files: snapshot.openFiles }, snapshotEvidence(snapshot));
        }
        case "workspace_read_active_file": {
          const target = await resolveTarget(deps.notes, capture);
          if (!target) return failure("NO_ACTIVE_FILE", "No active note is open.", "Open a note, then ask E.V to read it again.");
          return success(readChunk(target.file, args), [target.evidence]);
        }
        case "notes_read_file": {
          const target = await resolveTarget(deps.notes, capture, stringArg(args.path) || stringArg(args.query));
          if (!target) return failure("FILE_NOT_FOUND", "The requested note could not be found.", "Give E.V the exact note title or path.");
          return success(readChunk(target.file, args), [target.evidence]);
        }
        case "notes_search_related": {
          const query = stringArg(args.query);
          if (!query) return failure("SEARCH_UNAVAILABLE", "A local search query is required.", "Say what topic E.V should search for.");
          const limit = Math.max(1, Math.min(20, numberArg(args.limit, 8)));
          const results = await deps.search.search(query, limit);
          const capturedAt = new Date().toISOString();
          const evidence = results.map((item, index): EvidenceRef => ({
            id: `search-${stableContentHash(`${item.path || item.id}:${item.snippet}`)}-${index}`,
            type: "search",
            path: item.path,
            title: item.title,
            capturedAt,
            snippet: item.snippet,
          }));
          if (!evidence.length) {
            evidence.push({
              id: `search-empty-${stableContentHash(query)}`,
              type: "search",
              title: "Local vault search",
              capturedAt,
              snippet: `No local results for: ${query}`,
            });
          }
          return success({ query, results: results.map((item, index) => ({
            path: item.path,
            title: item.title,
            snippet: item.snippet,
            score: item.score,
            evidenceId: evidence[index]?.id,
          })) }, evidence);
        }
        case "notes_summarize": {
          const target = await resolveTarget(deps.notes, capture, stringArg(args.path) || stringArg(args.query));
          if (!target) return failure("NO_ACTIVE_FILE", "There is no note available to summarize.", "Open a note or provide its exact path.");
          const request = groundedPrompt("Summarize this note", target, [
            "Return topics, key points, confirmed facts, and uncertainties.",
            "Do not invent information that is absent from the evidence.",
          ]);
          const job = await deps.operator.run({
            request,
            persistedRequest: `Grounded summary · ${target.file.path} · ${target.file.contentHash}`,
            idempotencyKey: `ev-summary:${target.file.contentHash}`,
          });
          if (job.status !== "completed" || !job.result) return operatorFailure(job.error?.message);
          const stale = await contentChanged(capture, target);
          if (stale) return failure("CONTENT_CHANGED", "The note changed while E.V was summarizing it.", "Pause editing and ask E.V to review the note again.", [target.evidence]);
          const answer = groundedAnswer(job.result, target.evidence);
          return success(answer, [target.evidence]);
        }
        case "notes_fact_check": {
          const query = stringArg(args.query);
          const target = await resolveTarget(deps.notes, capture, stringArg(args.path));
          const local = await deps.search.search(query, 10);
          const capturedAt = new Date().toISOString();
          const localEvidence = local.map((item, index): EvidenceRef => ({
            id: `local-${stableContentHash(`${item.path || item.id}:${item.snippet}`)}-${index}`,
            type: "search",
            path: item.path,
            title: item.title,
            snippet: item.snippet,
            capturedAt,
          }));
          const evidence = [...(target ? [target.evidence] : []), ...localEvidence];
          const webPolicy = webSearchPolicy(context.userTranscript);
          if (webPolicy.allowed) {
            if (!deps.webSearch) return failure("SEARCH_UNAVAILABLE", "Web verification is unavailable in this runtime.", "Check the provider connection or ask for a local-only check.", evidence);
            if (!webSearchQueryAllowed(query)) return failure("PERMISSION_DENIED", "The generated web query is empty, too long, or contains private paths or secret-like data.", "Rephrase the request without credentials, private paths, or sensitive values.", evidence);
            const web = await adaptiveWebSearch(deps.webSearch, query, context.userTranscript, webPolicy, {}, signal);
            const webEvidence = web.sources.map((source, index): EvidenceRef => ({
              id: `web-${stableContentHash(source.url)}-${index}`,
              type: "web",
              title: source.title,
              url: source.url,
              snippet: source.snippet,
              capturedAt: new Date().toISOString(),
            }));
            if (!webEvidence.length) return failure("SEARCH_UNAVAILABLE", "The provider returned no citable web sources.", "Try a narrower web query.", evidence);
            return success(groundedAnswer(web.answer, webEvidence), [...evidence, ...webEvidence]);
          }
          if (!evidence.length) return failure("SEARCH_UNAVAILABLE", "No local evidence matched this claim.", "Say 'search the web' for explicit online verification, or add a more specific local query.");
          const localContext = local.map((item) => `${item.title}: ${item.snippet}`).join("\n");
          const request = [
            "Fact-check the user's claim using only the supplied local evidence.",
            `Claim: ${query}`,
            target ? `Active note (${target.file.path}, hash ${target.file.contentHash}):\n${analysisContent(target.file.content)}` : "",
            `Local search evidence:\n${localContext}`,
            "Separate supported, contradicted, and unknown claims. Do not use outside knowledge.",
          ].filter(Boolean).join("\n\n");
          const evidenceKey = stableContentHash(evidence.map((item) => item.id).join(":"));
          const job = await deps.operator.run({
            request,
            persistedRequest: `Grounded fact check · ${target?.file.path || "local search"} · ${stableContentHash(query)}`,
            idempotencyKey: `ev-fact:${stableContentHash(query)}:${evidenceKey}`,
          });
          if (job.status !== "completed" || !job.result) return operatorFailure(job.error?.message);
          if (target && await contentChanged(capture, target)) return failure("CONTENT_CHANGED", "The note changed while E.V was checking it.", "Pause editing and run the fact check again.", evidence);
          return success(groundedAnswer(job.result, evidence[0]), evidence);
        }
        case "web_search": {
          const query = stringArg(args.query);
          if (!query) return failure("INVALID_INPUT", "A live web search query is required.", "Say what E.V should search for.");
          if (!webSearchQueryAllowed(query)) return failure("PERMISSION_DENIED", "The generated web query is empty, too long, or contains private paths or secret-like data.", "Rephrase the request without credentials, private paths, or sensitive values.");
          const classifiedPolicy = webSearchPolicy(context.userTranscript);
          if (classifiedPolicy.reason === "local-only") {
            return failure("PERMISSION_DENIED", "Private workspace content cannot be sent to Tavily without an explicit online-verification request.", "Ask E.V to verify the specific claim online without including private note content.");
          }
          // Reaching this handler means Gemini Live deliberately selected the
          // permissioned Tavily capability. The classifier remains responsible
          // for proactive search, but an imperfect keyword score must not veto
          // an otherwise safe public tool call.
          const policy = classifiedPolicy.allowed ? classifiedPolicy : {
            allowed: true,
            automatic: false,
            reason: "intent-inferred" as const,
            goal: "research-decision" as const,
            confidence: 0.7,
            signals: ["model-selected-tavily"],
          };
          if (!deps.webSearch) return failure("SEARCH_UNAVAILABLE", "Tavily web search is unavailable in this runtime.", "Open the Electron desktop app and configure Tavily in Settings.");
          const searchDepth = stringArg(args.searchDepth) === "advanced" ? "advanced" : undefined;
          const maxResultsValue = Number(args.maxResults);
          const maxResults = Number.isFinite(maxResultsValue) && maxResultsValue > 0 ? maxResultsValue : undefined;
          const topicValue = stringArg(args.topic);
          const topic = topicValue === "news" || topicValue === "finance" || topicValue === "general" ? topicValue : undefined;
          const timeRangeValue = stringArg(args.timeRange);
          const timeRange = timeRangeValue === "day" || timeRangeValue === "week" || timeRangeValue === "month" || timeRangeValue === "year"
            ? timeRangeValue
            : undefined;
          const web = await adaptiveWebSearch(deps.webSearch, query, context.userTranscript, policy, {
            searchDepth,
            maxResults,
            topic,
            timeRange,
          }, signal);
          const capturedAt = new Date().toISOString();
          const evidence = web.sources.map((source, index): EvidenceRef => ({
            id: `web-${stableContentHash(source.url)}-${index}`,
            type: "web",
            title: source.title,
            url: source.url,
            snippet: source.snippet,
            capturedAt,
          }));
          if (!evidence.length) return failure("SEARCH_UNAVAILABLE", "Tavily returned no citable web sources.", "Try a narrower or more specific search query.");
          return success({
            query,
            trigger: policy.reason,
            goal: policy.goal,
            confidence: policy.confidence,
            plan: web.plan,
            attempts: web.attempts,
            evidenceQuality: web.evidenceQuality,
            answer: web.answer,
            sources: web.sources.map((source, index) => ({ ...source, evidenceId: evidence[index].id })),
          }, evidence);
        }
        case "memory_recall": {
          if (!explicitMemoryRecallRequested(context.userTranscript)) {
            return failure(
              "PERMISSION_DENIED",
              "E.V memory can be recalled only after an explicit user request.",
              "Ask what E.V remembers, or ask to show remembered preferences, facts, decisions, or instructions.",
            );
          }
          if (!deps.memory) {
            return failure("MEMORY_UNAVAILABLE", "E.V memory storage is unavailable in this runtime.", "Open the Electron app or restore the local memory store, then retry.");
          }
          const query = stringArg(args.query) || context.userTranscript;
          const limit = Math.max(1, Math.min(8, numberArg(args.limit, 5)));
          const confirmed = await deps.memory.listLongTermMemories({ status: "confirmed", limit: 100 });
          const memories = rankMemories(confirmed, query).slice(0, limit);
          if (!memories.length) {
            return failure("MEMORY_UNAVAILABLE", "No confirmed E.V memories matched this request.", "Ask E.V to remember an important fact first, then approve saving it.");
          }
          const evidence = memories.map(memoryEvidence);
          return success({
            query,
            memories: memories.map((memory, index) => ({
              id: memory.id,
              kind: memory.kind,
              content: memory.content,
              confidence: memory.confidence,
              importance: memory.importance,
              updatedAt: memory.updatedAt,
              evidenceId: evidence[index].id,
            })),
          }, evidence);
        }
        default:
          return failure("UNSUPPORTED_OPERATION", `Unsupported E.V tool: ${name}`, "Use one of E.V's declared workspace tools.");
      }
    } catch (error) {
      if (signal.aborted) return failure("TOOL_TIMEOUT", "The E.V operation was cancelled or superseded.", "Ask E.V to run the operation again.");
      const message = error instanceof Error ? error.message : String(error);
      if (/TAVILY_RATE_LIMITED|429|quota|resource_exhausted|prepayment|TAVILY_CREDITS_EXHAUSTED/i.test(message)) return failure("PROVIDER_QUOTA", message, "Tavily is rate-limited or out of credits. Wait briefly or check the Tavily plan, then retry.");
      if (/TAVILY_KEY_MISSING|not configured/i.test(message)) return failure("SEARCH_UNAVAILABLE", "Tavily API key is not configured.", "Open Settings and add a Tavily API key.");
      if (/TAVILY_DESKTOP_REQUIRED/i.test(message)) return failure("SEARCH_UNAVAILABLE", "Tavily requires Sitku's Electron secure-storage bridge.", "Open the Electron desktop app and retry.");
      if (/permission|denied|401|403/i.test(message)) return failure("PERMISSION_DENIED", message, "Check the Tavily API key and provider access, then retry.");
      if (/TAVILY_TIMEOUT|TAVILY_NETWORK_ERROR|TAVILY_UPSTREAM_UNAVAILABLE/i.test(message)) return failure("SEARCH_UNAVAILABLE", message, "The live search provider was temporarily unavailable after automatic retries. Check the connection and retry.");
      return failure("SEARCH_UNAVAILABLE", message, "Retry the operation or use a narrower request.");
    } finally {
      if (activeControllers.get(executionId)?.controller === controller) activeControllers.delete(executionId);
    }
  };

  return {
    declarations: EV_WORKSPACE_TOOL_DECLARATIONS,
    execute: run,
    cancel(options) {
      for (const [executionId, active] of activeControllers) {
        if (options?.executionId && options.executionId !== executionId) continue;
        if (options?.interruptibility && options.interruptibility !== active.interruptibility) continue;
        active.controller.abort(new DOMException("E.V operation cancelled", "AbortError"));
        activeControllers.delete(executionId);
      }
    },
  };
}

function explicitMemoryRecallRequested(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  return /(?:what|which|show|list|recall|retrieve|pull|tell me).{0,32}(?:remember|memory|memories|preference|decision|instruction)|do you remember(?: me| my)?|(?:ဘာ|ဘယ်လို).{0,20}မှတ်ထား|မှတ်ထားတာ.{0,20}(?:ပြ|ပြော)|ငါ့အကြောင်း.{0,20}မှတ်|(?:memory|memories|preference|ဆုံးဖြတ်ချက်).{0,20}(?:ပြ|ပြော)|(?:system|memory|မှတ်ဉာဏ်|အရင်|ခုနက|ပြီးသား|ထည့်သွင်းထား).{0,48}(?:ပြန်ဆွဲ|ပြန်ရှာ|ပြန်ယူ|ပြန်ခေါ်|recall|retrieve|pull)/iu.test(normalized);
}

function rankMemories(memories: EvLongTermMemory[], query: string): EvLongTermMemory[] {
  const normalizedQuery = query.toLocaleLowerCase();
  const broadRecall = /(?:all|everything|show|list).{0,24}(?:remember|memory|memories)|ဘာ(?:တွေ)?မှတ်ထား|မှတ်ထားတာ.{0,20}(?:ပြ|ပြော)|အားလုံး.{0,20}မှတ်ထား/iu.test(normalizedQuery);
  const tokens = [...new Set(normalizedQuery.match(/[\p{L}\p{N}]{2,}/gu) || [])]
    .filter((token) => !/^(?:what|which|show|list|recall|tell|about|remember|memory|memories|ဘာတွေ|ပြော|မှတ်ထား)$/iu.test(token));
  return memories
    .map((memory) => {
      const content = `${memory.kind} ${memory.content}`.toLocaleLowerCase();
      const overlap = tokens.reduce((score, token) => score + (content.includes(token) ? 1 : 0), 0);
      const direct = normalizedQuery.includes(memory.content.toLocaleLowerCase()) || content.includes(normalizedQuery) ? 3 : 0;
      const score = direct + overlap * 2 + memory.importance + memory.confidence;
      return { memory, score, relevant: broadRecall || tokens.length === 0 || direct > 0 || overlap > 0 };
    })
    .filter((item) => item.relevant)
    .sort((a, b) => b.score - a.score || b.memory.updatedAt.localeCompare(a.memory.updatedAt))
    .map((item) => item.memory);
}

function memoryEvidence(memory: EvLongTermMemory): EvidenceRef {
  return {
    id: `memory-${memory.id}`,
    type: "memory",
    title: `Confirmed ${memory.kind}`,
    contentHash: memory.contentHash,
    capturedAt: memory.updatedAt,
    snippet: memory.content.slice(0, 400),
  };
}

async function adaptiveWebSearch(
  search: NonNullable<RegistryDependencies["webSearch"]>,
  query: string,
  transcript: string,
  policy: WebSearchPolicy,
  requested: Partial<GroundedWebOptions>,
  signal: AbortSignal,
): Promise<WebSearchRun> {
  const plan = planWebSearch(transcript, query, policy, requested);
  const options = publicSearchOptions(plan);
  const first = await search(query, signal, options);
  if (!plan.retryOnWeakEvidence || evidenceIsSufficient(first, plan.minimumSources)) {
    return { ...first, plan, attempts: 1, evidenceQuality: "sufficient" };
  }

  const retryPlan: AdaptiveWebSearchPlan = {
    ...plan,
    searchDepth: "advanced",
    maxResults: Math.min(EV_WORKSPACE_CAPABILITIES.web_search.maximumResults, Math.max(plan.maxResults, plan.minimumSources + 3)),
  };
  const refinedQuery = policy.goal === "research-decision"
    ? `${query} independent comparison specifications reviews`
    : `${query} latest official source`;
  if (!webSearchQueryAllowed(refinedQuery)) {
    return { ...first, plan, attempts: 1, evidenceQuality: "weak" };
  }
  const second = await search(refinedQuery, signal, publicSearchOptions(retryPlan));
  const merged = mergeWebResults(first, second);
  return {
    ...merged,
    plan: retryPlan,
    attempts: 2,
    evidenceQuality: evidenceIsSufficient(merged, plan.minimumSources) ? "sufficient" : "weak",
  };
}

function publicSearchOptions(plan: AdaptiveWebSearchPlan): GroundedWebOptions {
  return {
    searchDepth: plan.searchDepth,
    maxResults: plan.maxResults,
    topic: plan.topic,
    timeRange: plan.timeRange,
  };
}

function evidenceIsSufficient(result: GroundedWebResult, minimumSources: number): boolean {
  const validSources = result.sources.filter((source) => /^https?:\/\//i.test(source.url));
  const uniquePublishers = new Set(validSources.map((source) => {
    try {
      return new URL(source.url).hostname.replace(/^www\./, "");
    } catch {
      return source.url.replace(/#.*$/, "");
    }
  }));
  return uniquePublishers.size >= minimumSources && Boolean(result.answer.trim() || validSources.some((source) => source.snippet?.trim()));
}

function mergeWebResults(first: GroundedWebResult, second: GroundedWebResult): GroundedWebResult {
  const sources = [...first.sources, ...second.sources].filter((source, index, all) => (
    all.findIndex((candidate) => candidate.url.replace(/#.*$/, "") === source.url.replace(/#.*$/, "")) === index
  ));
  return {
    answer: second.answer.trim() || first.answer,
    sources,
  };
}

function success<T>(data: T, evidence: EvidenceRef[], stale = false): EvToolResult<T> {
  return { ok: true, data, evidence, ...(stale ? { stale: true } : {}) };
}

function failure(
  code: EvToolErrorCode,
  message: string,
  recovery: string,
  evidence: EvidenceRef[] = [],
): EvToolResult<never> {
  return { ok: false, error: { code, message }, recovery, evidence };
}

function operatorFailure(message = "The E.V Operator could not complete the grounded review.") {
  return failure("SEARCH_UNAVAILABLE", message, "Retry the review after checking the AI provider connection.");
}

function stringArg(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberArg(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function snapshotEvidence(snapshot: WorkspaceTruthSnapshot): EvidenceRef[] {
  const active = snapshot.activeFile;
  return [{
    id: `workspace-${snapshot.snapshotId}`,
    type: "workspace",
    path: active?.path,
    title: active?.title,
    snapshotId: snapshot.snapshotId,
    contentHash: active?.contentHash,
    capturedAt: snapshot.capturedAt,
  }];
}

function fileEvidence(file: WorkspaceActiveFile, snapshot: WorkspaceTruthSnapshot | null): EvidenceRef {
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

async function resolveTarget(
  notes: NotesRepository,
  capture: () => Promise<WorkspaceTruthSnapshot | null>,
  requested = "",
): Promise<ContentTarget | null> {
  const snapshot = await capture();
  if (!requested && snapshot?.activeFile) {
    return { file: snapshot.activeFile, snapshot, evidence: fileEvidence(snapshot.activeFile, snapshot) };
  }
  const query = requested.trim().toLowerCase();
  if (!query) return null;
  const listed = await notes.listNotes({ limit: 500 });
  const hit = listed.find((note) => note.path.toLowerCase() === query)
    || listed.find((note) => note.title.toLowerCase() === query)
    || listed.find((note) => note.title.toLowerCase().includes(query));
  if (!hit) return null;
  if (snapshot?.activeFile?.path === hit.path) {
    return { file: snapshot.activeFile, snapshot, evidence: fileEvidence(snapshot.activeFile, snapshot) };
  }
  const note = await notes.readNote(hit.path);
  if (!note) return null;
  const file: WorkspaceActiveFile = {
    path: note.path,
    title: note.title,
    content: note.content,
    contentHash: note.contentHash || stableContentHash(note.content),
    source: "repository",
    active: false,
    split: snapshot?.openFiles.some((item) => item.path === note.path && item.split) || false,
    dirty: false,
    mtimeMs: note.mtimeMs,
  };
  return { file, snapshot, evidence: fileEvidence(file, snapshot) };
}

function publicFile(file: WorkspaceActiveFile) {
  const { content: _content, ...metadata } = file;
  return metadata;
}

function readChunk(file: WorkspaceActiveFile, args: Record<string, unknown>) {
  const source = args.verbatim === true ? file.content : markdownForSpeech(file.content);
  const cursor = Math.max(0, Math.min(source.length, numberArg(args.cursor, 0)));
  const end = chunkBoundary(source, cursor, READ_CHUNK_SIZE);
  return {
    path: file.path,
    title: file.title,
    contentHash: file.contentHash,
    source: file.source,
    dirty: file.dirty,
    chunk: source.slice(cursor, end),
    cursor,
    nextCursor: end,
    hasMore: end < source.length,
    progress: source.length ? Math.round((end / source.length) * 100) : 100,
    totalCharacters: source.length,
  };
}

function chunkBoundary(content: string, start: number, size: number): number {
  const target = Math.min(content.length, start + size);
  if (target >= content.length) return content.length;
  const floor = start + Math.floor(size * 0.55);
  const candidates = ["\n\n", "။", ". ", "\n"];
  let best = -1;
  for (const marker of candidates) {
    const index = content.lastIndexOf(marker, target);
    if (index >= floor) best = Math.max(best, index + marker.length);
  }
  return best > start ? best : target;
}

function markdownForSpeech(content: string): string {
  return content
    .replace(/^---[\s\S]*?---\s*/m, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`]+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function analysisContent(content: string): string {
  if (content.length <= MAX_ANALYSIS_CHARS) return content;
  return `${content.slice(0, MAX_ANALYSIS_CHARS)}\n\n[Evidence continues beyond the bounded analysis window.]`;
}

function groundedPrompt(title: string, target: ContentTarget, instructions: string[]): string {
  return [
    title,
    `Evidence path: ${target.file.path}`,
    `Evidence hash: ${target.file.contentHash}`,
    `Captured at: ${target.evidence.capturedAt}`,
    ...instructions,
    `<workspace_evidence>\n${analysisContent(target.file.content)}\n</workspace_evidence>`,
  ].join("\n\n");
}

function groundedAnswer(answer: string, evidence?: EvidenceRef | EvidenceRef[]): GroundedAnswer {
  const refs = Array.isArray(evidence) ? evidence : evidence ? [evidence] : [];
  const evidenceIds = refs.map((item) => item.id);
  return {
    answer: answer.trim(),
    claims: answer.trim() ? [{ text: answer.trim(), evidenceIds }] : [],
    evidenceIds,
    unknowns: [],
    confidence: evidence ? "high" : "low",
    stale: false,
  };
}

async function contentChanged(
  capture: () => Promise<WorkspaceTruthSnapshot | null>,
  target: ContentTarget,
): Promise<boolean> {
  if (!target.snapshot?.activeFile || target.snapshot.activeFile.path !== target.file.path) return false;
  const current = await capture();
  return !current?.activeFile
    || current.activeFile.path !== target.file.path
    || current.activeFile.contentHash !== target.file.contentHash;
}

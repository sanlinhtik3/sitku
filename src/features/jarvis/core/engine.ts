// VoicePipelineEngine — continuous duplex stream powered by Gemini Multimodal Live API.

import {
  loadVoiceActionHistory,
  saveVoiceActionHistory,
  voiceIntentNeedsConfirmation,
  voiceModeForIntent,
  voiceSkillForIntent,
  type VoiceActionHistoryItem,
  type VoiceActionPayload,
  type VoiceActionResult,
  type VoiceActionStatus,
  type VoiceMode,
  type VoiceSkill,
} from "./commands";
import { diagnoseActionError, failureExplanation, latestActionFailure } from "@/features/ev-voice/actionAssistant";
import type {
  EvidenceRef,
  EvFunctionDeclaration,
  EvToolPreview,
  EvToolResult,
} from "@/features/ev-voice/workspace/contracts";
import { webSearchPolicy, workspaceEvidenceRequired } from "@/features/ev-voice/workspace/workspaceContext";
import { parseVoiceCommandText } from "./intentParser";
import {
  hydrateConversationWriteIntent,
  type ConversationArtifact,
} from "./conversationContext";
import type { EvConversationMemory } from "@/features/ev-voice/memory/memoryService";
import type { OperatorJob } from "@/features/ev-voice/operator";
import { recordEvEvent, recordEvPhase } from "@/features/ev-voice/observability";
import { createSpeechActivityDetector, type EvInputActivity } from "@/features/ev-voice/input/speechActivity";
import { reasoningPolicyForTurn, type JarvisReasoningRoute } from "./latencyPolicy";
import {
  evNarrativeConversationProtocol,
  parseEvLiveTranslationCommand,
  type EvLiveTranslationState,
} from "@/features/ev-voice/protocols";
import type {
  EvLiveProtocol,
  EvLiveProtocolCallbacks,
  EvLiveProtocolFactory,
  EvLiveSessionConfig,
  EvLiveTranslationCommand,
  EvReasoningLevel,
} from "@/features/ev-voice/protocols";

export type EnginePhase = "idle" | "connecting" | "recording" | "listening" | "thinking" | "confirm" | "running_skill" | "speaking" | "resuming";

export interface EngineIntent {
  action: string;
  title?: string;
  target?: string;
  mode?: VoiceMode;
  skill?: VoiceSkill;
  confidence?: number;
  requiresConfirmation?: boolean;
  payload?: VoiceActionPayload;
  reply: string;
  transcript?: string;
}

export interface EngineSnapshot {
  turnId: string | null;
  utteranceId: string | null;
  phase: EnginePhase;
  heard: string;
  reply: string;
  heardVoice: boolean;
  mode: VoiceMode;
  intent: string;
  skill: VoiceSkill;
  confidence: number;
  actionStatus: VoiceActionStatus;
  actionHistory: VoiceActionHistoryItem[];
  firstAudioLatencyMs: number | null;
  firstTranscriptLatencyMs: number | null;
  transcriptToFirstAudioLatencyMs: number | null;
  inputActivity: EvInputActivity;
  preparedIntent: string | null;
  operationLabel: string | null;
  evidenceCount: number;
  grounded: boolean;
  reasoningLevel: EvReasoningLevel;
  reasoningRoute: JarvisReasoningRoute;
  reasoningScore: number;
  verification: "not_required" | "pending" | "verified" | "failed";
  liveTranslation: EvLiveTranslationState;
}

export type VoiceTurnStatus = "recording" | "thinking" | "confirming" | "running" | "completed" | "failed" | "cancelled" | "interrupted";

export interface VoiceTurnRecord {
  turnId: string;
  idempotencyKey?: string;
  status: VoiceTurnStatus;
  intent?: string;
  skill?: VoiceSkill;
  result?: string;
  reply?: string;
  error?: string;
  transcript?: string;
  actionClaimed?: boolean;
  startedAt?: string;
  updatedAt: string;
  metadata?: VoiceTurnMetadata;
}

export interface VoiceTurnMetadata {
  toolNames?: string[];
  snapshotId?: string;
  evidence?: EvidenceRef[];
  errorCode?: string;
  recovery?: string;
}

export interface VoiceTurnJournal {
  begin(input: { turnId: string; status: VoiceTurnStatus; startedAt: string }): Promise<void>;
  update(input: {
    turnId: string;
    status: VoiceTurnStatus;
    transcript?: string;
    intent?: string;
    skill?: VoiceSkill;
    result?: string;
    reply?: string;
    error?: string;
    metadata?: VoiceTurnMetadata;
  }): Promise<void>;
  claimAction(input: {
    turnId: string;
    idempotencyKey: string;
    intent: string;
    skill: VoiceSkill;
  }): Promise<{ claimed: boolean; result?: string; reply?: string }>;
  listRecent?(limit?: number): Promise<VoiceTurnRecord[]>;
}

export interface SpeechCallbacks {
  turnId?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (reason?: string) => void;
}

export interface EngineDeps {
  brain: {
    understandAudio(wav: Blob, signal?: AbortSignal): Promise<EngineIntent>;
    understandText(text: string, signal?: AbortSignal): Promise<EngineIntent>;
    execAction(action: string, title?: string, intent?: EngineIntent): Promise<void | VoiceActionResult>;
    cancelAction?(): Promise<void> | void;
    cancelForegroundAction?(): Promise<void> | void;
    cancelExecution?(executionId: string): Promise<void> | void;
    offline(text: string): Promise<string>;
    reset?(): void;
    toolDeclarations?: EvFunctionDeclaration[];
    execTool?(
      name: string,
      args: Record<string, unknown>,
      context: { userTranscript: string; signal?: AbortSignal; approved?: boolean; idempotencyKey?: string; preview?: EvToolPreview; executionId?: string; interruptibility?: "foreground" | "background"; startedAt?: number },
    ): Promise<EvToolResult<unknown> | Record<string, unknown>>;
    previewTool?(
      name: string,
      args: Record<string, unknown>,
      context: { userTranscript: string; signal?: AbortSignal },
    ): Promise<EvToolPreview | null>;
    subscribeOperator?(listener: (job: OperatorJob) => void): () => void;
  };
  speech: {
    speak(text: string, cb?: SpeechCallbacks): void;
    stop(): void;
  };
  capture: {
    ready(): boolean;
    begin(onChunk: (chunk: Float32Array) => void): void;
    end(): void;
    sampleRate(): number;
    energy(): number | null;
  };
  offline: {
    start(): void;
    stop(): void;
    isListening(): boolean;
  };
  textInput?: {
    start(): void;
    stop(): void;
  };
  hasKey(): boolean;
  canRecord(): boolean;
  notify?(message: string, description?: string): void;
  journal?: VoiceTurnJournal;
  memory?: EvConversationMemory;
  liveClientFactory: EvLiveProtocolFactory;
  liveSession: () => EvLiveSessionConfig;
}

export interface VoicePipelineEngine {
  micReady(): void;
  stop(): void;
  tapOrb(): void;
  confirm(ok: boolean): Promise<void>;
  clearConversation(): void;
  voiceTranscript(text: string, isFinal: boolean): void;
  offlineTranscript(text: string, isFinal: boolean): void;
  subscribe(cb: (s: EngineSnapshot) => void): () => void;
  getSnapshot(): EngineSnapshot;
}

const MSG_DONE = "ပြီးပါပြီ။";
const MSG_CANCELLED = "ဟုတ်ပြီ၊ မလုပ်တော့ပါဘူး။";
const MSG_CLEARED = "စကားပြောဆက်ဆံမှု ရှင်းလင်းပြီး · Conversation cleared";
const MAX_ACTION_HISTORY = 100;
const ACTION_REPLAY_WINDOW_MS = 15_000;
const ACTION_REPLAY_CACHE_MS = 20_000;
const MSG_DUPLICATE_ACTION = "ဒီ action ကို အခုလေးတင် လုပ်ပြီးသားပါ။ ထပ်မလုပ်ပါဘူး။";

function isNoopAction(action: string | undefined): boolean {
  return !action || action === "none" || action === "no_action";
}

function isActionHistoryEntry(item: VoiceActionHistoryItem): boolean {
  return !isNoopAction(item.intent) && item.result.trim().toLocaleLowerCase() !== "no action";
}

function mergeTranscript(current: string, next: string): string {
  if (!next) return current;
  if (!current || next.startsWith(current)) return next;
  if (current.endsWith(next)) return current;
  return `${current}${next}`;
}

function createTurnId(): string {
  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `ev-${id}`;
}

function stableActionValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return `[${value.map(stableActionValue).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${key}:${stableActionValue(entry)}`)
      .join(",")}}`;
  }
  return String(value).trim().replace(/\s+/g, " ");
}

function hashActionFingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function actionFingerprint(intent: EngineIntent): string {
  return stableActionValue({
    action: intent.action,
    title: intent.title,
    target: intent.target,
    payload: intent.payload,
  });
}

function actionIdempotencyKey(fingerprint: string, now = Date.now()): string {
  return `ev-action-v2:${hashActionFingerprint(fingerprint)}:${Math.floor(now / ACTION_REPLAY_WINDOW_MS)}`;
}

function spokenConfirmation(text: string): boolean | null {
  const normalized = text.trim().replace(/[.!?။၊]+$/g, "").toLocaleLowerCase();
  if (/^(yes|yes please|ok|okay|approve|confirm|do it|အိုကေ|ဟုတ်|ဟုတ်ကဲ့|အတည်ပြု|လုပ်ပါ|လုပ်လိုက်)$/.test(normalized)) return true;
  if (/^(no|no thanks|deny|decline|cancel|stop|မလုပ်ဘူး|မလုပ်ပါနဲ့|မလုပ်တော့ဘူး|ငြင်းပယ်|ပယ်ဖျက်)$/.test(normalized)) return false;
  return null;
}

const SCHEMA = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: [
        "save_to_inbox", "create_note", "open_note", "update_note", "append_note", "rename_note", "delete_note", "summarize_note",
        "create_task", "list_today_tasks", "complete_task",
        "daily_review", "get_vault_stats", "explain_last_failure",
        "delegate_operator_task", "get_operator_status", "cancel_operator_task",
        "revenue_update", "open_dashboard",
        "coach_mode", "ceo_mode", "open_cfo", "open_consultant", "close", "none",
      ],
    },
    mode: { type: "string", enum: ["command", "conversation", "dictation", "question", "system_control"] },
    skill: {
      type: "string",
      enum: ["inbox_skill", "notes_skill", "tasks_skill", "dashboard_skill", "money_skill", "coach_skill", "ceo_skill", "system_skill", "conversation_skill"],
    },
    confidence: { type: "number" },
    requiresConfirmation: { type: "boolean" },
    title: { type: "string" },
    target: { type: "string" },
    payload: {
      type: "object",
      properties: {
        content: { type: "string", description: "The exact text to write. For 'save this/our discussion' requests, include the generated or discussed content here; never omit it." },
        target: { type: "string" },
        amount: { type: "number" },
        source: { type: "string" },
        date: { type: "string" },
        jobId: { type: "string" },
        prompt: { type: "string" },
        path: { type: "string" },
        newTitle: { type: "string" },
      },
    },
    transcript: { type: "string" },
    reply: { type: "string" },
  },
  required: ["action", "mode", "skill", "confidence", "requiresConfirmation", "reply"],
};

const SYSTEM = `You are E.V, Sitku's calm, precise bilingual Burmese and English voice operator.
This is an ONGOING CONVERSATION. Use the conversation history to stay coherent and continuous, exactly like talking to a person.

The user's NEW input may arrive as spoken audio. Detect its language and respond in the SAME language — switching naturally if they switch.

VOICE DELIVERY POLICY:
- Sound like one attentive person, not a narrator or a metronome. Use natural sentence stress, pitch contour, rhythm, pace, warmth, and short semantic pauses. Avoid a fixed cadence.
- Adapt delivery turn by turn from two sources: the user's audible pace, pitch, intensity, hesitation and expression; and the task state. Treat acoustic cues as style guidance, never as proof of an emotion.
- Commands: compact, calm, direct. Conversation and coaching: warmer and more spacious. Dictation: do not interrupt. Important facts and instructions: slightly slower and clearer. Success: subtly brighter, never theatrical. Failure or risk: steady, grounded, and precise. Urgency: firm and efficient, never alarming.
- Burmese should use natural Burmese phrasing and breath groups rather than English timing. Mixed Burmese and English should preserve intelligibility of names, numbers, paths, and technical terms.
- Do not imitate the user's identity or voice, overperform emotion, add stage directions, diagnose health, or let vocal style change facts, evidence, permissions, or safety decisions.

${evNarrativeConversationProtocol.systemInstruction}

Classify every turn into mode:
- command: direct user instruction; be short and action-focused.
- conversation: coaching/mentor discussion; ask one question at a time.
- dictation: user says "မှတ်ထား", "ရေးထား", "note this"; save raw text and do not interrupt.
- question: answer-only turn.
- system_control: app/navigation control.

For conversation and questions, answer directly with natural native audio. Keep routine replies concise.
For greetings, follow-ups, confirmations, clarifications, and ordinary conversation, respond immediately in one or two sentences. Do not delay the Live turn for exhaustive analysis.
Before acting, silently identify the requested outcome, required inputs, risk, and whether the request has one step or several. Do not expose private chain-of-thought; give only the decision, evidence, action status, and concise reason.
For a multi-step request, preserve the requested order and complete every required step through tools. Never report the whole task as complete when only one step succeeded. If a step fails, stop dependent steps and report the exact failed step, structured error, and recovery.
Use the live model for natural conversation and deterministic app control. For complex analysis, architecture, debugging, research synthesis, or work that benefits from deeper reasoning, delegate to the Operator instead of improvising a shallow answer.
For an app action, use execute_action only when the request is explicit. For create_note, update_note, append_note, rename_note, delete_note and every other important write, CALL execute_action immediately with requiresConfirmation=true. Never merely speak a confirmation question: the tool call is what opens Sitku's approval dialog. open_note is read-only and does not require confirmation. Never claim an action succeeded until its tool result confirms success.
When the user says to save "this", "that", the latest content/script/draft, or the discussion into a note, treat it as one atomic action: choose the requested note title and put the exact relevant generated content in payload.content. Never call create_note, update_note, or append_note with empty content for a referential request. Do not generate a new replacement when the user asked to preserve what was already discussed.
For an explicit terminal request, call terminal_run with one exact command and an optional working directory. Never invent a command when the target or intent is ambiguous. Read-only commands may run immediately; commands that change files or system state are held behind Sitku's approval dialog. Delete and overwrite commands are always destructive and must never run without human approval. E.V cannot use pipes, redirects, command chaining, command substitution, sudo, or system-level disk/power commands. Report the exact structured policy or execution error instead of pretending success.
For questions about the active vault's file or folder count, call get_vault_stats. For questions about why an action failed, call explain_last_failure.
Workspace truth is tool-only. Before naming the current room, open files, active file, dirty state, file contents, file count, summary, related notes, or fact-check result, call the matching workspace_* or notes_* tool. Never infer these facts from conversation. Every grounded tool response contains evidence IDs. If ok is false, speak its exact error and recovery. When reading a full file, keep calling the read tool with nextCursor until hasMore is false. Use natural reading unless the user explicitly asks for verbatim Markdown.
Use notes_search_related for local vault search. Use notes_fact_check for verification. Infer the user's goal instead of requiring them to say "search the web." Tavily web_search is E.V's only internet search provider. Call it automatically when a useful answer needs external evidence or research, including recommendations, comparisons, products, current prices, news, weather, scores, schedules, exchange rates, laws, public leaders, or software releases. The policy layer makes the final privacy decision and adaptively chooses search depth, topic, recency, source count, and one bounded evidence retry. Do not call web_search for greetings, casual conversation, subjective coaching, creative drafting, or questions answerable from Sitku's local tools. Never send private note or workspace content to web_search unless the user explicitly asks for online verification. Cite the returned source titles and URLs and never invent a source. Never claim to have used Google Search or Gemini grounding. If evidenceQuality is weak after retry, clearly say that evidence is limited instead of presenting a confident conclusion.
Long-term memory is local and permissioned. Call memory_recall only when the user explicitly asks what E.V remembers or asks to see remembered preferences, facts, decisions, or instructions. Never recall memory automatically, never treat it as current workspace truth, and never claim a memory without the returned memory evidence ID.
For complex analysis, architecture, debugging, research, or multi-step planning that does not map to a deterministic Sitku action, call delegate_operator_task with the user's exact request in payload.content. The Operator is a separate read-only specialist and may take longer. Do not delegate greetings, simple questions, navigation, file counts, or ordinary note/task actions.
For storytelling work, use the dedicated storytelling tools instead of improvising. storytelling_create_script creates a draft from the user's brief without writing. storytelling_review_script reviews the active or named note for hook, context, curiosity, conflict, viewer stakes, evidence, resolution, CTA, strengths, gaps, and at most three fixes. storytelling_revise_script prepares an exact scoped revision. If and only if the user explicitly asked to apply that revision, immediately call storytelling_apply_revision with the returned path, complete revisedMarkdown, and expectedContentHash so Sitku opens the approval dialog. Never claim the note changed before the approved apply result succeeds. For a new script the user asks to save, pass the exact generated script to create_note; never regenerate a different version during saving.
Once a delegated Operator task is accepted, it continues independently through voice barge-in. Only an explicit cancel_operator_task request stops it. Keep listening and conversing while it runs; never tell the user that interrupting E.V automatically cancels background work.
Use get_operator_status when the user asks about the latest delegated job. Use cancel_operator_task when the user asks to stop it.
The Operator never receives private vault/task/finance contents automatically and cannot perform writes. If its result says local data or permission is required, explain that honestly instead of claiming completion.
Every tool response contains authoritative status and diagnostics. If ok is false, tell the user the exact error reason and recovery; never answer with only "action failed" or pretend the reason is unknown.`;

export function createVoicePipelineEngine(deps: EngineDeps): VoicePipelineEngine {
  let phase: EnginePhase = "idle";
  let turnId: string | null = null;
  let utteranceId: string | null = null;
  let heard = "";
  let reply = "";
  let heardVoice = false;
  let mode: VoiceMode = "conversation";
  let intentName = "none";
  let skill: VoiceSkill = "conversation_skill";
  let confidence = 1;
  let actionStatus: VoiceActionStatus = "idle";
  const storedActionHistory = loadVoiceActionHistory();
  let actionHistory: VoiceActionHistoryItem[] = storedActionHistory.filter(isActionHistoryEntry);
  if (actionHistory.length !== storedActionHistory.length) saveVoiceActionHistory(actionHistory);
  let firstAudioLatencyMs: number | null = null;
  let firstTranscriptLatencyMs: number | null = null;
  let transcriptToFirstAudioLatencyMs: number | null = null;
  let inputActivity: EvInputActivity = "idle";
  let preparedIntent: string | null = null;
  let operationLabel: string | null = null;
  let liveTranslation: EvLiveTranslationState = {
    active: false,
    targetLanguageCode: "",
    targetLanguageName: "",
    echoTargetLanguage: false,
  };
  let evidence: EvidenceRef[] = [];
  let groundingRequired = false;
  let groundingScope: "workspace" | "web" | null = null;
  let grounded = false;
  let blockedUngroundedOutput = false;
  let turnReceivedAudio = false;
  let silentRetryUsed = false;
  let silentRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let silentFailureTimer: ReturnType<typeof setTimeout> | null = null;
  const backgroundExecutions = new Set<string>();
  let phaseBeforeReconnect: EnginePhase | null = null;
  let operationBeforeReconnect: string | null = null;
  const toolNames = new Set<string>();
  
  let liveClient: EvLiveProtocol | null = null;
  let switchLiveTranslation: (command: Exclude<EvLiveTranslationCommand, null>) => Promise<void> = async () => undefined;
  let capturing = false;
  let pendingTool:
    | { kind: "action"; id: string | null; name: string; intent: EngineIntent }
    | { kind: "custom"; id: string | null; name: string; args: Record<string, unknown>; intent: EngineIntent; preview: Extract<EvToolPreview, { ok: true }> }
    | null = null;
  let turnStartedAt = 0;
  let speechStartedAt = 0;
  let speechSettledAt = 0;
  let firstTranscriptAt = 0;
  const speechActivity = createSpeechActivityDetector();
  let transcriptJournalTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingTranscriptJournal: { turnId: string; transcript: string } | null = null;
  let memorySessionId: string | null = null;
  let memorySessionPromise: Promise<string | null> | null = null;
  const committedMemoryTurns = new Set<string>();
  const recentActionReplays = new Map<string, { at: number; result: string }>();
  const conversationArtifacts: ConversationArtifact[] = [];
  const backgroundReports: string[] = [];
  const rejectedToolCalls = new Map<string, EvToolResult<unknown>>();

  const rememberConversationArtifact = () => {
    const assistant = reply.trim();
    const user = heard.trim();
    if (!turnId || !user || assistant.length < 12 || actionStatus === "failed" || actionStatus === "cancelled") return;
    const previous = conversationArtifacts[conversationArtifacts.length - 1];
    if (previous?.turnId === turnId || (previous?.user === user && previous?.assistant === assistant)) return;
    conversationArtifacts.push({ turnId, user, assistant, action: intentName });
    if (conversationArtifacts.length > 8) conversationArtifacts.splice(0, conversationArtifacts.length - 8);
  };

  const subs = new Set<(s: EngineSnapshot) => void>();
  let reasoningLevel: EvReasoningLevel = deps.liveSession().reasoningLevel;
  let reasoningRoute: JarvisReasoningRoute = "live";
  let reasoningScore = 0;
  const verification = (): EngineSnapshot["verification"] => actionStatus === "failed"
    ? "failed"
    : groundingRequired
      ? grounded ? "verified" : "pending"
      : "not_required";
  let snapshot: EngineSnapshot = { turnId, utteranceId, phase, heard, reply, heardVoice, mode, intent: intentName, skill, confidence, actionStatus, actionHistory, firstAudioLatencyMs, firstTranscriptLatencyMs, transcriptToFirstAudioLatencyMs, inputActivity, preparedIntent, operationLabel, evidenceCount: evidence.length, grounded, reasoningLevel, reasoningRoute, reasoningScore, verification: verification(), liveTranslation };
  const emit = () => {
    snapshot = { turnId, utteranceId, phase, heard, reply, heardVoice, mode, intent: intentName, skill, confidence, actionStatus, actionHistory, firstAudioLatencyMs, firstTranscriptLatencyMs, transcriptToFirstAudioLatencyMs, inputActivity, preparedIntent, operationLabel, evidenceCount: evidence.length, grounded, reasoningLevel, reasoningRoute, reasoningScore, verification: verification(), liveTranslation };
    for (const cb of subs) cb(snapshot);
  };
  const setPhase = (p: EnginePhase) => {
    if (p === phase) return;
    phase = p;
    recordEvPhase(p, turnId);
    emit();
  };

  const clearSilentWatchdog = () => {
    if (silentRetryTimer) clearTimeout(silentRetryTimer);
    if (silentFailureTimer) clearTimeout(silentFailureTimer);
    silentRetryTimer = null;
    silentFailureTimer = null;
  };

  const resetTurnTiming = (clearUtterance = true) => {
    clearSilentWatchdog();
    turnStartedAt = 0;
    speechStartedAt = 0;
    speechSettledAt = 0;
    firstTranscriptAt = 0;
    firstAudioLatencyMs = null;
    firstTranscriptLatencyMs = null;
    transcriptToFirstAudioLatencyMs = null;
    if (clearUtterance) utteranceId = null;
  };

  const scheduleSilentWatchdog = (activeTurn: string) => {
    clearSilentWatchdog();
    silentRetryTimer = setTimeout(() => {
      if (turnId !== activeTurn || turnReceivedAudio || silentRetryUsed || pendingTool || actionStatus === "running" || phase === "running_skill" || phase === "confirm") return;
      silentRetryUsed = true;
      recordEvEvent({
        level: "warn",
        event: "live.silent_turn_recovery",
        status: "retrying",
        traceId: activeTurn,
        turnId: activeTurn,
        errorCode: "NO_OUTPUT_AUDIO",
        recovery: "Requested one bounded spoken retry after 4 seconds without output.",
        metadata: { utteranceId, silent_turn_recovery: "retry" },
      });
      liveClient?.requestSpokenReply();
    }, 4_000);
    silentFailureTimer = setTimeout(() => {
      if (turnId !== activeTurn || turnReceivedAudio || phase === "confirm" || phase === "running_skill") return;
      liveClient?.interrupt();
      operationLabel = "No spoken response received";
      actionStatus = "failed";
      if (!reply.trim()) reply = "E.V က ဒီ turn မှာ အသံပြန်မပေးနိုင်ခဲ့ပါ။ ထပ်ပြောကြည့်ပါ။";
      recordEvEvent({
        level: "error",
        event: "live.silent_turn_recovery",
        status: "failed",
        traceId: activeTurn,
        turnId: activeTurn,
        errorCode: "NO_OUTPUT_AUDIO",
        recovery: "Reset the stale generation after 8 seconds and returned to listening.",
        metadata: { utteranceId, silent_turn_recovery: "reset" },
      });
      turnId = null;
      resetTurnTiming();
      inputActivity = "idle";
      speechActivity.reset();
      setPhase("listening");
      emit();
      flushBackgroundReport();
    }, 8_000);
  };

  const flushBackgroundReport = () => {
    // Live Translate is a translation-only protocol: it accepts audio, not
    // agent prompts or tool reports. Keep completed operator reports queued
    // until the normal E.V session is restored.
    if (liveTranslation.active || !liveClient || phase !== "listening" || turnId || backgroundReports.length === 0) return;
    const report = backgroundReports[0];
    if (!liveClient.sendBackgroundReport(report)) return;
    backgroundReports.shift();
    turnId = createTurnId();
    turnStartedAt = performance.now();
    firstAudioLatencyMs = null;
    firstTranscriptLatencyMs = null;
    transcriptToFirstAudioLatencyMs = null;
    heard = "";
    reply = "";
    groundingRequired = false;
    groundingScope = null;
    grounded = true;
    operationLabel = "Operator report ready";
    setPhase("thinking");
  };

  deps.brain.subscribeOperator?.((job) => {
    if (job.status === "cancelled") return;
    const report = job.status === "completed"
      ? `Operator job ${job.id} completed. Result: ${job.result || "No result text was returned."}`
      : `Operator job ${job.id} ${job.status}. Error: ${job.error?.code || "OPERATOR_FAILED"}: ${job.error?.message || "No error detail was returned."}`;
    backgroundReports.push(report.slice(0, 8_000));
    flushBackgroundReport();
  });

  // Playback owns the speaking → listening boundary so mic capture never restarts over queued audio.
  const playbackIdle = () => {
    if (phase === "speaking") {
      setPhase("listening");
      turnId = null;
      resetTurnTiming();
      emit();
      flushBackgroundReport();
    }
  };
  const playbackError = (event: Event) => {
    const message = (event as CustomEvent<{ message?: string }>).detail?.message || "E.V audio playback failed";
    recordEvEvent({
      level: "error",
      event: "playback.failed",
      status: "failed",
      traceId: turnId,
      turnId,
      errorCode: "AUDIO_PLAYBACK_FAILED",
      recovery: "Tap the orb once to re-enable audio output, then retry.",
      metadata: { message },
    });
    operationLabel = "Audio playback unavailable";
    if (!reply.trim()) reply = "E.V အသံပြန်ဖွင့်မရသေးပါ။ Orb ကို tap လုပ်ပြီး ပြန်စမ်းပါ။";
    if (phase === "speaking" || phase === "thinking") setPhase("listening");
    emit();
  };
  if (typeof window !== "undefined") window.addEventListener("beebot:ev-playback-idle", playbackIdle);
  if (typeof window !== "undefined") window.addEventListener("beebot:ev-playback-error", playbackError);

  const pushHistory = (intent: EngineIntent, status: VoiceActionStatus, result: string, idempotencyKey?: string) => {
    // Conversation/no-op fallbacks are turn outcomes, not user-visible actions.
    if (isNoopAction(intent.action) || result.trim().toLocaleLowerCase() === "no action") return;
    actionHistory = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        turnId: turnId || undefined,
        idempotencyKey,
        timestamp: new Date().toISOString(),
        intent: intent.action,
        skill: intent.skill || voiceSkillForIntent(intent.action),
        result,
        status,
      },
      ...actionHistory,
    ].slice(0, MAX_ACTION_HISTORY);
    saveVoiceActionHistory(actionHistory);
    emit();
  };

  const journalSafely = async <T,>(operation: (() => Promise<T>) | undefined, fallback: T): Promise<T> => {
    if (!operation) return fallback;
    try { return await operation(); }
    catch (error) {
      console.warn("[E.V] action journal operation failed", error);
      return fallback;
    }
  };

  const flushTranscriptJournal = () => {
    if (transcriptJournalTimer) clearTimeout(transcriptJournalTimer);
    transcriptJournalTimer = null;
    const pending = pendingTranscriptJournal;
    pendingTranscriptJournal = null;
    if (!pending || !deps.journal) return;
    void journalSafely(
      () => deps.journal!.update({ turnId: pending.turnId, status: "thinking", transcript: pending.transcript }),
      undefined,
    );
  };

  const scheduleTranscriptJournal = () => {
    if (!turnId || !deps.journal) return;
    pendingTranscriptJournal = { turnId, transcript: heard };
    if (transcriptJournalTimer) clearTimeout(transcriptJournalTimer);
    transcriptJournalTimer = setTimeout(flushTranscriptJournal, 300);
  };

  const commitTurnMemory = async (status: "final" | "failed" | "interrupted") => {
    const activeTurn = turnId;
    if (!deps.memory || !activeTurn || committedMemoryTurns.has(activeTurn) || (!heard.trim() && !reply.trim())) return;
    const sessionId = memorySessionId || await memorySessionPromise;
    if (!sessionId) return;
    committedMemoryTurns.add(activeTurn);
    try {
      await deps.memory.commitTurn({
        sessionId,
        turnId: activeTurn,
        user: heard,
        assistant: reply || undefined,
        status,
        metadata: { intent: intentName, skill, actionStatus, toolNames: [...toolNames], evidence },
      });
    } catch (error) {
      committedMemoryTurns.delete(activeTurn);
      console.warn("[E.V memory] turn commit deferred", error);
    }
  };

  const operationForTool = (name: string) => ({
    workspace_get_state: "Reading workspace state",
    workspace_list_open_files: "Scanning open files",
    workspace_read_active_file: "Reading active file",
    notes_read_file: "Reading note",
    notes_search_related: "Checking local sources",
    notes_summarize: "Summarizing captured note",
    notes_fact_check: "Verifying evidence",
    web_search: "Searching live web",
    memory_recall: "Recalling confirmed memory",
    terminal_run: "Running terminal command",
  }[name] || "Running E.V tool");

  const journalMetadata = (result?: EvToolResult<unknown>) => {
    const refs = result?.evidence || evidence;
    return {
      toolNames: [...toolNames],
      snapshotId: refs.find((item) => item.snapshotId)?.snapshotId,
      evidence: refs,
      ...(!result?.ok && result ? {
        errorCode: result.error.code,
        recovery: result.recovery,
      } : {}),
    };
  };

  const executeCustomTool = async (
    id: string | null,
    name: string,
    args: Record<string, unknown>,
    options: { approved?: boolean; preview?: EvToolPreview } = {},
  ) => {
    const needsTurn = !turnId;
    const activeTurn = turnId || createTurnId();
    const executionId = id || `${activeTurn}:${name}:${crypto.randomUUID()}`;
    const toolStartedAt = performance.now();
    turnId = activeTurn;
    if (needsTurn) {
      await journalSafely(
        deps.journal ? () => deps.journal!.begin({ turnId: activeTurn, status: "thinking", startedAt: new Date().toISOString() }) : undefined,
        undefined,
      );
    }
    toolNames.add(name);
    recordEvEvent({
      event: "tool.started",
      status: "running",
      traceId: activeTurn,
      turnId: activeTurn,
      actionId: id || name,
      metadata: {
        utteranceId,
        executionId,
        transcript_to_tool_ms: firstTranscriptAt > 0 ? Math.max(0, Math.round(toolStartedAt - firstTranscriptAt)) : null,
      },
    });
    operationLabel = operationForTool(name);
    actionStatus = "running";
    setPhase("running_skill");
    try {
      const result = await deps.brain.execTool!(
        name,
        args,
        {
          userTranscript: heard,
          approved: options.approved,
          preview: options.preview,
          idempotencyKey: `${activeTurn}:${name}:${String(args.command || "")}:${String(args.cwd || "")}`,
          executionId,
          interruptibility: "foreground",
          startedAt: toolStartedAt,
        },
      ) as EvToolResult<unknown>;
      evidence = result.evidence || [];
      grounded = result.ok ? evidence.length > 0 : true;
      actionStatus = result.ok ? "completed" : "failed";
      recordEvEvent({
        level: result.ok ? "info" : "error",
        event: result.ok ? "tool.completed" : "tool.failed",
        status: result.ok ? "completed" : "failed",
        traceId: activeTurn,
        turnId: activeTurn,
        actionId: id || name,
        errorCode: result.ok ? undefined : result.error.code,
        recovery: result.ok ? undefined : result.recovery,
        durationMs: Math.max(0, Math.round(performance.now() - toolStartedAt)),
        metadata: {
          utteranceId,
          executionId,
          tool_duration_ms: Math.max(0, Math.round(performance.now() - toolStartedAt)),
        },
      });
      operationLabel = result.ok
        ? operationLabel
        : result.error.code === "CONTENT_CHANGED" ? "Content changed" : "Unable to verify";
      await journalSafely(
        deps.journal ? () => deps.journal!.update({
          turnId: activeTurn,
          status: result.ok ? "thinking" : "failed",
          transcript: heard,
          result: result.ok ? `${name} completed with ${evidence.length} evidence item(s)` : undefined,
          error: result.ok ? undefined : result.error.message,
          metadata: journalMetadata(result),
        }) : undefined,
        undefined,
      );
      if (id) liveClient?.sendToolResponse(id, name, result);
      if (!result.ok && result.error.code === "PERMISSION_DENIED") {
        rejectedToolCalls.set(`${activeTurn}:${name}`, result);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      actionStatus = "failed";
      recordEvEvent({ level: "error", event: "tool.failed", status: "failed", traceId: activeTurn, turnId: activeTurn, actionId: id || name, errorCode: "TOOL_EXECUTION_FAILED", recovery: "Review the tool request and retry." });
      operationLabel = "Unable to verify";
      if (id) liveClient?.sendToolResponse(id, name, {
        ok: false,
        evidence: [],
        error: { code: "TERMINAL_FAILED", message },
        recovery: "Review the command and retry.",
      });
      await journalSafely(
        deps.journal ? () => deps.journal!.update({ turnId: activeTurn, status: "failed", transcript: heard, error: message }) : undefined,
        undefined,
      );
    }
    if (turnId === activeTurn) setPhase("thinking");
  };

  const executeBackgroundTool = (
    id: string,
    name: string,
    args: Record<string, unknown>,
  ) => {
    const activeTurn = turnId || createTurnId();
    const executionId = id || `${activeTurn}:${name}:${crypto.randomUUID()}`;
    const toolStartedAt = performance.now();
    turnId = activeTurn;
    toolNames.add(name);
    backgroundExecutions.add(executionId);
    actionStatus = "running";
    operationLabel = operationForTool(name);
    liveClient?.sendToolResponse(id, name, {
      ok: true,
      data: { status: "accepted", executionId, message: "Search is running in the background. Acknowledge briefly and keep listening." },
      evidence: [],
    });
    setPhase("thinking");
    void deps.brain.execTool!(name, args, {
      userTranscript: heard,
      idempotencyKey: `${activeTurn}:${name}:${String(args.query || "")}`,
      executionId,
      interruptibility: "background",
      startedAt: toolStartedAt,
    }).then((raw) => {
      const result = raw as EvToolResult<unknown>;
      const durationMs = Math.max(0, Math.round(performance.now() - toolStartedAt));
      backgroundExecutions.delete(executionId);
      if (turnId === activeTurn) actionStatus = result.ok ? "completed" : "failed";
      recordEvEvent({
        level: result.ok ? "info" : "error",
        event: result.ok ? "background_tool.completed" : "background_tool.failed",
        status: result.ok ? "completed" : "failed",
        traceId: activeTurn,
        turnId: activeTurn,
        actionId: executionId,
        durationMs,
        errorCode: result.ok ? undefined : result.error.code,
        recovery: result.ok ? undefined : result.recovery,
        metadata: { utteranceId, executionId, evidenceCount: result.evidence.length },
      });
      const report = result.ok
        ? `Background ${name} completed in ${durationMs}ms. Evidence: ${JSON.stringify(result.evidence)} Result: ${JSON.stringify(result.data)}`
        : `Background ${name} failed. ${result.error.code}: ${result.error.message}. Recovery: ${result.recovery}`;
      backgroundReports.push(report.slice(0, 8_000));
      if (result.ok) evidence = result.evidence;
      if (!result.ok && result.error.code === "PERMISSION_DENIED") rejectedToolCalls.set(`${activeTurn}:${name}`, result);
      if (turnId !== activeTurn || phase === "listening") flushBackgroundReport();
    }).catch((error) => {
      backgroundExecutions.delete(executionId);
      if (turnId === activeTurn) actionStatus = "failed";
      const message = error instanceof Error ? error.message : String(error);
      backgroundReports.push(`Background ${name} failed. TOOL_EXECUTION_FAILED: ${message}`);
      recordEvEvent({ level: "error", event: "background_tool.failed", status: "failed", traceId: activeTurn, turnId: activeTurn, actionId: executionId, errorCode: "TOOL_EXECUTION_FAILED", recovery: "Retry the search after checking the provider connection." });
      if (turnId !== activeTurn || phase === "listening") flushBackgroundReport();
    });
  };

  const executeTool = async (id: string | null, name: string, intent: EngineIntent) => {
    const needsTurn = !turnId;
    const activeTurn = turnId || createTurnId();
    turnId = activeTurn;
    if (needsTurn) {
      await journalSafely(
        deps.journal ? () => deps.journal!.begin({ turnId: activeTurn, status: "thinking", startedAt: new Date().toISOString() }) : undefined,
        undefined,
      );
    }
    intentName = intent.action;
    skill = intent.skill || voiceSkillForIntent(intent.action);
    mode = intent.mode || voiceModeForIntent(intent.action);
    confidence = intent.confidence ?? 1;
    const fingerprint = actionFingerprint(intent);
    const idempotencyKey = actionIdempotencyKey(fingerprint);
    recordEvEvent({ event: "action.started", status: "running", traceId: activeTurn, turnId: activeTurn, actionId: idempotencyKey });
    setPhase("running_skill");
    actionStatus = "running";
    emit();

    const replay = recentActionReplays.get(fingerprint);
    if (replay && Date.now() - replay.at <= ACTION_REPLAY_CACHE_MS) {
      actionStatus = "completed";
      reply = MSG_DUPLICATE_ACTION;
      await journalSafely(
        deps.journal ? () => deps.journal!.update({
          turnId: activeTurn,
          status: "completed",
          intent: intent.action,
          skill,
          result: replay.result,
          reply,
        }) : undefined,
        undefined,
      );
      if (id) liveClient?.sendToolResponse(id, name, {
        ok: true,
        status: "completed",
        action: intent.action,
        result: replay.result,
        reply,
        duplicate: true,
      });
      recordEvEvent({ event: "action.deduplicated", status: "completed", traceId: activeTurn, turnId: activeTurn, actionId: idempotencyKey });
      setPhase("thinking");
      return;
    }

    if (intent.action === "explain_last_failure") {
      const records = await journalSafely(
        deps.journal?.listRecent ? () => deps.journal!.listRecent!(50) : undefined,
        [] as VoiceTurnRecord[],
      );
      const explanation = failureExplanation(latestActionFailure(records));
      actionStatus = "completed";
      recordEvEvent({ event: "action.completed", status: "completed", traceId: activeTurn, turnId: activeTurn, actionId: idempotencyKey });
      reply = explanation.reply;
      pushHistory(intent, "completed", explanation.result, idempotencyKey);
      await journalSafely(
        deps.journal ? () => deps.journal!.update({ turnId: activeTurn, status: "completed", intent: intent.action, skill, result: explanation.result, reply: explanation.reply }) : undefined,
        undefined,
      );
      if (id) liveClient?.sendToolResponse(id, name, { ok: true, status: "completed", action: intent.action, ...explanation });
      setPhase("thinking");
      return;
    }

    const claimed = await journalSafely(
      deps.journal ? () => deps.journal!.claimAction({ turnId: activeTurn, idempotencyKey, intent: intent.action, skill }) : undefined,
      { claimed: true },
    );
    if (!claimed.claimed) {
      const resultText = claimed.result || claimed.reply || MSG_DONE;
      if (id) liveClient?.sendToolResponse(id, name, {
        ok: true,
        status: "completed",
        action: intent.action,
        result: resultText,
        duplicate: true,
      });
      setPhase("thinking");
      recordEvEvent({ event: "action.deduplicated", status: "completed", traceId: activeTurn, turnId: activeTurn, actionId: idempotencyKey });
      return;
    }

    let result: VoiceActionResult;
    try {
      const executableIntent: EngineIntent = {
        ...intent,
        payload: { ...(intent.payload || {}), turnId: activeTurn, idempotencyKey },
      };
      result = (await deps.brain.execAction(intent.action, intent.title, executableIntent)) || {};
    } catch (error) {
      const diagnostic = diagnoseActionError(error, { action: intent.action, skill, turnId: activeTurn });
      actionStatus = "failed";
      recordEvEvent({ level: "error", event: "action.failed", status: "failed", traceId: activeTurn, turnId: activeTurn, actionId: idempotencyKey, errorCode: diagnostic.code, recovery: diagnostic.recovery });
      reply = `Action failed: ${diagnostic.message}`;
      pushHistory(intent, "failed", `${diagnostic.code}: ${diagnostic.message}`, idempotencyKey);
      await journalSafely(
        deps.journal ? () => deps.journal!.update({ turnId: activeTurn, status: "failed", intent: intent.action, skill, error: diagnostic.message, reply }) : undefined,
        undefined,
      );
      if (id) liveClient?.sendToolResponse(id, name, {
        ok: false,
        status: "failed",
        action: intent.action,
        error: diagnostic,
      });
      setPhase("thinking");
      return;
    }

    const resultText = result.result || MSG_DONE;
    const actionReply = result.reply || intent.reply || resultText;
    actionStatus = "completed";
    recordEvEvent({ event: "action.completed", status: "completed", traceId: activeTurn, turnId: activeTurn, actionId: idempotencyKey });
    reply = actionReply;
    pushHistory(intent, "completed", resultText, idempotencyKey);
    recentActionReplays.set(fingerprint, { at: Date.now(), result: resultText });
    await journalSafely(
      deps.journal ? () => deps.journal!.update({ turnId: activeTurn, status: "completed", intent: intent.action, skill, result: resultText, reply: actionReply }) : undefined,
      undefined,
    );
    if (id) liveClient?.sendToolResponse(id, name, {
      ok: true,
      status: "completed",
      action: intent.action,
      result: resultText,
      reply: actionReply,
    });
    setPhase("thinking");
  };

  const resolvePendingConfirmation = async (ok: boolean) => {
    const pending = pendingTool;
    pendingTool = null;
    if (!pending) return;
    if (!ok) {
      actionStatus = "cancelled";
      pushHistory(pending.intent, "cancelled", MSG_CANCELLED);
      if (pending.id) liveClient?.sendToolResponse(pending.id, pending.name, { cancelled: true, result: MSG_CANCELLED });
      if (turnId) {
        await journalSafely(
          deps.journal ? () => deps.journal!.update({ turnId: turnId!, status: "cancelled", intent: pending.intent.action, skill }) : undefined,
          undefined,
        );
      }
      setPhase("listening");
      return;
    }
    if (pending.kind === "custom") {
      await executeCustomTool(pending.id, pending.name, pending.args, { approved: true, preview: pending.preview });
      return;
    }
    await executeTool(pending.id, pending.name, pending.intent);
  };

  const beginTranscriptTurn = () => {
    if (turnId) return;
    const hadLocalSpeechStart = Boolean(utteranceId && speechStartedAt > 0 && inputActivity !== "idle");
    turnId = createTurnId();
    const now = performance.now();
    if (!hadLocalSpeechStart) {
      utteranceId = `utt-${crypto.randomUUID()}`;
      speechStartedAt = now;
    }
    firstTranscriptAt = 0;
    turnStartedAt = speechStartedAt;
    firstAudioLatencyMs = null;
    firstTranscriptLatencyMs = null;
    transcriptToFirstAudioLatencyMs = null;
    heard = "";
    reply = "";
    heardVoice = false;
    intentName = "none";
    preparedIntent = null;
    actionStatus = "idle";
    operationLabel = null;
    evidence = [];
    toolNames.clear();
    groundingRequired = false;
    groundingScope = null;
    grounded = false;
    blockedUngroundedOutput = false;
    turnReceivedAudio = false;
    silentRetryUsed = false;
    rejectedToolCalls.clear();
    void journalSafely(
      deps.journal ? () => deps.journal!.begin({ turnId: turnId!, status: "recording", startedAt: new Date().toISOString() }) : undefined,
      undefined,
    );
  };

  const handleInputTranscript = (text: string, final = false) => {
    if (!text.trim()) return;
    const translationCommand = parseEvLiveTranslationCommand(text, liveTranslation.active);
    if (translationCommand) {
      void switchLiveTranslation(translationCommand);
      return;
    }
    if (liveTranslation.active) {
      heard = mergeTranscript(heard, text);
      heardVoice = true;
      if (final) inputActivity = "settling";
      emit();
      return;
    }
    if (phase === "confirm" && pendingTool) {
      const decision = spokenConfirmation(text);
      if (decision !== null) {
        void resolvePendingConfirmation(decision);
        return;
      }
    }
    beginTranscriptTurn();
    const now = performance.now();
    if (firstTranscriptAt <= 0) {
      firstTranscriptAt = now;
      firstTranscriptLatencyMs = Math.max(0, now - turnStartedAt);
      recordEvEvent({
        event: "input.first_transcript",
        status: "running",
        traceId: turnId,
        turnId,
        durationMs: Math.round(firstTranscriptLatencyMs),
        metadata: {
          utteranceId,
          speech_to_first_transcript_ms: Math.round(firstTranscriptLatencyMs),
          speech_end_to_first_transcript_ms: speechSettledAt > 0
            ? Math.max(0, Math.round(firstTranscriptAt - speechSettledAt))
            : null,
        },
      });
      scheduleSilentWatchdog(turnId!);
    }
    heard = mergeTranscript(heard, text);
    heardVoice = true;
    const parsedForReasoning = parseVoiceCommandText(heard);
    preparedIntent = parsedForReasoning.action !== "none" ? parsedForReasoning.action : null;
    const reasoning = reasoningPolicyForTurn(heard, {
      action: parsedForReasoning.action,
      requiresConfirmation: parsedForReasoning.requiresConfirmation,
      liveForeground: true,
    });
    reasoningLevel = reasoning.level;
    reasoningRoute = reasoning.route;
    reasoningScore = reasoning.score;
    const workspaceRequired = workspaceEvidenceRequired(heard);
    const webRequired = !workspaceRequired && webSearchPolicy(heard).allowed;
    groundingRequired = groundingRequired || workspaceRequired || webRequired;
    groundingScope = groundingScope || (workspaceRequired ? "workspace" : webRequired ? "web" : null);
    if (groundingRequired && !grounded) operationLabel = groundingScope === "web" ? "Checking current sources" : "Checking workspace truth";
    if (final) inputActivity = "settling";
    if (phase === "listening" || phase === "recording") setPhase("thinking");
    scheduleTranscriptJournal();
    if (final) flushTranscriptJournal();
    emit();
  };

  const connectLive = async () => {
    if (!deps.hasKey()) {
      deps.notify?.("No API Key", "Please set your Gemini API key in Settings.");
      return;
    }
    setPhase("connecting");

    const callbacks: EvLiveProtocolCallbacks = {
      onAudio: (pcm, rate) => {
        if (!liveTranslation.active && groundingRequired && !grounded && backgroundExecutions.size === 0 && operationLabel !== "Searching live web") {
          blockedUngroundedOutput = true;
          return;
        }
        if (firstAudioLatencyMs === null && turnStartedAt > 0) {
          const now = performance.now();
          firstAudioLatencyMs = now - turnStartedAt;
          transcriptToFirstAudioLatencyMs = firstTranscriptAt > 0 ? now - firstTranscriptAt : null;
          recordEvEvent({
            event: "output.first_audio",
            status: "running",
            traceId: turnId,
            turnId,
            durationMs: Math.round(firstAudioLatencyMs),
            metadata: {
              utteranceId,
              speech_to_first_transcript_ms: firstTranscriptLatencyMs === null ? null : Math.round(firstTranscriptLatencyMs),
              transcript_to_first_audio_ms: transcriptToFirstAudioLatencyMs === null ? null : Math.round(transcriptToFirstAudioLatencyMs),
            },
          });
        }
        inputActivity = "idle";
        speechActivity.reset();
        turnReceivedAudio = true;
        clearSilentWatchdog();
        // The model may speak its confirmation question after issuing the tool call.
        // Keep the approval dialog authoritative until the user approves or denies it.
        if (phase !== "confirm" && phase !== "speaking") setPhase("speaking");
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("beebot:ev-live-audio", { detail: { pcm, rate } }));
      },
      onInputTranscript: (text) => handleInputTranscript(text),
      onOutputTranscript: (text) => {
        if (!liveTranslation.active && groundingRequired && !grounded && backgroundExecutions.size === 0 && operationLabel !== "Searching live web") {
          blockedUngroundedOutput = true;
          return;
        }
        reply = mergeTranscript(reply, text);
        emit();
      },
      onToolCall: async (id, name, args) => {
        if (liveTranslation.active) {
          liveClient?.sendToolResponse(id, name, {
            ok: false,
            error: { code: "UNSUPPORTED_OPERATION", message: "Tools are unavailable in isolated Live Translate mode." },
          });
          return;
        }
        if (name !== "execute_action") {
          if (!deps.brain.execTool || !deps.brain.toolDeclarations?.some((tool) => tool.name === name)) {
            liveClient?.sendToolResponse(id, name, {
              ok: false,
              status: "failed",
              error: { code: "UNKNOWN_TOOL", message: `Unknown E.V tool: ${name}`, retryable: false },
            });
            return;
          }
          const toolArgs = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
          const rejected = turnId ? rejectedToolCalls.get(`${turnId}:${name}`) : undefined;
          if (rejected) {
            liveClient?.sendToolResponse(id, name, rejected);
            return;
          }
          const preview = await deps.brain.previewTool?.(name, toolArgs, { userTranscript: heard });
          if (preview && !preview.ok) {
            actionStatus = "failed";
            operationLabel = "Unable to verify";
            grounded = true;
            liveClient?.sendToolResponse(id, name, { ok: false, evidence: [], error: preview.error, recovery: preview.recovery });
            emit();
            return;
          }
          if (preview?.ok && preview.requiresConfirmation) {
            const intent: EngineIntent = {
              action: preview.intent,
              reply: preview.prompt,
              skill: preview.skill,
              mode: preview.mode,
              confidence: 1,
              requiresConfirmation: true,
              payload: toolArgs,
              transcript: heard,
            };
            pendingTool = { kind: "custom", id, name, args: toolArgs, intent, preview };
            intentName = preview.intent;
            skill = preview.skill;
            mode = preview.mode;
            confidence = 1;
            actionStatus = "confirming";
            reply = preview.prompt;
            setPhase("confirm");
            if (turnId) {
              void journalSafely(
                deps.journal ? () => deps.journal!.update({ turnId: turnId!, status: "confirming", intent: preview.intent, skill, reply }) : undefined,
                undefined,
              );
            }
            return;
          }
          if (name === "web_search") {
            executeBackgroundTool(id, name, toolArgs);
            return;
          }
          await executeCustomTool(id, name, toolArgs, { approved: false, preview: preview || undefined });
          return;
        }
        const intent = hydrateConversationWriteIntent(args as EngineIntent, heard, conversationArtifacts);
        if (!intent?.action) {
          liveClient?.sendToolResponse(id, name, {
            ok: false,
            status: "failed",
            error: { code: "INVALID_INPUT", message: "The action name is missing.", retryable: false },
          });
          return;
        }
        if (isNoopAction(intent.action)) {
          actionStatus = "idle";
          operationLabel = null;
          reply = intent.reply || "ဟုတ်ကဲ့။";
          if (id) liveClient?.sendToolResponse(id, name, {
            ok: true,
            status: "completed",
            action: "none",
            result: "No action required",
            reply,
          });
          setPhase("thinking");
          emit();
          return;
        }
        intentName = intent.action;
        skill = intent.skill || voiceSkillForIntent(intent.action);
        mode = intent.mode || voiceModeForIntent(intent.action);
        confidence = intent.confidence ?? 1;
        const replay = recentActionReplays.get(actionFingerprint(intent));
        if (replay && Date.now() - replay.at <= ACTION_REPLAY_CACHE_MS) {
          actionStatus = "completed";
          reply = MSG_DUPLICATE_ACTION;
          if (id) liveClient?.sendToolResponse(id, name, {
            ok: true,
            status: "completed",
            action: intent.action,
            result: replay.result,
            reply,
            duplicate: true,
          });
          recordEvEvent({ event: "action.deduplicated", status: "completed", traceId: turnId || undefined, turnId: turnId || undefined, actionId: actionIdempotencyKey(actionFingerprint(intent)) });
          setPhase("thinking");
          emit();
          return;
        }
        emit();
        if (voiceIntentNeedsConfirmation(intent.action) || intent.requiresConfirmation) {
          pendingTool = { kind: "action", id, name, intent };
          actionStatus = "confirming";
          reply = intent.reply || `Confirm ${intent.action}?`;
          setPhase("confirm");
          if (turnId) {
            void journalSafely(
              deps.journal ? () => deps.journal!.update({ turnId: turnId!, status: "confirming", intent: intent.action, skill, reply }) : undefined,
              undefined,
            );
          }
          return;
        }
        await executeTool(id, name, intent);
      },
      onToolCancellation: (ids) => {
        for (const id of ids) void deps.brain.cancelExecution?.(id);
        if (pendingTool && ids.includes(pendingTool.id)) {
          pendingTool = null;
          actionStatus = "cancelled";
          emit();
        }
      },
      onGenerationComplete: () => {
        if (liveTranslation.active) return;
        flushTranscriptJournal();
        // Gemini can occasionally speak a confirmation without issuing its function call.
        // Recover deterministically from the final transcript so writes always surface the
        // native approval UI and read-only navigation never falsely claims completion.
        if (!pendingTool && actionStatus === "idle" && heard.trim()) {
          const parsed = parseVoiceCommandText(heard);
          if (parsed.action !== "none") {
            const intent = hydrateConversationWriteIntent(parsed as EngineIntent, heard, conversationArtifacts);
            intentName = intent.action;
            skill = intent.skill || voiceSkillForIntent(intent.action);
            mode = intent.mode || voiceModeForIntent(intent.action);
            confidence = intent.confidence ?? 1;
            if (voiceIntentNeedsConfirmation(intent.action) || intent.requiresConfirmation) {
              pendingTool = { kind: "action", id: null, name: "execute_action", intent };
              actionStatus = "confirming";
              reply = intent.reply || `Confirm ${intent.action}?`;
              setPhase("confirm");
              if (turnId) {
                void journalSafely(
                  deps.journal ? () => deps.journal!.update({ turnId: turnId!, status: "confirming", intent: intent.action, skill, reply }) : undefined,
                  undefined,
                );
              }
              return;
            }
            void executeTool(null, "execute_action", intent);
            return;
          }
        }
        if (groundingRequired && !grounded && backgroundExecutions.size === 0) {
          const message = groundingScope === "web"
            ? "Current source evidence မရသေးလို့ တိကျတဲ့အဖြေ မထုတ်နိုင်ပါ။ Web search connection ကိုစစ်ပြီး ပြန်စမ်းပါ။"
            : blockedUngroundedOutput
              ? "Workspace evidence မရသေးလို့ တိကျတဲ့အဖြေ မထုတ်နိုင်ပါ။ Notes workspace ကိုဖွင့်ပြီး ပြန်စမ်းပါ။"
              : "Workspace အချက်အလက်ကို အတည်မပြုနိုင်သေးပါ။";
          reply = message;
          operationLabel = "Unable to verify";
          actionStatus = "failed";
          if (turnId) {
            void journalSafely(
              deps.journal ? () => deps.journal!.update({
                turnId: turnId!,
                status: "failed",
                transcript: heard,
                reply,
                error: `${groundingScope || "workspace"} claim blocked because no tool evidence was produced`,
                metadata: journalMetadata({
                  ok: false,
                  evidence: [],
                  error: {
                    code: groundingScope === "web" ? "SEARCH_UNAVAILABLE" : "NO_WORKSPACE_CONTEXT",
                    message: "No tool evidence was produced.",
                  },
                  recovery: groundingScope === "web" ? "Check the web-search connection and retry." : "Open the Notes workspace and retry.",
                }),
              }) : undefined,
              undefined,
            );
          }
          emit();
          return;
        }
        if (turnId && actionStatus !== "failed" && actionStatus !== "cancelled") {
          rememberConversationArtifact();
          void journalSafely(
            deps.journal ? () => deps.journal!.update({
              turnId: turnId!,
              status: "completed",
              transcript: heard,
              reply,
              metadata: toolNames.size ? journalMetadata() : undefined,
            }) : undefined,
            undefined,
          );
          if (!pendingTool) void commitTurnMemory("final");
        }
      },
      onTurnComplete: () => {
        if (liveTranslation.active) {
          inputActivity = "idle";
          speechActivity.reset();
          setPhase("listening");
          emit();
          return;
        }
        flushTranscriptJournal();
        // Some Live profiles omit generationComplete or deliver the final
        // transcript beside turnComplete. Capture here as an idempotent backup.
        rememberConversationArtifact();
        const parsed = heard.trim() ? parseVoiceCommandText(heard) : null;
        const canRetrySilentConversation = Boolean(
          turnId
          && heard.trim()
          && !turnReceivedAudio
          && !reply.trim()
          && !silentRetryUsed
          && !pendingTool
          && actionStatus === "idle"
          && (!parsed || parsed.action === "none")
          && !groundingRequired,
        );
        if (canRetrySilentConversation) {
          silentRetryUsed = true;
          recordEvEvent({
            level: "warn",
            event: "live.silent_turn",
            status: "retrying",
            traceId: turnId,
            turnId,
            errorCode: "NO_OUTPUT_AUDIO",
            recovery: "Requested one bounded spoken retry in the existing Live session.",
          });
          setPhase("thinking");
          liveClient?.requestSpokenReply();
          return;
        }
        if (turnId && heard.trim() && !turnReceivedAudio && phase !== "confirm" && phase !== "running_skill") {
          recordEvEvent({
            level: "error",
            event: "live.silent_turn",
            status: "failed",
            traceId: turnId,
            turnId,
            errorCode: "NO_OUTPUT_AUDIO",
            recovery: "The bounded retry also returned no audio; keep listening and surface the failure.",
          });
          operationLabel = "No spoken response received";
          if (!reply.trim()) reply = "E.V က ဒီ turn မှာ အသံပြန်မပေးနိုင်ခဲ့ပါ။ ထပ်ပြောကြည့်ပါ။";
        }
        if (phase !== "speaking" && phase !== "confirm" && phase !== "running_skill") {
          setPhase("listening");
          turnId = null;
          resetTurnTiming();
          inputActivity = "idle";
          speechActivity.reset();
          emit();
          flushBackgroundReport();
        }
      },
      onInterrupted: () => {
        deps.speech.stop();
        if (liveTranslation.active) {
          // In translation mode interruption is ordinary duplex speech, not an
          // instruction to cancel an E.V action or persist an agent turn.
          const activeSpeech = inputActivity === "speech";
          const activeSpeechStartedAt = activeSpeech ? speechStartedAt : 0;
          const activeUtteranceId = activeSpeech ? utteranceId : null;
          turnId = null;
          resetTurnTiming();
          if (activeSpeech) {
            speechStartedAt = activeSpeechStartedAt;
            utteranceId = activeUtteranceId;
            inputActivity = "speech";
          } else {
            inputActivity = "idle";
          }
          speechActivity.reset();
          setPhase("listening");
          emit();
          return;
        }
        // Barge-in during approval is often the user saying yes/no. Preserve the
        // pending action and dialog; onInputTranscript resolves the spoken decision.
        if (phase === "confirm" && pendingTool) return;
        void deps.brain.cancelForegroundAction?.();
        const interruptedTurn = turnId;
        if (interruptedTurn) {
          void commitTurnMemory("interrupted");
          void journalSafely(
            deps.journal ? () => deps.journal!.update({
              turnId: interruptedTurn,
              status: "interrupted",
              transcript: heard,
              reply,
              error: "user interrupted E.V while speaking",
              metadata: toolNames.size ? journalMetadata() : undefined,
            }) : undefined,
            undefined,
          );
        }
        const activeBargeIn = inputActivity === "speech";
        const bargeInStartedAt = activeBargeIn ? speechStartedAt : 0;
        const bargeInUtteranceId = activeBargeIn ? utteranceId : null;
        turnId = null;
        resetTurnTiming();
        if (activeBargeIn) {
          speechStartedAt = bargeInStartedAt;
          utteranceId = bargeInUtteranceId;
          inputActivity = "speech";
        } else {
          inputActivity = "idle";
        }
        speechActivity.reset();
        setPhase("listening");
        emit();
      },
      onConnected: () => {
        const preservedPhase = phase === "resuming" ? phaseBeforeReconnect : phase;
        const restoredPhase = pendingTool
          ? "confirm"
          : actionStatus === "running"
            ? "running_skill"
            : turnId && (actionStatus === "completed" || actionStatus === "failed")
              ? "thinking"
              : preservedPhase && !["idle", "connecting", "resuming"].includes(preservedPhase)
                ? preservedPhase
                : "listening";
        phaseBeforeReconnect = null;
        if (operationLabel === "Restoring live session") operationLabel = operationBeforeReconnect;
        operationBeforeReconnect = null;
        recordEvEvent({ event: "live.connected", status: "completed", traceId: turnId, turnId });
        setPhase(restoredPhase);
        flushBackgroundReport();
      },
      onReconnecting: () => {
        if (phase !== "resuming") {
          phaseBeforeReconnect = phase;
          operationBeforeReconnect = operationLabel;
        }
        operationLabel = "Restoring live session";
        // A reconnect starts a new latency measurement window. The utterance can
        // resume through the transport buffer, but stale pre-disconnect timers
        // must never leak into first-transcript metrics.
        speechStartedAt = performance.now();
        turnStartedAt = speechStartedAt;
        firstTranscriptAt = 0;
        firstAudioLatencyMs = null;
        firstTranscriptLatencyMs = null;
        transcriptToFirstAudioLatencyMs = null;
        recordEvEvent({ event: "live.reconnecting", status: "retrying", traceId: turnId, turnId, metadata: { utteranceId } });
        setPhase("resuming");
      },
      onReconnectOutcome: (outcome) => {
        recordEvEvent({
          level: outcome.resumed ? "info" : "warn",
          event: "live.reconnect_outcome",
          status: outcome.resumed ? "completed" : "failed",
          traceId: turnId,
          turnId,
          durationMs: outcome.downtimeMs,
          errorCode: outcome.resumed ? undefined : "AUDIO_REPLAY_UNAVAILABLE",
          recovery: outcome.resumed ? undefined : "Connection restored; repeat the last utterance because buffered audio could not be resumed safely.",
          metadata: {
            utteranceId,
            reconnect_downtime_ms: outcome.downtimeMs,
            buffered_audio_ms: outcome.bufferedAudioMs,
            dropped_audio_ms: outcome.droppedAudioMs,
            reason: outcome.reason,
          },
        });
        if (!outcome.resumed && outcome.droppedAudioMs > 0) {
          liveClient?.interrupt();
          turnId = null;
          resetTurnTiming();
          inputActivity = "idle";
          operationLabel = "Connection restored — please repeat";
          setPhase("listening");
          emit();
        }
      },
      onError: (err) => {
        recordEvEvent({ level: "error", event: "live.error", status: "failed", traceId: turnId, turnId, errorCode: "LIVE_CONNECTION_FAILED", recovery: "Check the Live connection status and retry.", metadata: { source: "gemini_live" } });
        if (turnId) {
          void commitTurnMemory("failed");
          void journalSafely(
            deps.journal ? () => deps.journal!.update({ turnId: turnId!, status: "failed", transcript: heard, reply, error: err }) : undefined,
            undefined,
          );
        }
        deps.notify?.("E.V Live connection", err);
        stopLive("interrupted");
      },
    };
    liveClient = deps.liveClientFactory(callbacks);
    switchLiveTranslation = async (command) => {
      if (!liveClient) return;
      const previous = liveTranslation;
      heard = "";
      reply = "";
      inputActivity = "idle";
      speechActivity.reset();
      resetTurnTiming();
      turnId = null;
      utteranceId = null;
      liveTranslation = command.kind === "start"
        ? {
            active: true,
            ...command.config,
            targetLanguageName: command.targetLanguageName,
          }
        : {
            active: false,
            targetLanguageCode: "",
            targetLanguageName: "",
            echoTargetLanguage: false,
          };
      operationLabel = command.kind === "start"
        ? `Connecting Live Translate · ${command.targetLanguageName}`
        : "Returning to E.V";
      setPhase("connecting");
      recordEvEvent({
        event: command.kind === "start" ? "translation.started" : "translation.stopped",
        status: "started",
        metadata: command.kind === "start" ? { targetLanguageCode: command.config.targetLanguageCode } : undefined,
      });
      try {
        if (command.kind === "start") await liveClient.connectTranslation(command.config);
        else {
          const session = deps.liveSession();
          reasoningLevel = session.reasoningLevel;
          await liveClient.connect(session.model, SYSTEM, SCHEMA, deps.brain.toolDeclarations || []);
        }
        operationLabel = command.kind === "start" ? `Live translate · ${command.targetLanguageName}` : null;
        recordEvEvent({
          event: command.kind === "start" ? "translation.connected" : "translation.disconnected",
          status: "completed",
          metadata: command.kind === "start" ? { targetLanguageCode: command.config.targetLanguageCode } : undefined,
        });
        setPhase("listening");
      } catch (error) {
        liveTranslation = previous;
        const message = error instanceof Error ? error.message : String(error);
        operationLabel = "Restoring previous E.V protocol";
        recordEvEvent({
          level: "error",
          event: "translation.failed",
          status: "failed",
          errorCode: "LIVE_TRANSLATION_FAILED",
          recovery: "Check Gemini 3.5 Live Translate model access and retry.",
        });
        deps.notify?.("E.V Live Translate could not connect", message);
        try {
          if (previous.active) {
            await liveClient.connectTranslation({
              targetLanguageCode: previous.targetLanguageCode,
              echoTargetLanguage: previous.echoTargetLanguage,
            });
            operationLabel = `Live translate · ${previous.targetLanguageName}`;
          } else {
            const session = deps.liveSession();
            reasoningLevel = session.reasoningLevel;
            await liveClient.connect(session.model, SYSTEM, SCHEMA, deps.brain.toolDeclarations || []);
            operationLabel = null;
          }
          recordEvEvent({
            event: "translation.protocol_restored",
            status: "completed",
            metadata: { protocol: previous.active ? "live_translate" : "ev_agent" },
          });
          setPhase("listening");
        } catch (restoreError) {
          const restoreMessage = restoreError instanceof Error ? restoreError.message : String(restoreError);
          recordEvEvent({
            level: "error",
            event: "translation.protocol_restore_failed",
            status: "failed",
            errorCode: "LIVE_PROTOCOL_RESTORE_FAILED",
            recovery: "Close and reopen E.V, then retry.",
          });
          deps.notify?.("E.V protocol could not be restored", restoreMessage);
          stopLive("interrupted");
        }
      }
    };

    try {
      if (deps.memory && !memorySessionPromise) {
        const sessionPromise = deps.memory.startSession()
          .then(({ sessionId }) => sessionId)
          .catch((error) => {
            console.warn("[E.V memory] session unavailable; voice will continue without persistence", error);
            return null;
          });
        memorySessionPromise = sessionPromise;
        void sessionPromise.then((sessionId) => {
          if (memorySessionPromise === sessionPromise) memorySessionId = sessionId;
        });
      }
      const liveSession = deps.liveSession();
      reasoningLevel = liveSession.reasoningLevel;
      const connecting = liveClient.connect(liveSession.model, SYSTEM, SCHEMA, deps.brain.toolDeclarations || []);
      // Capture on the same user gesture instead of waiting for auth + WebSocket setup.
      deps.capture.begin((chunk) => {
        const sampleRate = deps.capture.sampleRate();
        const activity = speechActivity.push(chunk, sampleRate);
        if (activity.started) {
          if (phase === "speaking" || !utteranceId || speechStartedAt <= 0) {
            utteranceId = `utt-${crypto.randomUUID()}`;
            speechStartedAt = performance.now();
            firstTranscriptAt = 0;
          }
          inputActivity = "speech";
          if (phase === "listening" || phase === "connecting") setPhase("recording");
          else emit();
          recordEvEvent({ event: "input.speech_started", status: "running", traceId: turnId, turnId, durationMs: 0, metadata: { utteranceId, speech_indicator_ms: 0 } });
        } else if (activity.settled) {
          inputActivity = "settling";
          speechSettledAt = performance.now();
          // Local energy only drives visual feedback. Gemini's VAD/transcript is
          // authoritative for the actual recording -> thinking transition.
          emit();
          recordEvEvent({
            event: "input.speech_settled",
            status: "running",
            traceId: turnId,
            turnId,
            durationMs: speechStartedAt > 0 ? Math.round(performance.now() - speechStartedAt) : undefined,
            metadata: { utteranceId },
          });
        }
        // Full duplex is required for Gemini's server-side VAD to detect a real user barge-in.
        // Browser AEC removes E.V's speaker output; Gemini interrupts on new user activity.
        liveClient?.sendAudio(chunk, sampleRate);
      });
      capturing = true;
      await connecting;
      if (["connecting", "resuming"].includes(phase)) setPhase("listening");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordEvEvent({ level: "error", event: "live.connect_failed", status: "failed", traceId: turnId, turnId, errorCode: "LIVE_CONNECT_FAILED", recovery: "Check the API key, model access, and network before retrying." });
      deps.notify?.("E.V could not connect", message);
      if (capturing) {
        deps.capture.end();
        capturing = false;
      }
      liveClient?.disconnect();
      liveClient = null;
      const failedSession = memorySessionId;
      const failedSessionPromise = memorySessionPromise;
      memorySessionId = null;
      memorySessionPromise = null;
      if (failedSession || failedSessionPromise) void Promise.resolve(failedSession || failedSessionPromise)
        .then((sessionId) => sessionId ? deps.memory?.endSession(sessionId, "interrupted") : undefined)
        .catch((memoryError) => console.warn("[E.V memory] failed session close deferred", memoryError));
      setPhase("idle");
    }
  };

  const stopLive = (sessionStatus: "completed" | "interrupted" = "completed") => {
    if (!liveTranslation.active) flushTranscriptJournal();
    let pendingMemoryCommit = Promise.resolve();
    if (turnId && (heard.trim() || reply.trim())) {
      const turnStatus = ["recording", "thinking", "running_skill", "speaking"].includes(phase) ? "interrupted" : "final";
      pendingMemoryCommit = commitTurnMemory(turnStatus);
    }
    deps.speech.stop();
    void deps.brain.cancelAction?.();
    if (capturing) {
      deps.capture.end();
      capturing = false;
    }
    if (liveClient) {
      liveClient.disconnect();
      liveClient = null;
    }
    inputActivity = "idle";
    liveTranslation = {
      active: false,
      targetLanguageCode: "",
      targetLanguageName: "",
      echoTargetLanguage: false,
    };
    preparedIntent = null;
    speechActivity.reset();
    resetTurnTiming();
    phaseBeforeReconnect = null;
    operationBeforeReconnect = null;
    const closingSession = memorySessionId;
    memorySessionId = null;
    const closingSessionPromise = memorySessionPromise;
    memorySessionPromise = null;
    if (closingSession || closingSessionPromise) void pendingMemoryCommit
      .then(async () => closingSession || await closingSessionPromise)
      .then((sessionId) => sessionId ? deps.memory?.endSession(sessionId, sessionStatus) : undefined)
      .catch((error) => console.warn("[E.V memory] session close deferred", error));
    setPhase("idle");
  };

  return {
    micReady() {
      if (deps.canRecord() && phase === "idle") {
        connectLive();
      }
    },
    stop() {
      stopLive();
    },
    tapOrb() {
      if (phase === "idle") {
        connectLive();
      } else if (phase === "speaking") {
        deps.speech.stop();
        void deps.brain.cancelForegroundAction?.();
        liveClient?.interrupt();
        setPhase("listening");
      } else {
        stopLive();
      }
    },
    confirm: async (ok: boolean) => {
      await resolvePendingConfirmation(ok);
    },
    clearConversation() {
      heard = "";
      reply = "";
      operationLabel = null;
      evidence = [];
      grounded = false;
      groundingRequired = false;
      groundingScope = null;
      blockedUngroundedOutput = false;
      toolNames.clear();
      conversationArtifacts.length = 0;
      deps.brain.reset?.();
      deps.speech.stop();
      stopLive();
      emit();
    },
    voiceTranscript(text: string, isFinal: boolean) {
      handleInputTranscript(text, isFinal);
    },
    offlineTranscript(text: string, isFinal: boolean) {
      heard = text;
      emit();
    },
    subscribe(cb: (s: EngineSnapshot) => void) {
      subs.add(cb);
      cb(snapshot);
      return () => subs.delete(cb);
    },
    getSnapshot() {
      return snapshot;
    }
  };
}

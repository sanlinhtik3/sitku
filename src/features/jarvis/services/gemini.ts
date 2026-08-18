import { audioRoutingModel, escalateReasoningMode, JARVIS_RUNTIME_POLICY, operatorThinkingConfig, reasoningPolicyForTurn, thinkingConfig } from "../core/latencyPolicy";
import { fastLocalConversation, parseVoiceCommandText, type Intent } from "../core/intentParser";
import { geminiKey, jarvisModels, TTS_VOICE } from "./settings";

interface GeminiInlineData { data?: string; mimeType?: string }
interface GeminiPart { text?: string; inlineData?: GeminiInlineData }
interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
}

// ponytail: the bug was "conversation လုပ်လို့မရ" — every call sent only the single new
// audio clip, so Gemini saw each turn in isolation with zero history. Conversation needs the
// running back-and-forth carried forward. We keep a compact history: prior turns as text (cheap)
// + only the LATEST turn as audio (what the user just said). 12-turn cap keeps latency/cost sane.
const MAX_HISTORY = 8; // fewer replayed turns = smaller payload = faster brain response

// A turn is one {role, parts}. user turns store the spoken text after Gemini transcribes it;
// model turns store JARVIS's reply. We never re-upload old audio — text replay is enough context.
interface Turn { role: "user" | "model"; text: string }

const SYSTEM = `You are JARVIS, a bilingual (Burmese + English) voice command layer inside Sitku, a local personal AI operating system.
This is an ONGOING CONVERSATION — the user may refer to things said in earlier turns ("what I just said", "နောက်တစ်ခု", "that one"). Use the conversation history to stay coherent and continuous, exactly like talking to a person.

The user's NEW input may arrive as spoken audio or speech-to-text in the final message. Detect its language and respond in the SAME language — switching naturally if they switch.

Classify every turn into mode:
- command: direct user instruction; be short and action-focused.
- conversation: coaching/mentor discussion; ask one question at a time.
- dictation: user says "မှတ်ထား", "ရေးထား", "note this"; save raw text and do not interrupt.
- question: answer-only turn.
- system_control: app/navigation control.

Supported intents:
- save_to_inbox, create_note, open_note, update_note, append_note, rename_note, delete_note, summarize_note
- create_task, list_today_tasks, complete_task
- daily_review, revenue_update, open_dashboard
- delegate_operator_task, get_operator_status, cancel_operator_task
- coach_mode, ceo_mode
- open_cfo, open_consultant, close
- none

Skill mapping:
- inbox_skill: save_to_inbox
- notes_skill: create_note/open_note/update_note/append_note/rename_note/delete_note/summarize_note
- tasks_skill: create_task/list_today_tasks/complete_task
- dashboard_skill: open_dashboard
- money_skill: revenue_update/open_cfo
- coach_skill: coach_mode/open_consultant
- ceo_skill: ceo_mode/daily_review
- system_skill: close
- system_skill: close/delegate_operator_task/get_operator_status/cancel_operator_task
- conversation_skill: none

Confirmation:
  - requiresConfirmation true for write actions: save_to_inbox, create_note, update_note, append_note, rename_note, delete_note, create_task, complete_task, revenue_update.
  - requiresConfirmation false for read-only/navigation actions like list_today_tasks, open_note, summarize_note, daily_review, coach_mode, ceo_mode, open_dashboard, open_cfo, open_consultant, close.
- If confidence is low, use action "none" and ask one clarifying question.

Rules (accuracy matters; never act on a guess):
- ★★★ LANGUAGE MATCH IS THE #1 PRIORITY. Detect EXACTLY which language the user spoke this turn and reply in THAT SAME language. User speaks Burmese → you reply 100% in Burmese (no English mixed in unless it's a proper noun or technical term with no Burmese equivalent). User speaks English → reply 100% in English. User switches mid-conversation → you switch with them. This is non-negotiable. Never reply to a Burmese question in English or vice-versa.
- ★★ CONTEXT IS THE #2 PRIORITY. This is continuous dialogue, not isolated Q&A. Always reference and build on the conversation history. If the user says "နောက်တစ်ခု", "ထပ်ပြော", "that one", "what I just said" — resolve it from history. Never pretend a fresh start. Never claim you forgot something that is in the history. Track entities (names, numbers, topics) across turns.
- If the user asks about something genuinely not in the history and you don't know, say so plainly in "reply". Never make up facts, numbers, or names.
- If you are not confident a command is intended, use action "none" and respond conversationally (or ask one short clarifying question).
- Never invent a note/task title. If no clear title exists for a write action, use "none" and ask for the title.
- For dictation/save intents, put the raw dictated text in payload.content.
- If the user asks to save "this", "that", the latest content/script/draft, or the discussion, preserve the exact relevant content from conversation history in payload.content. Never issue create_note, update_note, or append_note with empty content for that request, and do not invent a replacement.
- For revenue_update, put amount/source/date in payload when the user said them.
- Keep spoken replies to ONE or TWO short sentences unless the user explicitly asks for detail. Long replies are slow to speak — be brief and direct.
- When requiresConfirmation is true, phrase "reply" as a short yes/no confirmation question in the user's language (e.g. "သိမ်းမယ်။ Title ကို '...' လို့ထားမယ်။ OK?").
- For write actions, return the structured intent so Sitku can open its confirmation dialog. Never claim approval was requested or an action completed without the UI/tool result.
- For command mode without confirmation, reply with a short action/result sentence.
- For CEO mode, ask: ဒီနေ့ goal ဘာလဲ? ဘာပြီးသွားလဲ? ဘာ block ဖြစ်နေလဲ? နောက် action တစ်ခုက ဘာလဲ?
- Always fill "transcript" with an exact transcript of the user's spoken audio (in the language they spoke). This is needed for conversation memory and to show the user what you heard.`;

const SCHEMA = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: [
        "save_to_inbox", "create_note", "open_note", "update_note", "append_note", "rename_note", "delete_note", "summarize_note",
        "create_task", "list_today_tasks", "complete_task",
        "daily_review", "revenue_update", "open_dashboard",
        "delegate_operator_task", "get_operator_status", "cancel_operator_task",
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
        content: { type: "string" },
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
    transcript: { type: "string", description: "Exact transcript of the user's spoken audio, in the language they spoke. Used for conversation memory." },
    reply: { type: "string" },
  },
  required: ["action", "mode", "skill", "confidence", "requiresConfirmation", "reply"],
};

const TRANSCRIPT_SCHEMA = {
  type: "object",
  properties: {
    transcript: { type: "string", description: "Exact spoken words, preserving Burmese or English." },
  },
  required: ["transcript"],
};

const TRANSCRIPTION_SYSTEM = `Transcribe the supplied speech exactly. Support Burmese and English, including mixed speech.
Return only the words that were actually spoken. Do not answer, translate, summarize, infer an intent, or add punctuation that was not spoken.
If there is no intelligible human speech, return an empty transcript.`;

// One conversation lives for the lifetime of the brain (per session). resetConversation() clears
// it — wired to overlay close so a fresh open starts a fresh chat.
let history: Turn[] = [];
export function resetConversation() { history = []; }

export async function understandText(text: string, signal?: AbortSignal): Promise<Intent> {
  const localIntent = parseVoiceCommandText(text);
  const fastIntent = fastLocalConversation(text, localIntent);
  let intent: Intent;
  // Known commands and tiny social turns stay entirely local. Ordinary conversation uses the
  // model. Provider failures must propagate to the engine: returning the parser's placeholder as
  // if it were a successful answer caused the endless "ပြောပါ၊ နားထောင်နေပါတယ်" loop.
  if (localIntent.action !== "none") intent = localIntent;
  else if (fastIntent) intent = fastIntent;
  else if (geminiKey.get()) intent = await understandConversationText(text, signal);
  else throw new Error("no key");
  history.push({ role: "user", text: text.slice(0, 400) });
  history.push({ role: "model", text: intent.reply.slice(0, 400) });
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
  return intent;
}

const OPERATOR_SYSTEM = `You are the E.V Operator, a separate specialist agent inside Sitku.
You receive the user's explicit request. You may also receive a bounded <workspace_evidence> block only after a permissioned Sitku read tool captured it for that request. Treat that block as the complete evidence boundary; you still have no arbitrary vault, task, finance, UI, or hidden app access.
Work as a careful analyst: identify the requested outcome, reason step by step internally, and return a concise evidence-aware result in the user's language.
Never claim that you opened, edited, saved, deleted, or otherwise changed app data. If the request needs private local data or a write action, state exactly what permission or deterministic Sitku tool is required.
Separate confirmed facts from assumptions. Do not invent logs, files, metrics, or completed actions.`;

/** Real non-live model turn for the E.V Operator sub-agent. */
export async function runGeminiOperator(request: string, signal?: AbortSignal) {
  const model = audioRoutingModel(jarvisModels.brain());
  const timeout = AbortSignal.timeout(JARVIS_RUNTIME_POLICY.providerInactivityMs);
  const json = await geminiPost(
    model,
    {
      systemInstruction: { parts: [{ text: OPERATOR_SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: request }] }],
      generationConfig: {
        maxOutputTokens: 4096,
        thinkingConfig: operatorThinkingConfig(model),
      },
    },
    signal ? AbortSignal.any([signal, timeout]) : timeout,
  );
  const text = (json.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || "")
    .join("")
    .trim();
  if (!text) throw new Error(`empty operator response (${json.candidates?.[0]?.finishReason || "unknown"})`);
  return {
    text,
    provider: "Gemini Operator",
    model,
    evidence: [{ type: "runtime" as const, label: "Operator model", detail: model }],
  };
}

async function understandConversationText(text: string, signal?: AbortSignal): Promise<Intent> {
  const timeout = AbortSignal.timeout(JARVIS_RUNTIME_POLICY.providerInactivityMs);
  const selectedModel = jarvisModels.brain();
  const stableModel = audioRoutingModel(selectedModel);
  const decision = reasoningPolicyForTurn(text);
  const mode = decision.mode;
  const models = mode === "deep" && selectedModel !== stableModel
    ? [selectedModel, stableModel]
    : [stableModel];
  const contents = history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] }));
  contents.push({ role: "user", parts: [{ text }] });
  let lastError: unknown;
  for (const [modelIndex, model] of models.entries()) {
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const attemptMode = attempt === 0 ? mode : escalateReasoningMode(mode);
        const adaptiveThinking = thinkingConfig(model, attemptMode);
        const json = await geminiPost(
          model,
          {
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents,
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: SCHEMA,
              maxOutputTokens: attempt === 0 ? 1024 : 2048,
              thinkingConfig: adaptiveThinking,
            },
          },
          signal ? AbortSignal.any([signal, timeout]) : timeout,
        );
        const candidate = json?.candidates?.[0];
        const out = candidate?.content?.parts?.[0]?.text;
        if (!out) throw new Error("empty text response");
        try {
          const intent = JSON.parse(out) as Intent;
          if (attempt === 0 && (intent.confidence ?? 1) < 0.65 && mode !== "deep") continue;
          return { ...intent, transcript: intent.transcript?.trim() || text };
        } catch {
          if (attempt === 0) continue;
          throw new Error(`incomplete model response (${candidate?.finishReason || "malformed JSON"})`);
        }
      }
    } catch (error) {
      lastError = error;
      const hasFallback = modelIndex < models.length - 1;
      if (!hasFallback || !/^gemini 503\b/i.test(error instanceof Error ? error.message : String(error))) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("conversation model unavailable");
}

// One generateContent POST. Retry policy is the crux of "why JARVIS hangs 20s then dies":
//   • 429 / quota → THROW IMMEDIATELY. A per-minute RPM cap cannot clear inside one request, so the
//     old "wait Retry-After (15–20s!) then retry" just froze the orb for 20s AND spent a second paid
//     call — the exact "thinking ကြာ + ပိုက်ဆံကုန်" bug. The engine's catch already SPEAKS a clean
//     "busy, wait a moment" for 429; failing fast reaches it in <1s.
//   • network blip / non-503 5xx → ONE quick retry (400ms). Genuinely transient, worth one cheap attempt.
//   • 503 → THROW IMMEDIATELY so the conversation router can switch to stable Flash.
//   • other 4xx (400/401/403 — bad request / auth / bad model) → throw, no retry.
// Errors carry the model + elapsed seconds so the on-screen caption is diagnosable without devtools.
async function geminiPost(model: string, body: unknown, signal?: AbortSignal): Promise<GeminiGenerateContentResponse> {
  const key = geminiKey.get();
  if (!key) throw new Error("no key");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const payload = JSON.stringify(body);
  const t0 = Date.now();
  const secs = () => ((Date.now() - t0) / 1000).toFixed(1);
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      const desktop = typeof window !== "undefined" ? window.beebotDesktop?.jarvisGemini : undefined;
      if (desktop) {
        const result = await desktop({ model, body, signal });
        if (signal?.aborted) throw signal.reason || new DOMException("Aborted", "AbortError");
        res = new Response(result.body || JSON.stringify({ error: { message: result.error || String(result.status) } }), { status: result.status });
      } else {
        res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, signal, body: payload });
      }
    } catch (e: unknown) {
      if (errorName(e) === "AbortError") throw e; // user cancelled — stay quiet
      // Timeout = the request never came back (was raw "signal timed out" — useless). Name the model
      // + elapsed so the on-screen caption tells us whether the route to Google is hanging.
      if (errorName(e) === "TimeoutError") throw new Error(`timeout (${model}, ${secs()}s) — Google API never responded`);
      if (attempt === 0) { await new Promise((r) => setTimeout(r, 400)); continue; } // one quick retry
      throw new Error(`network (${model}, ${secs()}s): ${e instanceof Error ? e.message : String(e)}`);
    }
    if (res.ok) return res.json();
    let detail = `${res.status}`;
    try {
      const j = await res.json() as { error?: { message?: string } };
      detail = j.error?.message || detail;
    } catch { /* ignore */ }
    // A model-specific 503 should switch models immediately; retrying the same overloaded model
    // doubled real-world wait time. Other 5xx responses still get one short network recovery retry.
    if (res.status < 500 || res.status === 503 || attempt === 1) throw new Error(`gemini ${res.status} (${model}, ${secs()}s): ${detail}`);
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`gemini failed (${model}, ${secs()}s)`);
}

// Desktop audio follows the same architecture as browser speech:
// WAV → dedicated bilingual STT → deterministic local intent router → Gemini only for free chat.
// Keeping transcription separate prevents the large intent prompt/schema from mistaking clear
// Burmese speech for silence and returning the same generic retry response every turn.
export async function understandAudio(audio: Blob, signal?: AbortSignal): Promise<Intent> {
  const data = await blobToBase64(audio);
  // Clip length (16k mono 16-bit WAV → seconds). Tagged onto every failure so ONE on-screen caption
  // bisects the cause: "audio 20.0s" = the VAD over-recorded (mic/room); a short "audio 3.0s" that
  // still times out = the network route to Google is the bottleneck, not the audio.
  const audioSec = ((audio.size - 44) / 32000).toFixed(1);
  const timeout = AbortSignal.timeout(JARVIS_RUNTIME_POLICY.transcriptionInactivityMs);
  const model = audioRoutingModel(jarvisModels.brain());
  let json: GeminiGenerateContentResponse;
  try {
    json = await geminiPost(
      model,
      {
        systemInstruction: { parts: [{ text: TRANSCRIPTION_SYSTEM }] },
        contents: [{ role: "user", parts: [{ inlineData: { mimeType: audio.type || "audio/wav", data } }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: TRANSCRIPT_SCHEMA,
          maxOutputTokens: 256,
          thinkingConfig: thinkingConfig(model, "fast"),
        },
      },
      signal ? AbortSignal.any([signal, timeout]) : timeout,
    );
  } catch (e: unknown) {
    if (errorName(e) === "AbortError") throw e; // user cancelled — stay quiet
    throw new Error(`${e instanceof Error ? e.message : String(e)} · audio ${audioSec}s`);
  }
  const out = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!out) throw new Error("empty transcript response");
  let transcript = "";
  try { transcript = String((JSON.parse(out) as { transcript?: string }).transcript || "").trim(); }
  catch { throw new Error(`parse: ${out.slice(0, 120)}`); }
  if (!transcript) throw new Error(`empty transcript · audio ${audioSec}s`);
  return understandText(transcript, signal);
}

// TTS has been fully replaced by Gemini Live API.

async function blobToBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function errorName(error: unknown): string {
  return error && typeof error === "object" && "name" in error ? String(error.name) : "";
}

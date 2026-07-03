import type { NotesRepository } from "@/repositories/contracts/notes";

// JARVIS brain. Primary path: the user's spoken AUDIO goes straight to Gemini, which
// transcribes + detects language (Burmese/English) + decides intent in one call — far more
// accurate and truly bilingual vs browser STT. Actions are NOT executed here: the orb
// confirms first (mishear-proof), then calls execAction. No key/offline → offline keyword
// router on a Web Speech transcript. ponytail: raw fetch, no SDK; local model swaps in here.

const KEY_STORE = "beebot-gemini-key";
const TTS_VOICE = "Kore"; // voice is language-agnostic — Burmese text → Burmese speech

// User-switchable models (Settings). Defaults are the currently-verified pair; the newer options
// are offered in the dropdowns. brain = audio→intent (must accept audio input); tts = voice out.
const BRAIN_STORE = "beebot-jarvis-brain-model";
const TTS_STORE = "beebot-jarvis-tts-model";
export const jarvisModels = {
  brainOptions: [
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash ⭐" },
    { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite (fast)" },
  ],
  ttsOptions: [
    { id: "gemini-2.5-flash-preview-tts", label: "Gemini 2.5 Flash TTS" },
    { id: "gemini-3.1-flash-tts-preview", label: "Gemini 3.1 Flash TTS ⭐" },
  ],
  brain: () => localStorage.getItem(BRAIN_STORE) || "gemini-2.5-flash",
  tts: () => localStorage.getItem(TTS_STORE) || "gemini-2.5-flash-preview-tts",
  setBrain: (id: string) => localStorage.setItem(BRAIN_STORE, id),
  setTts: (id: string) => localStorage.setItem(TTS_STORE, id),
};

export const geminiKey = {
  get: () => localStorage.getItem(KEY_STORE) || (import.meta as any).env.VITE_GEMINI_API_KEY || "",
  set: (k: string) => localStorage.setItem(KEY_STORE, k.trim()),
};

// JARVIS is OFF by default (under dev — must not ship enabled). Opt-in via Settings.
const ENABLED_STORE = "beebot-jarvis-enabled";
export const jarvisEnabled = {
  EVENT: "beebot-jarvis-enabled-changed",
  get: () => localStorage.getItem(ENABLED_STORE) === "1",
  set: (on: boolean) => {
    localStorage.setItem(ENABLED_STORE, on ? "1" : "0");
    window.dispatchEvent(new Event("beebot-jarvis-enabled-changed")); // live-update the mounted orb
  },
};

export type JarvisAction = "open_cfo" | "open_consultant" | "close" | "create_note" | "none";
export interface Intent { action: JarvisAction; title?: string; reply: string; transcript?: string; }

// ponytail: the bug was "conversation လုပ်လို့မရ" — every call sent only the single new
// audio clip, so Gemini saw each turn in isolation with zero history. Conversation needs the
// running back-and-forth carried forward. We keep a compact history: prior turns as text (cheap)
// + only the LATEST turn as audio (what the user just said). 12-turn cap keeps latency/cost sane.
const MAX_HISTORY = 8; // fewer replayed turns = smaller payload = faster brain response

// A turn is one {role, parts}. user turns store the spoken text after Gemini transcribes it;
// model turns store JARVIS's reply. We never re-upload old audio — text replay is enough context.
interface Turn { role: "user" | "model"; text: string }

const SYSTEM = `You are JARVIS, a bilingual (Burmese + English) voice assistant inside a local notes app called BeeBot.
This is an ONGOING CONVERSATION — the user may refer to things said in earlier turns ("what I just said", "နောက်တစ်ခု", "that one"). Use the conversation history to stay coherent and continuous, exactly like talking to a person.

The user's NEW input arrives as spoken audio in the final message. Transcribe it, detect its language, and respond in the SAME language the user spoke — switching naturally if they switch.

You are primarily a CONVERSATIONAL assistant: chat, answer questions, explain, brainstorm, remember what was said, and follow up. Do NOT force every reply into a command. Most turns should be action "none" — just talk.

Commands are OPTIONAL and only when the user clearly asks:
- open_cfo: open the Personal CFO / finance screen
- open_consultant: open the Agent Consultant screen
- close: close the current full-screen app
- create_note: create a note — put a clear title in "title"
- none: no app action; just converse in "reply" (this is the normal case)

Rules (accuracy matters; never act on a guess):
- ★★★ LANGUAGE MATCH IS THE #1 PRIORITY. Detect EXACTLY which language the user spoke this turn and reply in THAT SAME language. User speaks Burmese → you reply 100% in Burmese (no English mixed in unless it's a proper noun or technical term with no Burmese equivalent). User speaks English → reply 100% in English. User switches mid-conversation → you switch with them. This is non-negotiable. Never reply to a Burmese question in English or vice-versa.
- ★★ CONTEXT IS THE #2 PRIORITY. This is continuous dialogue, not isolated Q&A. Always reference and build on the conversation history. If the user says "နောက်တစ်ခု", "ထပ်ပြော", "that one", "what I just said" — resolve it from history. Never pretend a fresh start. Never claim you forgot something that is in the history. Track entities (names, numbers, topics) across turns.
- If the audio is silent, unintelligible, or only background noise (no clear human speech), set action "none", leave "transcript" empty, and briefly ask the user to repeat (e.g. "ပြန်ပြောပေးပါ" / "Sorry, could you say that again?"). NEVER invent or guess words that weren't clearly spoken.
- If the user asks about something genuinely not in the history and you don't know, say so plainly in "reply". Never make up facts, numbers, or names.
- If you are not confident a command is intended, use action "none" and respond conversationally (or ask one short clarifying question).
- Never invent a note title. If create_note has no clear title, use "none" and ask for the title.
- Keep spoken replies to ONE or TWO short sentences unless the user explicitly asks for detail. Long replies are slow to speak — be brief and direct.
- When action is NOT "none", phrase "reply" as a short yes/no confirmation question in the user's language (e.g. "Personal CFO ဖွင့်ရမလား?").
- Always fill "transcript" with an exact transcript of the user's spoken audio (in the language they spoke). This is needed for conversation memory and to show the user what you heard.`;

const SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["open_cfo", "open_consultant", "close", "create_note", "none"] },
    title: { type: "string" },
    transcript: { type: "string", description: "Exact transcript of the user's spoken audio, in the language they spoke. Used for conversation memory." },
    reply: { type: "string" },
  },
  required: ["action", "reply"],
};

// One conversation lives for the lifetime of the brain (per session). resetConversation() clears
// it — wired to overlay close so a fresh open starts a fresh chat.
let history: Turn[] = [];
export function resetConversation() { history = []; }

export function makeJarvisBrain(notes: NotesRepository) {
  return {
    understandAudio,
    execAction: (action: JarvisAction, title?: string) => execAction(notes, action, title),
    offline: (text: string) => offlineRoute(text),
    reset: resetConversation,
  };
}

// One generateContent POST with retry on TRANSIENT failures — 429 (free-tier rate-limit, the #1
// cause of "sometimes no reply"), 5xx, and network errors. Two Gemini calls per turn (understand +
// TTS) hit the free-tier RPM often, and a lone 429 was becoming silence. Honors Retry-After. Other
// 4xx (400/401/403 — bad request / auth / bad model) are real errors → no retry, surfaced with detail.
async function geminiPost(model: string, body: unknown, signal?: AbortSignal): Promise<any> {
  const key = geminiKey.get();
  if (!key) throw new Error("no key");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const payload = JSON.stringify(body);
  let lastErr: Error | null = null;
  // 2 attempts (1 retry): covers a single transient blip without a 3× stack that makes a hard 429
  // take ~7s to surface. A per-minute RPM cap won't clear in a second anyway — fail fast, tell the user.
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, signal, body: payload });
    } catch (e: any) {
      if (e?.name === "AbortError" || e?.name === "TimeoutError") throw e; // cancelled/timed out — stop
      lastErr = e instanceof Error ? e : new Error(String(e)); // network blip → retry
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }
    if (res.ok) return res.json();
    let detail = `${res.status}`;
    try { const j = await res.json(); detail = j?.error?.message || detail; } catch { /* ignore */ }
    if (res.status !== 429 && res.status < 500) throw new Error(`gemini ${res.status}: ${detail}`); // real error
    lastErr = new Error(`gemini ${res.status}: ${detail}`);
    const ra = Number(res.headers.get("retry-after")) * 1000;
    await new Promise((r) => setTimeout(r, ra > 0 ? ra : 400));
  }
  throw lastErr || new Error("gemini failed");
}

// Audio (WAV blob) → intent. Gemini does STT + understanding, bilingual, WITH conversation history.
// `signal` cancels on close; a 30s timeout prevents a hung request stuck on "Thinking…".
async function understandAudio(audio: Blob, signal?: AbortSignal): Promise<Intent> {
  const data = await blobToBase64(audio);
  const timeout = AbortSignal.timeout(30000);
  // Multi-turn contents: prior turns as text, THIS turn's audio last (role-alternating).
  const contents = history.map((t) => ({ role: t.role, parts: [{ text: t.text }] }));
  contents.push({ role: "user", parts: [{ inlineData: { mimeType: audio.type || "audio/wav", data } }] });

  const json = await geminiPost(
    jarvisModels.brain(),
    {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents,
      generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA },
    },
    signal ? AbortSignal.any([signal, timeout]) : timeout,
  );
  const out = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!out) throw new Error("empty");

  let intent: Intent;
  try { intent = JSON.parse(out) as Intent; }
  catch { throw new Error(`parse: ${out.slice(0, 120)}`); }

  // Append to history (capped text keeps the next call's payload — and latency — small).
  history.push({ role: "user", text: (intent.transcript?.trim() || "[user spoke]").slice(0, 400) });
  history.push({ role: "model", text: intent.reply.slice(0, 400) });
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);

  return intent;
}

// Text → spoken audio via Gemini TTS. Returns a WAV blob (24 kHz mono) ready for <audio>.
// This is why JARVIS speaks Burmese — the browser's speechSynthesis has no my-MM voice and mangles
// it; Gemini TTS renders it natively. Retries transient errors (incl. 429) via geminiPost; a 20s
// timeout stops a hung synth. Throws → the voice hook falls back to the browser voice.
export async function synthesize(text: string, signal?: AbortSignal): Promise<Blob> {
  const timeout = AbortSignal.timeout(20000);
  const json = await geminiPost(
    jarvisModels.tts(),
    {
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } },
      },
    },
    signal ? AbortSignal.any([signal, timeout]) : timeout,
  );
  const inline = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inline?.data) throw new Error("tts empty");
  // inlineData.data = base64 raw PCM16 LE; mimeType like "audio/L16;codec=pcm;rate=24000".
  const rate = Number(/rate=(\d+)/.exec(inline.mimeType || "")?.[1]) || 24000;
  return pcm16ToWav(base64ToBytes(inline.data), rate);
}

// Streaming TTS: play audio as it's generated instead of waiting for the whole clip → first sound
// in ~0.5s instead of several seconds. Streams PCM16 chunks over SSE; `onChunk` schedules each into
// Web Audio. Throws if the model/tier doesn't stream (caller falls back to non-streaming synthesize).
export async function synthesizeStream(
  text: string,
  onChunk: (pcm: Int16Array, rate: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const key = geminiKey.get();
  if (!key) throw new Error("no key");
  const timeout = AbortSignal.timeout(20000);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${jarvisModels.tts()}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } } },
      }),
    },
  );
  if (!res.ok || !res.body) throw new Error(`tts ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "", got = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const p = line.slice(5).trim();
      if (!p || p === "[DONE]") continue;
      try {
        const inline = JSON.parse(p)?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (inline?.data) {
          const rate = Number(/rate=(\d+)/.exec(inline.mimeType || "")?.[1]) || 24000;
          onChunk(pcm16FromBase64(inline.data), rate);
          got = true;
        }
      } catch { /* partial line / keep-alive */ }
    }
  }
  if (!got) throw new Error("tts empty");
}

// base64 → Int16 PCM samples (little-endian, as Gemini emits). Explicit byte assembly avoids
// Int16Array-view endianness/alignment gotchas.
function pcm16FromBase64(b64: string): Int16Array {
  const bytes = base64ToBytes(b64);
  const len = bytes.length >> 1;
  const out = new Int16Array(len);
  for (let i = 0; i < len; i++) out[i] = (bytes[i * 2] | (bytes[i * 2 + 1] << 8)) << 16 >> 16;
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Wrap raw 16-bit mono PCM in a WAV header so an <audio> element can play it.
function pcm16ToWav(pcm: Uint8Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + pcm.length);
  const v = new DataView(buf);
  const s = (o: number, str: string) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  s(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); s(8, "WAVE");
  s(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, "data"); v.setUint32(40, pcm.length, true);
  new Uint8Array(buf, 44).set(pcm);
  return new Blob([buf], { type: "audio/wav" });
}

async function execAction(notes: NotesRepository, action: JarvisAction, title?: string): Promise<void> {
  if (action === "open_cfo") window.location.hash = "cfo";
  else if (action === "open_consultant") window.location.hash = "consultant";
  else if (action === "close") { if (window.location.hash) window.location.hash = ""; }
  else if (action === "create_note") {
    const t = safe(title || "") || `Note ${Date.now()}`;
    await notes.writeNote({ path: `${t}.md`, content: `# ${t}\n` });
  }
}

// No-key / offline fallback: READ-ONLY answers only. Commands (open/create) are never run here —
// every action must go through the Gemini path + confirm gate, so offline executes nothing.
async function offlineRoute(raw: string): Promise<string> {
  const t = raw.toLowerCase().trim();
  const has = (...k: string[]) => k.some((w) => t.includes(w));
  if (has("time", "clock", "အချိန်", "နာရီ")) return `အခု ${new Date().toLocaleTimeString()} ဖြစ်ပါတယ်။`;
  if (has("date", "today", "ရက်စွဲ", "ဘယ်နေ့")) return `ဒီနေ့ ${new Date().toLocaleDateString()} ဖြစ်ပါတယ်။`;
  return "Command (CFO ဖွင့် / note ဖန်တီး) တွေအတွက် Gemini key ထည့်ပါ — confirm နဲ့ တိကျစွာ လုပ်ပေးပါမယ်။";
}

async function blobToBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").trim();

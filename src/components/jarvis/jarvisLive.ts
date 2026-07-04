// JARVIS Live — the "phone call" engine. One WebSocket to the Gemini Live API does
// server-side VAD + STT + LLM + TTS in a single duplex stream: mic PCM streams UP as
// you speak, model audio streams DOWN as it replies, with native barge-in and interim
// transcripts. Replaces the old walkie-talkie loop (record → understandAudio → TTS).
//
// ponytail: raw WebSocket, no SDK. The pure DSP/codec helpers are exported + unit-tested
// (jarvisLive.test.mjs); the socket/audio glue needs a real mic + key to verify E2E.
import { geminiKey, jarvisModels } from "./jarvisBrain";
import { TOOL_DECLARATIONS, type ToolExecutor } from "./jarvisTools";

const LIVE_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

const VOICE = "Kore"; // language-agnostic — Burmese text renders as Burmese speech

// Persona for the live call. Same bilingual + confirm-before-act rules as the turn-based
// brain, but phrased for a continuous phone-call feel (short, natural, no robotic filler).
export const LIVE_SYSTEM = `You are JARVIS, a warm bilingual (Burmese + English) voice assistant inside a local notes app called BeeBot. This is a live phone call — talk naturally and continuously, like a person, not a robot.

★ LANGUAGE MATCH is the #1 rule: detect exactly which language the user just spoke and reply 100% in THAT language (Burmese → Burmese, English → English). Switch with them mid-call. Never answer a Burmese question in English or vice-versa.

Keep replies to one or two short sentences unless asked for detail — long speech is slow to hear. Be conversational: chat, answer, explain, remember what was said earlier in the call.

You can look inside the user's own notes: call search_notes(query) to find relevant notes, and read_note(query) to read one in full. Whenever they ask about their notes, ideas, or anything they wrote, SEARCH FIRST, then answer from what you find — never guess or make up note contents.

App actions — open_cfo, open_consultant, close_app, create_note(title): use ONLY when clearly asked, and ASK a short yes/no confirmation out loud (in the user's language) before calling one. Reading/searching notes needs no confirmation. Most turns use no tool at all — just talk.`;

export type LiveState = "connecting" | "listening" | "speaking" | "closed" | "error";

export interface JarvisLiveOptions {
  systemPrompt: string;
  onState: (state: LiveState) => void;
  onUserText?: (text: string) => void; // input (what you said) — interim captions
  onModelText?: (text: string) => void; // output (what JARVIS says) — captions
  onTool?: ToolExecutor; // runs a tool call and returns data fed back to the model
  onError?: (message: string) => void;
}

export interface JarvisLiveHandle {
  close: () => void;
}

// ── pure helpers (exported for unit tests) ────────────────────────────────────

/** Downsample mono Float32 (@inRate) to Int16 PCM @16 kHz — box-average per output
 *  sample for a cheap anti-alias (better than raw decimation). */
export function downsampleTo16k(input: Float32Array, inRate: number): Int16Array {
  if (inRate === 16000) return floatToInt16(input);
  const ratio = inRate / 16000;
  const outLen = Math.max(0, Math.floor(input.length / ratio));
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0, n = 0;
    for (let j = start; j < end; j++) { sum += input[j]; n++; }
    out[i] = clamp16(Math.round((n ? sum / n : 0) * 32767));
  }
  return out;
}

function floatToInt16(f: Float32Array): Int16Array {
  const o = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) o[i] = clamp16(Math.round(f[i] * 32767));
  return o;
}
function clamp16(v: number): number { return v < -32768 ? -32768 : v > 32767 ? 32767 : v; }

export function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function base64ToInt16(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 2));
}

export function rateOf(mime?: string): number {
  return Number(/rate=(\d+)/.exec(mime || "")?.[1]) || 24000;
}

// ── the session ───────────────────────────────────────────────────────────────

export function startJarvisLive(opts: JarvisLiveOptions): JarvisLiveHandle {
  const key = geminiKey.get();
  if (!key) { opts.onError?.("no key"); opts.onState("error"); return { close() {} }; }

  opts.onState("connecting");
  let ws: WebSocket | null = new WebSocket(`${LIVE_URL}?key=${encodeURIComponent(key)}`);
  let closed = false;
  let micCtx: AudioContext | null = null;
  let playCtx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let proc: ScriptProcessorNode | null = null;
  let playHead = 0; // gapless scheduling clock
  const sources = new Set<AudioBufferSourceNode>();

  const send = (obj: unknown) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); };

  ws.onopen = () => {
    send({
      setup: {
        model: `models/${jarvisModels.live()}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
        },
        systemInstruction: { parts: [{ text: opts.systemPrompt }] },
        tools: TOOL_DECLARATIONS,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
    });
  };

  ws.onerror = () => { if (!closed) { opts.onError?.("connection error"); opts.onState("error"); } };
  ws.onclose = () => { if (!closed) opts.onState("closed"); };

  ws.onmessage = async (ev: MessageEvent) => {
    if (closed) return;
    let msg: any;
    try { msg = JSON.parse(typeof ev.data === "string" ? ev.data : await (ev.data as Blob).text()); }
    catch { return; }

    if (msg.setupComplete) { void startMic(); opts.onState("listening"); return; }

    const sc = msg.serverContent;
    if (sc) {
      if (sc.interrupted) stopPlayback();                       // barge-in
      if (sc.inputTranscription?.text) opts.onUserText?.(sc.inputTranscription.text);
      if (sc.outputTranscription?.text) opts.onModelText?.(sc.outputTranscription.text);
      for (const p of sc.modelTurn?.parts || []) {
        const inline = p.inlineData;
        if (inline?.data && String(inline.mimeType || "").includes("audio")) {
          opts.onState("speaking");
          playPcm(base64ToInt16(inline.data), rateOf(inline.mimeType));
        }
      }
      if (sc.turnComplete) opts.onState("listening");
    }

    if (msg.toolCall?.functionCalls?.length) {
      const responses: unknown[] = [];
      for (const c of msg.toolCall.functionCalls) {
        // Execute the tool and feed its DATA back so the model can speak about it
        // (search results / note text), not just a fire-and-forget "ok".
        let result: Record<string, unknown> = { ok: true };
        try { result = (await opts.onTool?.(c.name, c.args)) ?? { ok: true }; }
        catch { result = { error: "tool failed" }; }
        responses.push({ id: c.id, name: c.name, response: result });
      }
      send({ toolResponse: { functionResponses: responses } });
    }
  };

  async function startMic() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      opts.onError?.("mic denied"); opts.onState("error"); return;
    }
    micCtx = new AudioContext();
    const src = micCtx.createMediaStreamSource(stream);
    // ponytail: ScriptProcessor is deprecated but universal; AudioWorklet if it ever matters.
    proc = micCtx.createScriptProcessor(4096, 1, 1);
    const mute = micCtx.createGain(); mute.gain.value = 0; // it only fires when wired to destination
    proc.onaudioprocess = (e) => {
      if (closed || ws?.readyState !== WebSocket.OPEN) return;
      const pcm = downsampleTo16k(e.inputBuffer.getChannelData(0), micCtx!.sampleRate);
      send({ realtimeInput: { mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: int16ToBase64(pcm) }] } });
    };
    src.connect(proc); proc.connect(mute); mute.connect(micCtx.destination);
  }

  function playPcm(pcm: Int16Array, rate: number) {
    if (!playCtx) playCtx = new AudioContext();
    if (playCtx.state === "suspended") void playCtx.resume();
    const buf = playCtx.createBuffer(1, pcm.length, rate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
    const node = playCtx.createBufferSource();
    node.buffer = buf;
    node.connect(playCtx.destination);
    const now = playCtx.currentTime;
    if (playHead < now) playHead = now;
    node.start(playHead);
    playHead += buf.duration;
    sources.add(node);
    node.onended = () => sources.delete(node);
  }

  function stopPlayback() {
    for (const s of sources) { try { s.stop(); } catch { /* already stopped */ } }
    sources.clear();
    playHead = 0;
  }

  function close() {
    if (closed) return;
    closed = true;
    stopPlayback();
    try { proc?.disconnect(); } catch { /* noop */ }
    stream?.getTracks().forEach((t) => t.stop());
    void micCtx?.close().catch(() => {});
    void playCtx?.close().catch(() => {});
    try { ws?.close(); } catch { /* noop */ }
    ws = null;
    opts.onState("closed");
  }

  return { close };
}

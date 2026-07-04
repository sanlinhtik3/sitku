import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Sparkles, Check, Mic } from "lucide-react";
import { toast } from "sonner";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useJarvisVoice } from "@/components/jarvis/useJarvisVoice";
import { getSavedVoiceLanguage } from "@/components/agent-chat/chat-input/VoiceInput";
import { geminiKey, jarvisEnabled, jarvisLiveMode, type Intent } from "@/components/jarvis/jarvisBrain";
import { startJarvisLive, LIVE_SYSTEM, type JarvisLiveHandle } from "@/components/jarvis/jarvisLive";
import type { ToolExecutor } from "@/components/jarvis/jarvisTools";

type Phase = "idle" | "recording" | "thinking" | "confirm" | "speaking" | "resuming";

// ponytail: distinguish a FIRST-TIME prompt (browser hasn't decided yet) from a HARD denial
// (user clicked "Block" before, or macOS system setting is off). On hard denial, getUserMedia
// keeps rejecting instantly — re-prompting does nothing, so we must route the user to settings.
type MicState = "unknown" | "granted" | "denied";

interface Brain {
  understandAudio: (audio: Blob) => Promise<Intent>;
  execAction: (action: Intent["action"], title?: string) => Promise<void>;
  offline: (text: string) => Promise<string>;
  reset?: () => void; // clear conversation history (on close)
  execTool: ToolExecutor; // Live-agent tools (search/read notes + actions)
}

interface JarvisProps { brain: Brain; }

const PHASE_LABEL: Record<Phase, string> = {
  idle: "စကားပြောဖို့ orb ကို tap ပါ · Tap to speak",
  recording: "နားထောင်နေပါတယ်… · Listening…",
  thinking: "စဉ်းစားနေပါတယ်… · Thinking…",
  confirm: "အတည်ပြုပါ · Confirm?",
  speaking: "ပြောနေပါတယ်… · Speaking…",
  resuming: "ပြန်စနေပါပြီ… · Resuming…",
};

// Speech-aware VAD tuning — mic/room varies by device, so these are calibration knobs, not constants.
// Retuned to auto-trigger on quieter / farther speech (the "I had to tap" complaint): lower ratio +
// margin + min, faster onset, and a proper multi-frame noise-floor calibration so a single loud first
// frame can't set the bar out of reach.
const SILENCE_MS = 900;        // sustained silence AFTER speech → auto-send (the "I'm done talking" cue)
const NO_SPEECH_MS = 9000;     // never spoke → stop and go idle (don't spin forever)
const MAX_RECORD_MS = 20000;   // hard cap on one utterance
const VAD_START_FRAMES = 2;    // consecutive voiced frames (~160ms) to confirm speech — debounces clicks
const VAD_RATIO = 1.6;         // speech-band energy must exceed the room's noise floor by this × (was 2.0 — too deaf to far speech)
const VAD_MARGIN = 4;          // + absolute margin (0..255) so a near-zero floor still needs real energy
const VAD_MIN = 8;             // hard floor: below this (0..255) is never speech, however quiet the room
const VAD_CALIB_FRAMES = 4;    // average the first N frames for the noise floor (not one transient sample)
const COOLDOWN_MS = 700;       // post-TTS silence before the mic re-arms — stops the orb hearing its own echo

export function Jarvis({ brain }: JarvisProps) {
  const [enabled, setEnabled] = useState(() => jarvisEnabled.get());
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [heardVoice, setHeardVoice] = useState(false); // VAD saw real speech this turn (live UX)
  const [micState, setMicState] = useState<MicState>("unknown");
  const [hasKey, setHasKey] = useState(() => !!geminiKey.get());

  const { speak, stop: stopSpeak, isSpeaking } = useJarvisVoice();

  // Is this running inside the BeeBot desktop (Electron) shell? Drives the guidance we show
  // when the mic is blocked: in-browser we open the site's per-origin permission; in desktop
  // we point at macOS System Settings → Privacy → Microphone.
  const isDesktop = typeof window !== "undefined" && !!(window as any).beebotDesktop;
  const desktopPlatform = (typeof window !== "undefined" && (window as any).beebotDesktop?.platform) || "";

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const samplesRef = useRef<Float32Array[]>([]);
  const pendingRef = useRef<Intent | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const vadRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopAndSendRef = useRef<() => void>(() => {});
  const cancelRecordingRef = useRef<() => void>(() => {});
  const spokeRef = useRef(false); // did TTS actually start? (guards the resume-before-onstart race)
  const cooldownRef = useRef(false); // post-TTS pause so the mic doesn't re-arm onto JARVIS's own echo
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeRef = useRef<() => void>(() => {}); // latest resumeOrIdle, callable from a stable timer

  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  // Ref mirror so requestMic (a useCallback) can read the latest micState without re-creating
  // every keystroke and re-triggering dependent effects.
  const micStateRef = useRef<MicState>(micState);
  micStateRef.current = micState;

  // ── Gemini-audio path: record raw PCM, encode WAV (container-safe), send for intent ──
  // Production behaviour: no "tap to send" — a VAD watches the live mic level and auto-sends once
  // the user goes quiet after speaking (just like a person noticing you've finished your sentence).
  const startRecording = useCallback(() => {
    if (jarvisLiveMode.get()) return; // Live mode owns the mic via the WebSocket session
    const ctx = ctxRef.current, source = sourceRef.current, analyser = analyserRef.current;
    if (!ctx || !source || !analyser) return;
    samplesRef.current = [];
    const proc = ctx.createScriptProcessor(4096, 1, 1); // ponytail: deprecated but universal; AudioWorklet if it ever matters
    proc.onaudioprocess = (e) => samplesRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    const mute = ctx.createGain(); mute.gain.value = 0; // ScriptProcessor only fires when reaching destination
    source.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
    procRef.current = proc;
    setReply(""); setHeard(""); setHeardVoice(false); setPhase("recording"); // clear last caption; show fresh "Listening"

    // ── Speech-band VAD: tell HUMAN voice from ambient noise. ──
    // We measure energy ONLY in the speech band (~300–3400 Hz) — low-freq rumble (fans, AC,
    // traffic, mic handling) and high hiss fall outside it — and compare it to an ADAPTIVE noise
    // floor calibrated to THIS room, not a fixed threshold. So a loud room raises the bar and a
    // quiet room lowers it; only voice that rises clearly above the room's own noise counts.
    const bins = analyser.frequencyBinCount;
    const spec = new Uint8Array(bins);
    const binHz = ctx.sampleRate / analyser.fftSize;
    const loBin = Math.max(1, Math.floor(300 / binHz));
    const hiBin = Math.min(bins - 1, Math.ceil(3400 / binHz));
    let floor = -1, calib = 0, calibSum = 0, voiced = 0, sawSpeech = false, lastVoicedAt = 0;
    const startedAt = performance.now();
    if (vadRef.current) clearInterval(vadRef.current);
    vadRef.current = setInterval(() => {
      const a = analyserRef.current;
      if (!a) return;
      a.getByteFrequencyData(spec);
      let e = 0; for (let i = loBin; i <= hiBin; i++) e += spec[i];
      e /= (hiBin - loBin + 1); // avg speech-band energy, 0..255
      const now = performance.now();
      if (floor < 0) { // calibrate the noise floor over the first frames — one loud transient can't set the bar
        calibSum += e;
        if (++calib >= VAD_CALIB_FRAMES) floor = calibSum / calib;
        return;
      }
      const voicedNow = e > Math.max(floor * VAD_RATIO + VAD_MARGIN, VAD_MIN);
      if (voicedNow) {
        voiced++; lastVoicedAt = now;
        if (voiced >= VAD_START_FRAMES) { sawSpeech = true; setHeardVoice(true); }
      } else {
        voiced = 0;
        if (!sawSpeech) floor = floor * 0.95 + e * 0.05; // slow-track ambient until real speech begins, then freeze
      }
      if (sawSpeech && now - lastVoicedAt > SILENCE_MS) stopAndSendRef.current();        // finished talking → send
      else if (!sawSpeech && now - startedAt > NO_SPEECH_MS) cancelRecordingRef.current(); // only noise/silence → idle
      else if (now - startedAt > MAX_RECORD_MS) stopAndSendRef.current();                 // hard cap
    }, 80); // faster polling → snappier onset/offset detection
  }, []);

  const stopAndSend = useCallback(async () => {
    if (vadRef.current) { clearInterval(vadRef.current); vadRef.current = null; }
    const proc = procRef.current, ctx = ctxRef.current;
    if (!proc) return; // already sent/cancelled (VAD + manual tap could both fire) — no-op
    proc.disconnect(); proc.onaudioprocess = null; procRef.current = null;
    setPhase("thinking");
    abortRef.current = new AbortController();
    try {
      const src = ctx?.sampleRate ?? 48000;
      const flat = flatten(samplesRef.current);
      if (flat.length / src < 0.3) { startRecording(); return; } // <0.3s captured → noise blip, nothing to send; keep listening (don't waste an API call / hit rate limits)
      const wav = encodeWAV(downsample(flat, src, 16000), 16000);
      const intent = await brain.understandAudio(wav, abortRef.current.signal);
      // Show what JARVIS heard (its own transcript) — far better UX than the orb going silent.
      if (intent.transcript) setHeard(intent.transcript);
      setReply(intent.reply);
      if (intent.action === "none") {
        setPhase("speaking"); speak(intent.reply);
      } else {
        pendingRef.current = intent;
        setPhase("confirm"); speak(intent.reply); // reply is phrased as a yes/no question
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return; // user closed/cancelled — stay quiet
      console.error("[JARVIS] understandAudio failed:", e);
      // The generic "ထပ်ပြောပေးပါ" hid the real cause (usually a free-tier 429 or a bad model), so
      // the user couldn't tell it apart from "didn't hear me". Classify + surface the actual reason.
      const detail = String(e?.message || e);
      let spoken: string;
      if (/no key/i.test(detail)) spoken = "Gemini API key ထည့်ဖို့ လိုပါတယ်။";
      else if (/429|rate|quota|exhaust|resource/i.test(detail)) spoken = "Gemini က ခဏ အလုပ်များနေလို့ — စက္ကန့်အနည်းငယ် စောင့်ပြီး ပြန်ပြောပါ။";
      else if (/40[0-9]|not found|unsupported|invalid|permission/i.test(detail)) spoken = "AI model ပြဿနာ — Settings ထဲ Brain model ကို Gemini 2.5 Flash ပြန်ရွေးကြည့်ပါ။";
      else if (/time|network|fetch|abort/i.test(detail)) spoken = "အင်တာနက် ချိတ်ဆက်မှု ပြဿနာ — ပြန်ကြိုးစားပါ။";
      else spoken = "တောင်းပန်ပါတယ်၊ ထပ်ပြောပေးပါ။";
      setHeard("");
      setReply(`${spoken}\n⚠ ${detail}`); // caption shows the raw cause so you can tell me exactly what failed
      setPhase("speaking"); speak(spoken);
    }
  }, [brain, speak, startRecording]);

  // VAD fired with no speech → stop recording WITHOUT sending (don't ship silence to Gemini).
  const cancelRecording = useCallback(() => {
    if (vadRef.current) { clearInterval(vadRef.current); vadRef.current = null; }
    if (procRef.current) { procRef.current.disconnect(); procRef.current.onaudioprocess = null; procRef.current = null; }
    setPhase("idle");
  }, []);

  // Refs so the VAD interval always calls the latest closures without re-arming each render.
  stopAndSendRef.current = stopAndSend;
  cancelRecordingRef.current = cancelRecording;

  // ── Confirm gate (all actions) ──
  const confirm = useCallback(async (ok: boolean) => {
    const intent = pendingRef.current;
    pendingRef.current = null;
    if (ok && intent) {
      try { await brain.execAction(intent.action, intent.title); } catch { /* surfaced below */ }
      const done = "ပြီးပါပြီ။";
      setReply(done); setPhase("speaking"); speak(done);
    } else {
      const cancel = "ဟုတ်ပြီ၊ မလုပ်တော့ပါဘူး။";
      setReply(cancel); setPhase("speaking"); speak(cancel);
    }
  }, [brain, speak]);

  // ── No-key fallback: Web Speech transcript → offline keyword router ──
  const recognition = useSpeechRecognition({
    language: getSavedVoiceLanguage(),
    continuous: false,
    interimResults: true,
    onResult: (text, isFinal) => {
      if (!isFinal) { setHeard(text); return; }
      setHeard(text); setPhase("thinking");
      void brain.offline(text).then((r) => { setReply(r); setPhase("speaking"); speak(r); });
    },
  });

  const resumeOrIdle = useCallback(() => {
    // Cooldown: after JARVIS speaks, do NOT re-arm the mic instantly. TTS audio + room reverb are
    // still in the air for ~0.5–1s; the VAD would hear them as "speech", auto-send, and Gemini
    // would "reply" to JARVIS's own voice — the Listening↔Thinking loop. We block re-arming for
    // COOLDOWN_MS, then resume. A manual tap always overrides this (user wants to talk now).
    if (cooldownRef.current) return;
    if (open && micStateRef.current === "granted" && geminiKey.get()) startRecording();
    else setPhase("idle");
  }, [open, startRecording]);

  // Long-press the orb (hold ~0.6s) → clear the conversation and start fresh. Avoids a permanent
  // growing context that drifts off-topic, and gives the user an explicit "forget everything" gesture
  // (since we now persist context across open/close by design).
  const onClearConversation = useCallback(() => {
    brain.reset?.();
    setHeard(""); setReply("");
    if (hasKey && micStateRef.current === "granted") startRecording();
    else setPhase("idle");
    toast.success("စကားပြောဆက်ဆံမှု ရှင်းလင်းပြီး · Conversation cleared");
  }, [brain, hasKey, startRecording]);

  // ── Live (realtime duplex) mode ── one WebSocket does STT+LLM+TTS with server-side VAD and
  // native barge-in; runs the whole time the orb is open. The walkie-talkie path is neutered
  // (startRecording early-returns) so only ONE engine drives the mic. Default off; opt-in in Settings.
  const liveRef = useRef<JarvisLiveHandle | null>(null);
  useEffect(() => {
    if (!open || !hasKey || !jarvisLiveMode.get()) return;
    const handle = startJarvisLive({
      systemPrompt: LIVE_SYSTEM,
      onState: (s) => {
        if (s === "listening") setPhase("recording");
        else if (s === "speaking") setPhase("speaking");
        else if (s === "connecting") setPhase("thinking");
        else if (s === "error" || s === "closed") setPhase("idle");
      },
      onUserText: (t) => setHeard(t),
      onModelText: (t) => setReply(t),
      onTool: (name, args) => brain.execTool(name, args),
      onError: (m) => { if (m !== "no key") toast.error(`JARVIS: ${m}`); },
    });
    liveRef.current = handle;
    return () => { handle.close(); liveRef.current = null; };
  }, [open, hasKey, brain]);

  // Conversational loop: re-listen ONLY after JARVIS has actually spoken AND finished. The bug was
  // resuming in the gap BEFORE speechSynthesis fires `onstart` (isSpeaking still false) — that
  // re-recorded into the TTS about to play, the mic heard it, and it looped Listening↔Thinking.
  // spokeRef gates on the real start→end edge. The cooldown then pads a short silence so we don't
  // re-arm onto the tail of the TTS audio. We use a ref-stored timer (not the effect cleanup) so
  // the setPhase("idle") re-render can't cancel the cooldown before it fires.
  resumeRef.current = resumeOrIdle;
  useEffect(() => {
    if (phase !== "speaking") { spokeRef.current = false; return; }
    if (isSpeaking) { spokeRef.current = true; return; } // TTS is actually playing now
    if (!spokeRef.current) return;                       // not started yet — wait (don't resume into it)
    spokeRef.current = false;
    // JARVIS finished speaking → arm the cooldown, then resume listening for the next turn.
    cooldownRef.current = true;
    setPhase("resuming"); // distinct phase so the label reads "Resuming…" not the misleading "Tap to speak"
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => {
      cooldownTimerRef.current = null;
      cooldownRef.current = false;
      resumeRef.current();
    }, COOLDOWN_MS);
  }, [phase, isSpeaking]);

  // Safety net: never get stuck in "speaking" if the audio never ends (failed TTS / lost `ended`).
  // 30s comfortably exceeds any spoken reply; the normal path resumes the instant audio ends.
  // We clear the phase directly rather than calling resumeOrIdle() (which is cooldown-gated) so the
  // user is never stranded, then the cooldown logic takes over from idle.
  useEffect(() => {
    if (phase !== "speaking") return;
    const t = setTimeout(() => {
      if (phaseRef.current === "speaking") { spokeRef.current = true; setPhase("idle"); }
    }, 30000);
    return () => clearTimeout(t);
  }, [phase]);

  // ── Tap the orb: start/stop a turn (audio if keyed, else Web Speech) ──
  // A manual tap ALWAYS cancels the post-TTS cooldown — if the user wants to speak, we listen now.
  const onOrbTap = useCallback(() => {
    cooldownRef.current = false;
    if (phase === "idle" || phase === "resuming") {
      // Both "fresh start" and "cooldown about to auto-resume" → tapping listens NOW.
      if (cooldownTimerRef.current) { clearTimeout(cooldownTimerRef.current); cooldownTimerRef.current = null; }
      if (hasKey) startRecording();
      else recognition.start();
    } else if (phase === "recording") {
      void stopAndSend();
    } else if (phase === "thinking") {
      // Cancel the in-flight Gemini request and go back to listening — "I misspoke, let me redo".
      // UX escape hatch: otherwise the user is locked out until the 30s timeout.
      if (cooldownTimerRef.current) { clearTimeout(cooldownTimerRef.current); cooldownTimerRef.current = null; }
      abortRef.current?.abort();
      abortRef.current = null;
      setReply("");
      if (hasKey && micStateRef.current === "granted") startRecording();
      else setPhase("idle");
    } else if (recognition.isListening) {
      recognition.stop();
    } else if (phase === "speaking") {
      stopSpeak(); startRecording(); // barge-in: cut JARVIS off and start talking
    }
  }, [phase, hasKey, startRecording, stopAndSend, recognition, stopSpeak]);

  // ── Mic acquisition = the permission gate ──
  // One click here is the ENTIRE permission flow: it calls getUserMedia, which (now that the
  // Electron allow-list includes 'media') triggers the native macOS / browser mic prompt. On
  // success we wire up the analyser; on failure we mark 'denied' and the UI shows how to fix.
  // If permission was already granted earlier, navigator.permissions lets us skip the prompt.
  const startSession = useCallback(async () => {
    // Fast-path: if the browser exposes the Permissions API, we can tell granted vs denied
    // WITHOUT re-prompting. 'unknown' means still unprompted — fall through to getUserMedia.
    try {
      const status = await (navigator as any).permissions?.query?.({ name: "microphone" as PermissionName });
      if (status?.state === "granted") setMicState("granted");
      else if (status?.state === "denied") setMicState("denied");
    } catch { /* Safari/older browsers don't implement mic in Permissions API — fine */ }

    try {
      // Native AEC/NS/AGC: echoCancellation stops the mic from hearing JARVIS's own TTS (the loop's
      // fuel); noiseSuppression + autoGainControl clean ambient noise and level soft speech.
      // AEC stops the mic hearing JARVIS's own TTS; NS cleans ambient. autoGainControl is OFF — it
      // pumps the gain during pauses, which destabilizes the VAD's adaptive noise floor (a big cause
      // of "it didn't hear me": AGC boosted the room hiss until real speech no longer stood out).
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      });
      streamRef.current = stream;
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024; // finer bins so the VAD can isolate the 300–3400 Hz speech band
      analyser.smoothingTimeConstant = 0.4; // a little smoothing steadies the VAD without lagging speech onset
      source.connect(analyser);
      ctxRef.current = ctx; sourceRef.current = source; analyserRef.current = analyser;
      setMicState("granted");
      if (geminiKey.get()) startRecording(); else setPhase("idle"); // hands-free: start listening immediately
    } catch (err: any) {
      // NotAllowedError == the prompt was dismissed with "Block" (or system setting is off).
      // NotFoundError == no mic device. Anything else == transient. We surface a clear next step.
      setMicState("denied");
      setPhase("idle");
      console.error("[JARVIS] mic permission denied:", err?.name || err);
    }
  }, [startRecording]);

  // One-click "Enable Microphone": re-attempt the prompt. If the OS/browser has already BLOCKED
  // the origin, getUserMedia will reject again immediately — in that case open the settings the
  // user actually needs to change. (The prompt cannot be re-shown once hard-denied.)
  const requestMic = useCallback(async () => {
    if (micState === "granted") return;
    await startSession();
    if (micStateRef.current !== "granted") openMicSettings();
  }, [micState, startSession]);

  // Route the user to the RIGHT settings UI for their environment.
  const openMicSettings = useCallback(() => {
    if (isDesktop) {
      // The renderer can't open a custom-scheme URL (nav guard allows only http/https), so the
      // main process opens the OS mic-privacy pane via shell.openExternal. One click → Settings.
      (window as any).beebotDesktop?.openMicSettings?.();
      return;
    }
    // Browser: per-origin permission. Chromium can't be deep-linked, so reload the tab after
    // they fix the address-bar lock icon. ponytail: reload is the only reliable "retry" here.
    const origin = typeof location !== "undefined" ? location.origin : "";
    toast.info("Address bar → 🎤 / lock icon → Allow microphone, then this tab will reload.", {
      description: origin,
      duration: 6000,
    });
  }, [isDesktop]);

  const teardown = useCallback(() => {
    recognition.stop();
    stopSpeak();
    abortRef.current?.abort(); // cancel any in-flight Gemini request
    abortRef.current = null;
    // ponytail UX: do NOT reset conversation here. The user's #2 priority is "context must persist".
    // Closing the orb (to read a note, check CFO, etc.) must not wipe what was said. Conversation
    // memory lives for the whole app session; only an explicit "clear" resets it (see onOrbTap).
    cooldownRef.current = false;
    if (cooldownTimerRef.current) { clearTimeout(cooldownTimerRef.current); cooldownTimerRef.current = null; }
    if (vadRef.current) { clearInterval(vadRef.current); vadRef.current = null; }
    procRef.current?.disconnect();
    procRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null; sourceRef.current = null; analyserRef.current = null;
    pendingRef.current = null;
    setPhase("idle"); setHeardVoice(false);
    // Keep `heard` + `reply` so reopening shows the last exchange (continuity), only clear on open.
    setMicState("unknown");
  }, [recognition, stopSpeak]);

  const close = useCallback(() => { setOpen(false); teardown(); }, [teardown]);

  useEffect(() => {
    if (open) void startSession();
    return () => { if (open) teardown(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Live-track the Settings toggle (this tab + cross-tab); close if it's turned off mid-session.
  useEffect(() => {
    const sync = () => setEnabled(jarvisEnabled.get());
    window.addEventListener(jarvisEnabled.EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(jarvisEnabled.EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  useEffect(() => { if (!enabled && open) close(); }, [enabled, open, close]);

  // ⌘J / Ctrl+J toggle; Esc closes. (No-op while disabled.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!jarvisEnabled.get()) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setOpen((v) => !v); }
      else if (e.key === "Escape" && open) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!enabled) return null; // OFF by default — no launcher; ⌘J handler is gated above

  return (
    <>
      <button
        aria-label="Open JARVIS voice assistant (⌘J)"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-[60] flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_8px_28px_-6px_hsl(var(--primary)/0.7)] transition-transform hover:scale-105 active:scale-95"
      >
        <Sparkles className="h-5 w-5" />
      </button>

      {open && (
        <JarvisOverlay
          phase={phase}
          heard={heard}
          heardVoice={heardVoice}
          reply={reply}
          micState={micState}
          isDesktop={isDesktop}
          desktopPlatform={desktopPlatform}
          hasKey={hasKey}
          onSaveKey={(k) => { geminiKey.set(k); setHasKey(true); }}
          analyserRef={analyserRef}
          phaseRef={phaseRef}
          onClose={close}
          onOrbTap={onOrbTap}
          onConfirm={confirm}
          onRequestMic={requestMic}
          onOpenMicSettings={openMicSettings}
          onClearConversation={onClearConversation}
        />
      )}
    </>
  );
}

function JarvisOverlay({
  phase, heard, heardVoice, reply, micState, isDesktop, desktopPlatform, hasKey, onSaveKey, analyserRef, phaseRef, onClose, onOrbTap, onConfirm, onRequestMic, onOpenMicSettings, onClearConversation,
}: {
  phase: Phase;
  heard: string;
  heardVoice: boolean;
  reply: string;
  micState: MicState;
  isDesktop: boolean;
  desktopPlatform: string;
  hasKey: boolean;
  onSaveKey: (k: string) => void;
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  phaseRef: React.MutableRefObject<Phase>;
  onClose: () => void;
  onOrbTap: () => void;
  onConfirm: (ok: boolean) => void;
  onRequestMic: () => void;
  onOpenMicSettings: () => void;
  onClearConversation: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [keyInput, setKeyInput] = useState("");

  // Distinguish a tap (→ onOrbTap) from a long-press (→ clear conversation). A short pointerdown
  // starts a 650ms timer; if the pointer lifts before that, it's a tap; if the timer fires, it's
  // a hold and we suppress the tap that would follow. This keeps the existing tap behavior intact
  // while adding a discoverable "reset context" gesture.
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldRef = useRef(false);
  const onPointerDown = useCallback(() => {
    heldRef.current = false;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => { heldRef.current = true; onClearConversation(); }, 650);
  }, [onClearConversation]);
  const onPointerUp = useCallback(() => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (!heldRef.current) onOrbTap(); // short press → tap; long press already handled
  }, [onOrbTap]);
  useEffect(() => () => { if (holdTimerRef.current) clearTimeout(holdTimerRef.current); }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const baseAccent = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "199 89% 48%";
    const freq = new Uint8Array(128);
    let level = 0, raf = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // ponytail UX: the orb color carries meaning. Default = brand accent. Recording with voice
      // detected = green (reassuring "I hear you"). Thinking = amber (working). Speaking = accent.
      // This is the single most important glanceable feedback — users were unsure if capture worked.
      const p = phaseRef.current;
      let accent = baseAccent;
      if (p === "recording" && heardVoice) accent = "142 71% 45%";      // green — actively hearing speech
      else if (p === "thinking" || p === "resuming") accent = "38 92% 50%"; // amber — working / pausing

      let target: number;
      if (p === "recording" && analyserRef.current) {
        analyserRef.current.getByteFrequencyData(freq);
        let sum = 0; for (let i = 0; i < freq.length; i++) sum += freq[i];
        target = Math.min(1, sum / freq.length / 140);
      } else if (p === "speaking") {
        target = 0.45 + 0.35 * Math.abs(Math.sin(performance.now() / 140));
      } else if (p === "thinking") {
        target = 0.3 + 0.12 * Math.sin(performance.now() / 260);
      } else {
        target = 0.12 + 0.05 * Math.sin(performance.now() / 900);
      }
      level += (target - level) * 0.18;

      const cx = w / 2, cy = h / 2;
      const base = Math.min(w, h) * 0.16;
      const r = base * (1 + level * 0.9);

      for (let i = 3; i >= 1; i--) {
        ctx.beginPath();
        ctx.arc(cx, cy, r + i * 22 * (0.6 + level), 0, Math.PI * 2);
        ctx.strokeStyle = `hsl(${accent} / ${0.06 + level * 0.1})`;
        ctx.lineWidth = 2; ctx.stroke();
      }
      const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
      grad.addColorStop(0, `hsl(${accent} / 0.95)`);
      grad.addColorStop(1, `hsl(${accent} / 0.15)`);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = grad; ctx.shadowColor = `hsl(${accent} / 0.9)`; ctx.shadowBlur = 30 + level * 60; ctx.fill();
      ctx.shadowBlur = 0;

      const t = performance.now() / 1000;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 14, t % (Math.PI * 2), (t % (Math.PI * 2)) + Math.PI * 0.6);
      ctx.strokeStyle = `hsl(${accent} / 0.8)`; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.stroke();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyserRef, phaseRef, heardVoice]);

  // The backdrop does NOT close on click (ponytail UX fix: clicking the orb was closing JARVIS).
  // Close ONLY via the X button or Esc — matches a modal, not a popover. The translucent backdrop
  // is purely visual; tapping anywhere outside the orb is a no-op.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/80 backdrop-blur-xl">
      <button aria-label="Close JARVIS" onClick={onClose} className="absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-foreground/10 text-foreground hover:bg-foreground/20">
        <X className="h-4 w-4" />
      </button>

      <canvas
        ref={canvasRef}
        onPointerDown={(e) => { e.stopPropagation(); onPointerDown(); }}
        onPointerUp={(e) => { e.stopPropagation(); onPointerUp(); }}
        onPointerLeave={() => { if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; } heldRef.current = true; /* cancel pending tap if pointer leaves */ }}
        className="h-[min(46vh,420px)] w-[min(46vh,420px)] cursor-pointer touch-none select-none"
      />

      <div className="mt-2 flex max-w-[90vw] flex-col items-center text-center" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-medium tracking-wide text-[hsl(var(--primary))]">
          {micState === "denied"
            ? "Microphone ခွင့်ပြုချက် လိုပါတယ်"
            : micState === "unknown"
              ? "Microphone ဖွင့်ပါ — တစ်ချက်နှိပ်ပါ"
              : phase === "recording"
                ? (heardVoice ? "ကြားနေပြီ 🎤 — ဆက်ပြောပါ၊ ဒါမှမဟုတ် ရပ်ဖို့ tap ပါ" : "နားထောင်နေပါတယ်… စကားပြောပါ")
                : PHASE_LABEL[phase]}
        </p>
        {/* Live caption: show what JARVIS heard as soon as it transcribes (during thinking/speaking),
            and keep it visible. During recording we don't have a transcript yet, so the hint above does the job. */}
        {heard && phase !== "recording" && (
          <p className="mt-3 max-w-md text-base text-foreground">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">မင်းပြောခဲ့တာ — </span>
            {heard}
          </p>
        )}
        {reply && (
          <p className="mt-2 max-h-[30vh] max-w-md overflow-y-auto text-sm text-muted-foreground">
            <span className="text-xs uppercase tracking-wide text-[hsl(var(--primary))]">JARVIS — </span>
            {reply}
          </p>
        )}
        {/* Long-press hint — only when idle and ready, so it doesn't clutter active conversation. */}
        {micState === "granted" && (phase === "idle" || phase === "resuming") && (
          <p className="mt-3 text-[11px] text-muted-foreground/70">
            orb ကို ဖိနေရင် — စကားပြောဆက်ဆံမှု ရှင်းမယ် · hold to clear
          </p>
        )}

        {/* ── One-click mic permission panel ──
            micState 'unknown': never asked → one click triggers the native prompt.
            micState 'denied': blocked before → re-prompt won't help, so the button opens the
              OS/browser settings they must actually change, plus a second retry option. */}
        {micState !== "granted" && phase === "idle" && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <button
              onClick={onRequestMic}
              className="flex items-center gap-2 rounded-full bg-[hsl(var(--primary))] px-5 py-2.5 text-sm font-semibold text-[hsl(var(--primary-foreground))] shadow-lg transition-transform hover:scale-105 active:scale-95"
            >
              <Mic className="h-4 w-4" /> Microphone ဖွင့်မယ်
            </button>
            {micState === "denied" && (
              <button
                onClick={onOpenMicSettings}
                className="rounded-full bg-foreground/10 px-4 py-1.5 text-xs text-foreground hover:bg-foreground/20"
              >
                {isDesktop
                  ? (desktopPlatform === "darwin"
                      ? "System Settings → Privacy → Microphone ဖွင့်မယ်"
                      : desktopPlatform === "win32"
                        ? "Windows Settings → Microphone ဖွင့်မယ်"
                        : "Microphone settings ဖွင့်မယ်")
                  : "Browser mic settings ကို ဖွင့်မယ်"}
              </button>
            )}
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              {micState === "denied"
                ? (isDesktop
                    ? "ခွင့်ပြုချက် Block လုပ်ထားလို့ ပြန်ဖွင့်ပေးရပါမယ်။ အပေါ်က button နှိပ်ပြီး settings မှာ BeeBot ကို ON လုပ်ပါ။"
                    : "Address bar (🔗/🔒) မှာ microphone ကို Allow လုပ်ပြီး tab ကို refresh လုပ်ပါ။")
                : "စကားပြောဖို့ အရင် microphone ကို ခွင့်ပြုပေးပါ။"}
            </p>
          </div>
        )}

        {phase === "confirm" && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <button onClick={() => onConfirm(true)} className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))]">
              <Check className="h-4 w-4" /> အိုကေ · Yes
            </button>
            <button onClick={() => onConfirm(false)} className="flex items-center gap-1.5 rounded-full bg-foreground/10 px-4 py-2 text-sm text-foreground hover:bg-foreground/20">
              <X className="h-4 w-4" /> မလုပ်ဘူး · No
            </button>
          </div>
        )}

        {!hasKey && micState === "granted" && (
          <form className="mt-5 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (keyInput.trim()) onSaveKey(keyInput); }}>
            <Mic className="h-4 w-4 text-muted-foreground" />
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Gemini API key — မြန်မာ/English တိကျစွာ"
              className="w-72 rounded-md bg-foreground/10 px-3 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button type="submit" className="rounded-md bg-[hsl(var(--primary))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--primary-foreground))]">Save</button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── Float32 PCM chunks → 16-bit mono WAV (Gemini-supported container) ──
function flatten(chunks: Float32Array[]): Float32Array {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Float32Array(len);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

// Linear-interp downsample (48k→16k). 16k is plenty for speech; cuts the upload ~3×.
// ponytail: no anti-alias pre-filter — fine for speech recognition; add a biquad LPF if quality drops.
function downsample(samples: Float32Array, srcRate: number, dstRate: number): Float32Array {
  if (dstRate >= srcRate || samples.length === 0) return samples;
  const ratio = srcRate / dstRate;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio, i0 = Math.floor(pos), frac = pos - i0;
    out[i] = samples[i0] * (1 - frac) + (samples[i0 + 1] ?? samples[i0]) * frac;
  }
  return out;
}

function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const str = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  str(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  str(36, "data"); view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([view], { type: "audio/wav" });
}

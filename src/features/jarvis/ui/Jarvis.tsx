import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X, Sparkles, Check, Mic } from "lucide-react";
import { toast } from "sonner";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useEvVoice } from "./useJarvisVoice";
import { getSavedVoiceLanguage } from "@/components/agent-chat/chat-input/VoiceInput";
import { geminiKey, jarvisEnabled, jarvisWakeWord, isWakePhrase, type Intent } from "../services/brain";
import { createTurnAudioSession, type TurnAudioSession } from "../audio/capture";
import { createVoiceTurnJournal } from "../services/journal";
import {
  createVoicePipelineEngine,
  type VoicePipelineEngine,
  type EnginePhase,
} from "../core/engine";
import { compactVoiceActionHistory, voiceStateLabel, type VoiceActionHistoryItem, type VoiceActionStatus, type VoiceMode, type VoiceSkill } from "../core/commands";
import { EvSpeechOrb } from "@/features/ev-voice/ui/EvSpeechOrb";
import type { EvFunctionDeclaration, EvToolPreview, EvToolResult } from "@/features/ev-voice/workspace/contracts";
import { createEvConversationMemory } from "@/features/ev-voice/memory/memoryService";
import { currentGeminiLiveSession, GeminiLiveClient } from "../services/geminiLive";

// Jarvis.tsx is now a thin ADAPTER over the VoicePipelineEngine (see CONTEXT.md): the whole
// conversation state machine — phases, VAD policy, cooldown/echo-guard — lives in
// voicePipelineEngine.ts where it's covered by fake-port tests. This file keeps only what is
// inherently browser/UI:
//   · mic permission flow (getUserMedia + OS/browser guidance)
//   · the Web Audio graph (stream → source → analyser) and the capture adapter over it
//   · wake word + offline Web Speech recognizers
//   · the orb canvas, overlay, key form — pure rendering of the engine snapshot

type Phase = EnginePhase;

// ponytail: distinguish a FIRST-TIME prompt (browser hasn't decided yet) from a HARD denial
// (user clicked "Block" before, or macOS system setting is off). On hard denial, getUserMedia
// keeps rejecting instantly — re-prompting does nothing, so we must route the user to settings.
type MicState = "unknown" | "granted" | "denied";
type DesktopBridge = { platform?: string; openMicSettings?: () => void };

interface Brain {
  understandAudio: (audio: Blob, signal?: AbortSignal) => Promise<Intent>;
  understandText: (text: string, signal?: AbortSignal) => Promise<Intent>;
  execAction: (action: Intent["action"], title?: string, intent?: Intent) => Promise<unknown>;
  offline: (text: string) => Promise<string>;
  reset?: () => void; // clear conversation history (on close)
  cancelAction?: () => Promise<void> | void;
  cancelForegroundAction?: () => Promise<void> | void;
  cancelExecution?: (executionId: string) => Promise<void> | void;
  toolDeclarations?: EvFunctionDeclaration[];
  execTool?: (
    name: string,
    args: Record<string, unknown>,
    context: { userTranscript: string; signal?: AbortSignal; approved?: boolean; idempotencyKey?: string; preview?: EvToolPreview; executionId?: string; interruptibility?: "foreground" | "background"; startedAt?: number },
  ) => Promise<EvToolResult<unknown> | Record<string, unknown>>;
  previewTool?: (
    name: string,
    args: Record<string, unknown>,
    context: { userTranscript: string; signal?: AbortSignal },
  ) => Promise<EvToolPreview | null>;
}

interface JarvisProps { brain: Brain; }

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Tap to speak",
  connecting: "E.V ကို ချိတ်ဆက်နေပါတယ်… · Connecting…",
  recording: "Listening…",
  listening: "Listening…",
  thinking: "စဉ်းစားနေပါတယ်… · Thinking…",
  confirm: "အတည်ပြုပါ · Confirm?",
  running_skill: "Skill လုပ်နေပါတယ်… · Running Skill…",
  speaking: "ပြောနေပါတယ်… · Speaking…",
  resuming: "ပြန်စနေပါပြီ… · Resuming…",
};

export function EvVoiceAssistant({ brain }: JarvisProps) {
  const [enabled, setEnabled] = useState(() => jarvisEnabled.get());
  const [open, setOpen] = useState(false);
  const [micState, setMicState] = useState<MicState>("unknown");
  const [hasKey, setHasKey] = useState(() => !!geminiKey.get());

  useEffect(() => {
    const sync = () => setHasKey(Boolean(geminiKey.get()));
    window.addEventListener(geminiKey.EVENT, sync);
    void geminiKey.refresh().then(setHasKey).catch(() => setHasKey(false));
    return () => window.removeEventListener(geminiKey.EVENT, sync);
  }, []);

  const { speak, stop: stopSpeak, unlock: unlockSpeech } = useEvVoice();

  // Is this running inside the BeeBot desktop (Electron) shell? Drives the guidance we show
  // when the mic is blocked: in-browser we open the site's per-origin permission; in desktop
  // we point at macOS System Settings → Privacy → Microphone.
  const desktopBridge = typeof window !== "undefined"
    ? (window as Window & { beebotDesktop?: DesktopBridge }).beebotDesktop
    : undefined;
  const isDesktop = !!desktopBridge;
  const desktopPlatform = desktopBridge?.platform || "";

  // ── Turn-based mic session — the shared adapter in pcmCapture.ts owns the whole Web Audio
  // graph (mic policy, worklet, analyser, teardown); this component only decides WHEN via the
  // permission flow, and reads the analyser for the orb visualizer.
  const audioRef = useRef<TurnAudioSession | null>(null);
  if (!audioRef.current) audioRef.current = createTurnAudioSession();
  const audio = audioRef.current;
  const getAnalyser = useCallback(() => audioRef.current?.analyser() ?? null, []);
  const sessionGenerationRef = useRef(0);
  const journalRef = useRef<ReturnType<typeof createVoiceTurnJournal> | null>(null);
  if (!journalRef.current) journalRef.current = createVoiceTurnJournal();
  const memoryRef = useRef<ReturnType<typeof createEvConversationMemory> | null>(null);
  if (!memoryRef.current) memoryRef.current = createEvConversationMemory();

  // Ref mirrors so the engine's stable dependency closures always read the latest values.
  const micStateRef = useRef<MicState>(micState);
  micStateRef.current = micState;
  const openRef = useRef(open);
  openRef.current = open;
  const brainRef = useRef(brain);
  brainRef.current = brain;
  const speakRef = useRef(speak);
  speakRef.current = speak;
  const stopSpeakRef = useRef(stopSpeak);
  stopSpeakRef.current = stopSpeak;

  // ── No-key fallback recognizer (Web Speech) — engine drives it via the offline dep ──
  const recognition = useSpeechRecognition({
    language: getSavedVoiceLanguage(),
    continuous: false,
    interimResults: true,
    onResult: (text, isFinal) => {
      const engine = engineRef.current;
      if (!engine) return;
      if (geminiKey.get()) engine.voiceTranscript(text, isFinal);
      else engine.offlineTranscript(text, isFinal);
    },
  });
  const recognitionRef = useRef(recognition);
  recognitionRef.current = recognition;

  // ── The engine (created once; every dependency reads through refs so it never goes stale) ──
  const engineRef = useRef<VoicePipelineEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = createVoicePipelineEngine({
      brain: {
        understandAudio: (wav, signal) => brainRef.current.understandAudio(wav, signal),
        understandText: (text, signal) => brainRef.current.understandText(text, signal),
        execAction: (action, title, intent) => brainRef.current.execAction(action as Intent["action"], title, intent as Intent),
        offline: (text) => brainRef.current.offline(text),
        reset: () => brainRef.current.reset?.(),
        cancelAction: () => brainRef.current.cancelAction?.(),
        cancelForegroundAction: () => brainRef.current.cancelForegroundAction?.(),
        cancelExecution: (executionId: string) => brainRef.current.cancelExecution?.(executionId),
        get toolDeclarations() { return brainRef.current.toolDeclarations; },
        execTool: (name, args, context) => {
          if (!brainRef.current.execTool) throw new Error(`E.V tool unavailable: ${name}`);
          return brainRef.current.execTool(name, args, context);
        },
        previewTool: (name, args, context) => brainRef.current.previewTool?.(name, args, context) || Promise.resolve(null),
      },
      speech: {
        speak: (text, cb) => speakRef.current(text, cb),
        stop: () => stopSpeakRef.current(),
      },
      capture: audio, // TurnAudioSession structurally satisfies the engine's capture dependency
      offline: {
        start: () => recognitionRef.current.start(),
        stop: () => recognitionRef.current.stop(),
        isListening: () => recognitionRef.current.isListening,
      },
      // Browser SpeechRecognition (the text-first fast path) is Google-gated and does NOT work in
      // the Electron desktop build — it only errors, while still spinning up a SECOND mic consumer
      // alongside the TurnAudioSession every recording (a prime suspect for the VAD reading garbage
      // energy → never detecting end-of-speech → recording the full cap → a 20s clip to Gemini).
      // So in desktop we don't wire it at all: the mic has exactly one owner. In a browser it works.
      textInput: isDesktop ? undefined : {
        start: () => recognitionRef.current.start(),
        stop: () => recognitionRef.current.stop(),
      },
      hasKey: () => !!geminiKey.get(),
      canRecord: () => openRef.current && micStateRef.current === "granted" && !!geminiKey.get(),
      notify: (message, description) =>
        description ? toast.message(message, { description }) : toast.success(message),
      journal: journalRef.current,
      memory: memoryRef.current,
      liveClientFactory: (callbacks) => new GeminiLiveClient(callbacks),
      liveSession: currentGeminiLiveSession,
    });
  }
  const engine = engineRef.current;

  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const { phase, heard, reply, heardVoice, mode, intent, skill, confidence, actionStatus, actionHistory, firstAudioLatencyMs, firstTranscriptLatencyMs, transcriptToFirstAudioLatencyMs, inputActivity, preparedIntent, operationLabel, evidenceCount, grounded, reasoningLevel, reasoningRoute, reasoningScore, verification, liveTranslation } = snapshot;
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;

  // ── Wake word (opt-in) ── while the orb is CLOSED, the browser recognizer listens for
  // "Jarvis" and opens it. ponytail: reuses Web Speech (zero deps); it auto-stops, so we
  // restart on end. Runs only when JARVIS is enabled + wake is on + the orb is closed, so
  // it never fights the main mic. Ceiling: cloud STT battery/privacy → on-device wake later.
  const [wakeOn, setWakeOn] = useState(() => jarvisWakeWord.get());
  useEffect(() => {
    const sync = () => setWakeOn(jarvisWakeWord.get());
    window.addEventListener(jarvisWakeWord.EVENT, sync);
    return () => window.removeEventListener(jarvisWakeWord.EVENT, sync);
  }, []);
  const shouldWakeRef = useRef(false);
  const wakeStartRef = useRef<() => void>(() => {});
  const wake = useSpeechRecognition({
    language: "en-US",
    continuous: true,
    interimResults: false,
    onResult: (text, isFinal) => { if (isFinal && isWakePhrase(text)) setOpen(true); },
    onEnd: () => { if (shouldWakeRef.current) setTimeout(() => wakeStartRef.current(), 400); },
  });
  wakeStartRef.current = wake.start;
  useEffect(() => {
    const should = wakeOn && enabled && !open;
    shouldWakeRef.current = should;
    if (should) wake.start(); else wake.stop();
    return () => { shouldWakeRef.current = false; wake.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wakeOn, enabled, open]);

  // Route the user to the RIGHT settings UI for their environment.
  const openMicSettings = useCallback(() => {
    if (isDesktop) {
      // The renderer can't open a custom-scheme URL (nav guard allows only http/https), so the
      // main process opens the OS mic-privacy pane via shell.openExternal. One click → Settings.
      desktopBridge?.openMicSettings?.();
      return;
    }
    const origin = typeof location !== "undefined" ? location.origin : "";
    toast.info("Address bar → 🎤 / lock icon → Allow microphone, then this tab will reload.", {
      description: origin,
      duration: 6000,
    });
  }, [desktopBridge, isDesktop]);

  // ── Mic acquisition = the permission gate ──
  // One click here is the ENTIRE permission flow: it calls getUserMedia, which (now that the
  // Electron allow-list includes 'media') triggers the native macOS / browser mic prompt. On
  // success we wire the audio graph and hand the loop to the engine; on failure we mark
  // 'denied' and the UI shows how to fix. navigator.permissions lets us skip re-prompting.
  const startSession = useCallback(async () => {
    const generation = ++sessionGenerationRef.current;
    // Warm the independent output context while mic permission and Live setup
    // proceed. This removes the first-reply AudioContext startup from the hot path.
    void unlockSpeech().catch(() => {});
    try {
      const status = await navigator.permissions?.query?.({ name: "microphone" as PermissionName });
      if (generation !== sessionGenerationRef.current || !openRef.current) return;
      if (status?.state === "granted") setMicState("granted");
      else if (status?.state === "denied") setMicState("denied");
    } catch { /* Safari/older browsers don't implement mic in Permissions API — fine */ }

    try {
      // The session adapter owns the graph + mic policy (MIC_CONSTRAINTS in pcmCapture.ts) —
      // this call is exactly where the native permission prompt fires.
      await audio.acquire();
      if (generation !== sessionGenerationRef.current || !openRef.current || !audio.ready()) return;
      setMicState("granted");
      engine.micReady(); // hands-free: the engine starts listening immediately (or idles if no key)
    } catch (err: unknown) {
      if (generation !== sessionGenerationRef.current || !openRef.current) return;
      setMicState("denied");
      console.error("[E.V] mic permission denied:", err instanceof Error ? err.name : err);
    }
  }, [audio, engine, unlockSpeech]);

  // One-click "Enable Microphone": re-attempt the prompt. If the OS/browser has already BLOCKED
  // the origin, getUserMedia will reject again immediately — in that case open the settings the
  // user actually needs to change. (The prompt cannot be re-shown once hard-denied.)
  const requestMic = useCallback(async () => {
    if (micState === "granted") return;
    await startSession();
    if (micStateRef.current !== "granted") openMicSettings();
  }, [micState, openMicSettings, startSession]);

  // React-owned audio teardown (the engine's stop() handles everything it owns).
  const teardownAudio = useCallback(() => {
    sessionGenerationRef.current++;
    audioRef.current?.release();
    setMicState("unknown");
  }, []);

  const close = useCallback(() => { setOpen(false); }, []);

  useEffect(() => {
    if (!open) return;
    void startSession(); // → getUserMedia → engine.micReady() starts the first listen
    return () => {
      engine.stop();     // keeps heard/reply — context persists across open/close by design
      teardownAudio();
    };
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

  useEffect(() => {
    const openEv = () => {
      if (!jarvisEnabled.get()) return;
      // Workspace/mobile E.V buttons dispatch this event synchronously from a
      // user gesture, so use that gesture to unlock playback before Live audio.
      void unlockSpeech().catch(() => {});
      setOpen(true);
    };
    window.addEventListener("beebot:ev-open", openEv);
    return () => window.removeEventListener("beebot:ev-open", openEv);
  }, [unlockSpeech]);

  // ⌘J / Ctrl+J toggle; Esc closes. (No-op while disabled.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!jarvisEnabled.get()) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        if (!openRef.current) void unlockSpeech().catch(() => {});
        setOpen((v) => !v);
      }
      else if (e.key === "Escape" && open) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, unlockSpeech]);

  if (!enabled) return null; // OFF by default — no launcher; ⌘J handler is gated above

  return (
    <>
      <button
        aria-label="Open E.V voice assistant (⌘J)"
        onClick={() => {
          void unlockSpeech().catch(() => {});
          setOpen(true);
        }}
        className="jarvis-launcher ev-launcher fixed bottom-5 right-5 z-[60] flex h-12 w-12 items-center justify-center"
      >
        <Sparkles className="h-5 w-5" />
      </button>

      {open && (
        <JarvisOverlay
          phase={phase}
          heard={heard}
          heardVoice={heardVoice}
          reply={reply}
          mode={mode}
          intent={intent}
          skill={skill}
          confidence={confidence}
          actionStatus={actionStatus}
          actionHistory={actionHistory}
          firstAudioLatencyMs={firstAudioLatencyMs}
          firstTranscriptLatencyMs={firstTranscriptLatencyMs}
          transcriptToFirstAudioLatencyMs={transcriptToFirstAudioLatencyMs}
          inputActivity={inputActivity}
          preparedIntent={preparedIntent}
          operationLabel={operationLabel}
          evidenceCount={evidenceCount}
          grounded={grounded}
          reasoningLevel={reasoningLevel}
          reasoningRoute={reasoningRoute}
          reasoningScore={reasoningScore}
          verification={verification}
          liveTranslation={liveTranslation}
          micState={micState}
          isDesktop={isDesktop}
          desktopPlatform={desktopPlatform}
          hasKey={hasKey}
          onSaveKey={(k) => { geminiKey.set(k); setHasKey(true); }}
          getAnalyser={getAnalyser}
          phaseRef={phaseRef}
          onClose={close}
          onOrbTap={() => {
            // AudioContext.resume() must begin inside the user's tap gesture in
            // browsers and hardened Electron sessions. Connection can proceed in
            // parallel; incoming PCM remains serialized by the playback adapter.
            void unlockSpeech().catch(() => {});
            engine.tapOrb();
          }}
          onConfirm={(ok) => void engine.confirm(ok)}
          onRequestMic={requestMic}
          onOpenMicSettings={openMicSettings}
          onClearConversation={() => engine.clearConversation()}
        />
      )}
    </>
  );
}

export const Jarvis = EvVoiceAssistant;

function JarvisOverlay({
  phase, heard, heardVoice, reply, mode, intent, skill, confidence, actionStatus, actionHistory, firstAudioLatencyMs, firstTranscriptLatencyMs, transcriptToFirstAudioLatencyMs, inputActivity, preparedIntent, operationLabel, evidenceCount, grounded, reasoningLevel, reasoningRoute, reasoningScore, verification, liveTranslation, micState, isDesktop, desktopPlatform, hasKey, onSaveKey, getAnalyser, phaseRef, onClose, onOrbTap, onConfirm, onRequestMic, onOpenMicSettings, onClearConversation,
}: {
  phase: Phase;
  heard: string;
  heardVoice: boolean;
  reply: string;
  mode: VoiceMode;
  intent: string;
  skill: VoiceSkill;
  confidence: number;
  actionStatus: VoiceActionStatus;
  actionHistory: VoiceActionHistoryItem[];
  firstAudioLatencyMs: number | null;
  firstTranscriptLatencyMs: number | null;
  transcriptToFirstAudioLatencyMs: number | null;
  inputActivity: "idle" | "speech" | "settling";
  preparedIntent: string | null;
  operationLabel: string | null;
  evidenceCount: number;
  grounded: boolean;
  reasoningLevel: "minimal" | "low" | "medium" | "high" | "dynamic";
  reasoningRoute: "local" | "live" | "operator";
  reasoningScore: number;
  verification: "not_required" | "pending" | "verified" | "failed";
  liveTranslation: import("@/features/ev-voice/protocols").EvLiveTranslationState;
  micState: MicState;
  isDesktop: boolean;
  desktopPlatform: string;
  hasKey: boolean;
  onSaveKey: (k: string) => void;
  getAnalyser: () => AnalyserNode | null;
  phaseRef: React.MutableRefObject<Phase>;
  onClose: () => void;
  onOrbTap: () => void;
  onConfirm: (ok: boolean) => void;
  onRequestMic: () => void;
  onOpenMicSettings: () => void;
  onClearConversation: () => void;
}) {
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

  const statusTone = phase === "thinking" || phase === "running_skill"
    ? "warning"
    : phase === "speaking" || phase === "recording"
      ? "success"
      : "info";
  const stateText = liveTranslation.active
    ? `Live translating to ${liveTranslation.targetLanguageName}`
    : micState === "denied"
    ? "Microphone ခွင့်ပြုချက် လိုပါတယ်"
    : micState === "unknown"
      ? "Microphone ဖွင့်ပါ — တစ်ချက်နှိပ်ပါ"
      : phase === "recording"
        ? (heardVoice ? "Voice detected · keep speaking, or tap to stop" : "Listening…")
        : phase === "thinking"
          ? "စဉ်းစားနေပါတယ်… · Understanding"
          : PHASE_LABEL[phase];

  // The backdrop does NOT close on click (ponytail UX fix: clicking the orb was closing JARVIS).
  // Close ONLY via the X button or Esc — matches a modal, not a popover. The translucent backdrop
  // is purely visual; tapping anywhere outside the orb is a no-op.
  return createPortal(
    <div className="ev-voice-root fixed inset-0 z-[100] overflow-y-auto" data-phase={phase} data-mic-state={micState} data-live-translation={liveTranslation.active ? "active" : "off"}>
      <main className="ev-voice-console" aria-label="E.V voice assistant">
        <header className="ev-voice-header">
          <div className="ev-voice-identity">
            <span className="ev-voice-mark" aria-hidden="true">EV</span>
            <div className="min-w-0">
              <div className="fui-status" data-status={statusTone}>
                <span className="fui-status-dot" />
                {liveTranslation.active ? `Live Translate · ${liveTranslation.targetLanguageName}` : "E.V voice operations"}
              </div>
            </div>
          </div>
          <button aria-label="Close E.V" onClick={onClose} className="ev-voice-close">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="ev-voice-workspace">
          <section className="ev-voice-stage fui-panel" data-fui-panel="primary">
            <div className="ev-voice-stage-meta" aria-hidden="true">
              <span>Core / adaptive voice field</span>
              <span>{phase.replace("_", " ")}</span>
            </div>
            <EvSpeechOrb
              phase={phase}
              heardVoice={heardVoice}
              getAnalyser={getAnalyser}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerLeave={() => { if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; } heldRef.current = true; }}
            />
            <div className="ev-voice-core-readouts" aria-hidden="true">
              <div><span>Input channel</span><strong>{micState}</strong></div>
              <div><span>Output channel</span><strong>{phase}</strong></div>
            </div>
            <div className="ev-voice-stage-footer" aria-hidden="true">
              <span>Hold / clear session</span>
            </div>
          </section>

          <section className="ev-voice-content" onClick={(e) => e.stopPropagation()}>
          <div className="ev-voice-phase fui-panel" data-fui-panel="quiet">
            <div className="ev-voice-panel-heading">
              <span className="fui-label">Active state</span>
              <span className="ev-voice-phase-code">{phase}</span>
            </div>
            <p className="ev-voice-phase-text">{stateText}</p>
          </div>
        {(inputActivity !== "idle" || heard) && (
          <div className="ev-voice-transcript fui-panel" data-fui-panel="quiet">
            <div className="ev-voice-panel-heading">
              <span className="fui-label">{heard ? "Input captured" : "Input stream"}</span>
              <span className="ev-voice-phase-code">{heard ? "live" : inputActivity}</span>
            </div>
            <p className="ev-voice-copy" aria-live="polite">
              {heard || "အသံကို တိုက်ရိုက် လက်ခံနေပါတယ်…"}
            </p>
            {preparedIntent && <div className="fui-detail">Preparing {preparedIntent} · execution waits for final evidence</div>}
          </div>
        )}
        {reply && (
          <div className="ev-voice-reply fui-panel" data-fui-panel="primary">
            <span className="fui-label">E.V response</span>
            <p className="ev-voice-copy">{reply}</p>
          </div>
        )}
          <div className="ev-voice-trust-strip fui-panel" data-fui-panel="quiet">
            {operationLabel && (
              <div className="ev-voice-trust-operation">
                <div className="fui-label">Operation</div>
                <div className="fui-metric">{operationLabel}</div>
              </div>
            )}
            <div>
              <div className="fui-label">{liveTranslation.active ? "Protocol" : "Reasoning"}</div>
              <div className="fui-metric">{liveTranslation.active ? "Gemini 3.5 Live Translate" : `${reasoningLevel} · ${reasoningRoute}`}</div>
              <div className="fui-detail">
                {liveTranslation.active
                  ? `Audio only · target ${liveTranslation.targetLanguageCode}`
                  : firstAudioLatencyMs === null
                  ? `Demand ${reasoningScore}`
                  : `Voice ${Math.round(firstAudioLatencyMs)}ms · input ${Math.round(firstTranscriptLatencyMs || 0)}ms · response ${Math.round(transcriptToFirstAudioLatencyMs || 0)}ms`}
              </div>
            </div>
            <div>
              <div className="fui-label">Evidence</div>
              <div className="fui-metric" data-verification={verification}>
                {verification === "verified" ? `Verified · ${evidenceCount}` : verification.replace("_", " ")}
              </div>
            </div>
            <div>
              <div className="fui-label">Writes</div>
              <div className="fui-metric">Approval gated</div>
            </div>
            <div>
              <div className="fui-label">Execution</div>
              <div className="fui-metric">{voiceStateLabel(actionStatus, phase)}</div>
            </div>
          </div>
          <div className="ev-voice-context-line" aria-label="E.V routing context">
            <span>Intent <b>{intent}</b></span>
            <span>Skill <b>{skill}</b></span>
            <span>Mode <b>{mode} · {Math.round(confidence * 100)}%</b></span>
            <span>Grounding <b>{grounded ? "verified" : verification.replace("_", " ")}</b></span>
            </div>
        {actionHistory.length > 0 && (
          <div className="ev-voice-history fui-panel" data-fui-panel="quiet">
            <div className="fui-label">Action journal</div>
            <div className="ev-voice-history-list">
              {compactVoiceActionHistory(actionHistory).slice(0, 4).map((item) => (
                <div key={item.id} data-status={item.status}>
                  <span className="min-w-0 truncate">{item.result}</span>
                  <span>{item.status.replaceAll("_", " ")}{item.occurrences > 1 ? ` x${item.occurrences}` : ""}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Long-press hint — only when idle and ready, so it doesn't clutter active conversation. */}
        {micState === "granted" && (phase === "idle" || phase === "resuming") && (
          <p className="ev-voice-hint">
            orb ကို ဖိနေရင် — စကားပြောဆက်ဆံမှု ရှင်းမယ် · hold to clear
          </p>
        )}

        {/* ── One-click mic permission panel ──
            micState 'unknown': never asked → one click triggers the native prompt.
            micState 'denied': blocked before → re-prompt won't help, so the button opens the
              OS/browser settings they must actually change, plus a second retry option. */}
        {micState !== "granted" && phase === "idle" && (
          <div className="ev-voice-permission fui-panel" data-fui-panel="quiet">
            <button
              onClick={onRequestMic}
              className="ev-voice-primary-action"
            >
              <Mic className="h-4 w-4" /> Microphone ဖွင့်မယ်
            </button>
            {micState === "denied" && (
              <button
                onClick={onOpenMicSettings}
                className="ev-voice-secondary-action"
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
            <p className="ev-voice-permission-copy">
              {micState === "denied"
                ? (isDesktop
                    ? "ခွင့်ပြုချက် Block လုပ်ထားလို့ ပြန်ဖွင့်ပေးရပါမယ်။ အပေါ်က button နှိပ်ပြီး settings မှာ BeeBot ကို ON လုပ်ပါ။"
                    : "Address bar (🔗/🔒) မှာ microphone ကို Allow လုပ်ပြီး tab ကို refresh လုပ်ပါ။")
                : "စကားပြောဖို့ အရင် microphone ကို ခွင့်ပြုပေးပါ။"}
            </p>
          </div>
        )}

        {phase === "confirm" && (
          <div className="ev-voice-confirm-dialog fui-panel" data-fui-panel="strong" role="dialog" aria-modal="true" aria-labelledby="ev-confirm-title">
            <div className="ev-voice-confirm-copy">
              <span className="fui-label">Action approval</span>
              <strong id="ev-confirm-title">{reply || `Confirm ${intent}?`}</strong>
              <span>{intent.replaceAll("_", " ")} · {skill.replaceAll("_", " ")}</span>
            </div>
            <div className="ev-voice-confirm">
              <button autoFocus onClick={() => onConfirm(true)} className="ev-voice-primary-action">
                <Check className="h-4 w-4" /> အတည်ပြု · Approve
              </button>
              <button onClick={() => onConfirm(false)} className="ev-voice-secondary-action">
                <X className="h-4 w-4" /> ငြင်းပယ် · Deny
              </button>
            </div>
          </div>
        )}

        {!hasKey && micState === "granted" && (
          <form className="ev-voice-key-form fui-panel" data-fui-panel="quiet" onSubmit={(e) => { e.preventDefault(); if (keyInput.trim()) onSaveKey(keyInput); }}>
            <Mic className="h-4 w-4 text-muted-foreground" />
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Gemini API key — မြန်မာ/English တိကျစွာ"
              className="ev-voice-key-input"
            />
            <button type="submit" className="ev-voice-primary-action">Save</button>
          </form>
        )}
          </section>
        </div>

      </main>
    </div>,
    document.body,
  );
}

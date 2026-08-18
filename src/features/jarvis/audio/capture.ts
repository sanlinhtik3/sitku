import type { AudioCapturePort } from "./ports";

// 1024 samples at the usual 48 kHz input rate is ~21.3 ms. Small, steady chunks
// let Gemini Live transcribe and detect turns incrementally without a local buffer.
export const LIVE_PCM_CHUNK_SAMPLES = 1024;

const WORKLET_CODE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(${LIVE_PCM_CHUNK_SAMPLES});
    this.off = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0 && input[0]) {
      const ch = input[0];
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.off++] = ch[i];
        if (this.off >= ${LIVE_PCM_CHUNK_SAMPLES}) {
          this.port.postMessage(new Float32Array(this.buf));
          this.off = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture', PcmCaptureProcessor);
`;

let workletUrl: string | null = null;

export type AudioCaptureNode = (AudioWorkletNode | ScriptProcessorNode) & {
  cleanup?: () => void;
};

function audioContextConstructor(): typeof AudioContext {
  const Ctx = window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("Web Audio is unavailable");
  return Ctx;
}

/**
 * Creates an audio capture node using AudioWorkletNode (modern, non-blocking)
 * with automatic fallback to ScriptProcessorNode if unsupported or fails.
 */
export async function createPcmCaptureNode(
  ctx: AudioContext,
  onChunk: (chunk: Float32Array) => void,
): Promise<AudioCaptureNode> {
  if (!workletUrl && typeof URL !== "undefined") {
    workletUrl = URL.createObjectURL(
      new Blob([WORKLET_CODE], { type: "application/javascript" }),
    );
  }

  try {
    if (ctx.audioWorklet && workletUrl) {
      await ctx.audioWorklet.addModule(workletUrl);
      const node = new AudioWorkletNode(ctx, "pcm-capture") as AudioWorkletNode & AudioCaptureNode;
      node.port.onmessage = (e) => onChunk(e.data);
      node.cleanup = () => {
        node.port.onmessage = null;
        try { node.disconnect(); } catch { /* noop */ }
      };
      return node;
    }
  } catch (err) {
    console.warn("[PcmCapture] AudioWorklet init failed, falling back to ScriptProcessor:", err);
  }

  // Fallback for older environments
  const proc = ctx.createScriptProcessor(LIVE_PCM_CHUNK_SAMPLES, 1, 1) as ScriptProcessorNode & AudioCaptureNode;
  proc.onaudioprocess = (e) => onChunk(e.inputBuffer.getChannelData(0));
  proc.cleanup = () => {
    proc.onaudioprocess = null;
    try { proc.disconnect(); } catch { /* noop */ }
  };
  return proc;
}

// ONE mic policy for every voice mode (turn-based + Live). AEC stops the mic hearing JARVIS's
// own TTS; NS cleans ambient; AGC is OFF — it pumps the gain during pauses, which destabilizes
// the VAD's adaptive noise floor (a major cause of "it didn't hear me").
export const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: false,
};

/**
 * Creates an official AudioCapturePort adapter using Web Audio and MediaDevices.
 * Enforces autoGainControl: false across all voice modes to guarantee a stable VAD noise floor.
 */
export function createWebAudioCapturePort(): AudioCapturePort {
  let stream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let captureNode: AudioCaptureNode | null = null;
  let muteNode: GainNode | null = null;
  let srcNode: MediaStreamAudioSourceNode | null = null;

  return {
    async start(onChunk: (chunk: Float32Array, sampleRate: number) => void): Promise<void> {
      this.stop();
      stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
      const Ctx = audioContextConstructor();
      audioCtx = new Ctx();
      const currentRate = audioCtx.sampleRate;
      srcNode = audioCtx.createMediaStreamSource(stream);
      captureNode = await createPcmCaptureNode(audioCtx, (chunk) => {
        onChunk(chunk, currentRate);
      });
      muteNode = audioCtx.createGain();
      muteNode.gain.value = 1e-10; // Non-zero tiny value prevents Chrome/Safari from optimizing away the audio graph
      srcNode.connect(captureNode);
      captureNode.connect(muteNode);
      muteNode.connect(audioCtx.destination);
    },
    stop(): void {
      if (captureNode?.cleanup) captureNode.cleanup();
      else if (captureNode) {
        try { captureNode.disconnect(); } catch { /* noop */ }
      }
      captureNode = null;
      if (srcNode) {
        try { srcNode.disconnect(); } catch { /* noop */ }
        srcNode = null;
      }
      if (muteNode) {
        try { muteNode.disconnect(); } catch { /* noop */ }
        muteNode = null;
      }
      if (stream) {
        stream.getTracks().forEach((t) => tryStopTrack(t));
        stream = null;
      }
      if (audioCtx) {
        void audioCtx.close().catch(() => {});
        audioCtx = null;
      }
    },
    getSampleRate(): number {
      return audioCtx?.sampleRate || 48000;
    },
  };
}

function tryStopTrack(track: MediaStreamTrack) {
  try { track.stop(); } catch { /* noop */ }
}

/**
 * Turn-based mic session — the walkie-talkie engine's audio graph, co-located with the Live
 * capture adapter so mic policy (MIC_CONSTRAINTS), the worklet fallback, and teardown live in
 * exactly one module. Lifecycle is two-phase by design (unlike AudioCapturePort's fused start):
 * `acquire()` runs the permission prompt + builds the graph once per orb-open, then the engine
 * begins/ends capture per utterance. `energy()` feeds the engine's VAD *policy* with the avg
 * speech-band (~300–3400 Hz) analyser energy — rumble and hiss fall outside that band.
 * Structurally satisfies VoicePipelineEngine's `capture` dependency.
 */
export interface TurnAudioSession {
  /** getUserMedia + audio graph — the mic permission prompt happens here. Throws on denial. */
  acquire(): Promise<void>;
  /** Full teardown: capture node, source, analyser, tracks, context. */
  release(): void;
  ready(): boolean;
  /** Live analyser for the orb visualizer (null until acquired). */
  analyser(): AnalyserNode | null;
  begin(onChunk: (chunk: Float32Array) => void): void;
  end(): void;
  sampleRate(): number;
  energy(): number | null;
}

export function createTurnAudioSession(): TurnAudioSession {
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyserNode: AnalyserNode | null = null;
  let node: AudioCaptureNode | null = null;
  let muteNode: GainNode | null = null;
  let active = false;
  let chunkSink: ((chunk: Float32Array) => void) | null = null;
  let spec: Uint8Array<ArrayBuffer> | null = null;
  let acquireGeneration = 0;
  let acquirePromise: Promise<void> | null = null;

  const endCapture = () => {
    active = false;
    chunkSink = null;
  };

  return {
    async acquire() {
      if (stream && ctx) return; // already up (retry after a grant is a no-op)
      if (acquirePromise) return acquirePromise;
      const generation = ++acquireGeneration;
      const pending = (async () => {
        const nextStream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
        if (generation !== acquireGeneration) { nextStream.getTracks().forEach(tryStopTrack); return; }
        const Ctx = audioContextConstructor();
        const nextCtx = new Ctx();
        await nextCtx.resume().catch(() => {});
        if (generation !== acquireGeneration) {
          nextStream.getTracks().forEach(tryStopTrack);
          await nextCtx.close().catch(() => {});
          return;
        }
        const nextSource = nextCtx.createMediaStreamSource(nextStream);
        const nextAnalyser = nextCtx.createAnalyser();
        nextAnalyser.fftSize = 1024;              // finer bins → the VAD can isolate the speech band
        nextAnalyser.smoothingTimeConstant = 0.4; // steadies the VAD without lagging speech onset
        nextSource.connect(nextAnalyser);

        // Warm the recorder before `acquire()` resolves. Previously begin() created this node in
        // the background while VAD was already listening, so a short first utterance could finish
        // before any PCM reached the WAV encoder and Gemini correctly returned an empty transcript.
        const nextNode = await createPcmCaptureNode(nextCtx, (chunk) => {
          if (active) chunkSink?.(chunk);
        });
        const nextMute = nextCtx.createGain();
        nextMute.gain.value = 1e-10;
        nextSource.connect(nextNode);
        nextNode.connect(nextMute);
        nextMute.connect(nextCtx.destination);
        if (generation !== acquireGeneration) {
          nextNode.cleanup?.();
          try { nextSource.disconnect(); } catch { /* noop */ }
          try { nextNode.disconnect(); } catch { /* noop */ }
          try { nextMute.disconnect(); } catch { /* noop */ }
          nextStream.getTracks().forEach(tryStopTrack);
          await nextCtx.close().catch(() => {});
          return;
        }
        stream = nextStream;
        ctx = nextCtx;
        source = nextSource;
        analyserNode = nextAnalyser;
        node = nextNode;
        muteNode = nextMute;
      })();
      acquirePromise = pending;
      try { await pending; }
      finally { if (acquirePromise === pending) acquirePromise = null; }
    },
    release() {
      acquireGeneration++;
      acquirePromise = null;
      endCapture();
      if (source && node) { try { source.disconnect(node); } catch { /* noop */ } }
      if (node?.cleanup) node.cleanup();
      else if (node) { try { node.disconnect(); } catch { /* noop */ } }
      node = null;
      if (muteNode) { try { muteNode.disconnect(); } catch { /* noop */ } muteNode = null; }
      stream?.getTracks().forEach(tryStopTrack);
      stream = null;
      if (source) { try { source.disconnect(); } catch { /* noop */ } source = null; }
      analyserNode = null;
      if (ctx) { void ctx.close().catch(() => {}); ctx = null; }
    },
    ready: () => !!(ctx && source && analyserNode && node),
    analyser: () => analyserNode,
    begin(onChunk) {
      if (!ctx || !source || !node) return;
      endCapture();
      active = true;
      chunkSink = onChunk;
      void ctx.resume().catch(() => {});
    },
    end: endCapture,
    sampleRate: () => ctx?.sampleRate ?? 48000,
    energy() {
      if (!analyserNode || !ctx) return null;
      if (!spec || spec.length !== analyserNode.frequencyBinCount) spec = new Uint8Array(analyserNode.frequencyBinCount);
      analyserNode.getByteFrequencyData(spec);
      const binHz = ctx.sampleRate / analyserNode.fftSize;
      const lo = Math.max(1, Math.floor(300 / binHz));
      const hi = Math.min(analyserNode.frequencyBinCount - 1, Math.ceil(3400 / binHz));
      let e = 0;
      for (let i = lo; i <= hi; i++) e += spec[i];
      return e / (hi - lo + 1);
    },
  };
}

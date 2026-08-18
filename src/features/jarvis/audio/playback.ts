import type { AudioPlaybackPort } from "./ports";

/**
 * Creates an official AudioPlaybackPort adapter using Web Audio.
 * Decoupled from microphone acquisition so audio playback works independently.
 * `dispose()` (beyond the port interface) closes the underlying context — for owners with a
 * real unmount lifecycle (e.g. the TTS hook); fire-and-forget users can ignore it.
 */
export function createWebAudioPlaybackPort(): AudioPlaybackPort & { whenIdle(onIdle: () => void): void; dispose(): void } {
  let audioCtx: AudioContext | null = null;
  let playHead = 0;
  let idleCallback: (() => void) | null = null;
  const sources = new Set<AudioBufferSourceNode>();

  const signalIdle = () => {
    if (sources.size || !idleCallback) return;
    const callback = idleCallback;
    idleCallback = null;
    callback();
  };

  const getCtx = () => {
    if (!audioCtx) {
      const AudioContextConstructor = window.AudioContext
        || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) throw new Error("Web Audio is unavailable");
      audioCtx = new AudioContextConstructor();
    }
    return audioCtx;
  };

  return {
    async resume(): Promise<void> {
      const ctx = getCtx();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      if (ctx.state !== "running") throw new Error(`Web Audio could not start (${ctx.state})`);
    },
    isRunning(): boolean {
      return getCtx().state === "running";
    },
    playChunk(pcm: Int16Array, sampleRate: number): number {
      const ctx = getCtx();
      if (ctx.state !== "running") throw new Error("Web Audio is not running");
      if (pcm.length === 0 || sampleRate <= 0) throw new Error("Empty PCM audio");

      const buf = ctx.createBuffer(1, pcm.length, sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) {
        ch[i] = pcm[i] / 32768;
      }

      const node = ctx.createBufferSource();
      node.buffer = buf;
      node.connect(ctx.destination);

      const now = ctx.currentTime;
      if (playHead < now) playHead = now;
      node.start(playHead);
      playHead += buf.duration;

      sources.add(node);
      node.onended = () => {
        sources.delete(node);
        signalIdle();
      };
      return buf.duration;
    },
    whenIdle(onIdle): void {
      idleCallback = onIdle;
      if (!sources.size) queueMicrotask(signalIdle);
    },
    stopAll(): void {
      idleCallback = null;
      for (const node of sources) {
        try { node.stop(); } catch { /* already stopped */ }
      }
      sources.clear();
      playHead = 0;
    },
    dispose(): void {
      this.stopAll();
      if (audioCtx) { void audioCtx.close().catch(() => {}); audioCtx = null; }
    },
  };
}

/**
 * Seam interface for acquiring audio input chunks from a microphone
 * or synthetic test source at native sample rate.
 */
export interface AudioCapturePort {
  start(onChunk: (chunk: Float32Array, sampleRate: number) => void): Promise<void>;
  stop(): void;
  getSampleRate(): number;
}

/**
 * Seam interface for scheduling and playing back PCM audio chunks
 * with gapless timing, independent of microphone acquisition.
 */
export interface AudioPlaybackPort {
  /** Schedules verified PCM and returns its audible duration in seconds. */
  playChunk(pcm: Int16Array, sampleRate: number): number;
  stopAll(): void;
  resume(): Promise<void>;
  /** Optional: is the underlying audio context actually running? (autoplay policy gate —
   *  callers skip streaming and use an autoplay-robust path when it isn't). */
  isRunning?(): boolean;
}

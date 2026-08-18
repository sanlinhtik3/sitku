export type EvInputActivity = "idle" | "speech" | "settling";

export interface SpeechActivityUpdate {
  state: EvInputActivity;
  started: boolean;
  settled: boolean;
  rms: number;
}

export interface SpeechActivityDetector {
  push(chunk: Float32Array, sampleRate: number): SpeechActivityUpdate;
  reset(): void;
}

interface SpeechActivityOptions {
  minimumRms?: number;
  noiseMultiplier?: number;
  speechCommitMs?: number;
  trailingSilenceMs?: number;
}

function rmsOf(chunk: Float32Array): number {
  if (!chunk.length) return 0;
  let sum = 0;
  for (let i = 0; i < chunk.length; i += 1) sum += chunk[i] * chunk[i];
  return Math.sqrt(sum / chunk.length);
}

/**
 * Lightweight client-side speech activity for immediate UX and latency timing.
 * Gemini remains the authoritative VAD/transcriber; this detector never commits
 * a turn or executes an action.
 */
export function createSpeechActivityDetector(options: SpeechActivityOptions = {}): SpeechActivityDetector {
  const minimumRms = options.minimumRms ?? 0.008;
  const noiseMultiplier = options.noiseMultiplier ?? 3;
  const speechCommitMs = options.speechCommitMs ?? 55;
  const trailingSilenceMs = options.trailingSilenceMs ?? EV_LIVE_TURN_TIMING.trailingSilenceMs;
  let state: EvInputActivity = "idle";
  let noiseFloor = 0.003;
  let speechMs = 0;
  let silenceMs = 0;

  return {
    push(chunk, sampleRate) {
      const rms = rmsOf(chunk);
      const durationMs = sampleRate > 0 ? (chunk.length / sampleRate) * 1_000 : 0;
      const threshold = Math.max(minimumRms, noiseFloor * noiseMultiplier);
      const voiced = rms >= threshold;
      let started = false;
      let settled = false;

      if (voiced) {
        speechMs += durationMs;
        silenceMs = 0;
        if (state !== "speech" && speechMs >= speechCommitMs) {
          state = "speech";
          started = true;
        }
      } else {
        speechMs = 0;
        noiseFloor = noiseFloor * 0.96 + Math.min(rms, minimumRms) * 0.04;
        if (state === "speech") {
          silenceMs += durationMs;
          if (silenceMs >= trailingSilenceMs) {
            state = "settling";
            settled = true;
          }
        }
      }

      return { state, started, settled, rms };
    },
    reset() {
      state = "idle";
      speechMs = 0;
      silenceMs = 0;
    },
  };
}
import { EV_LIVE_TURN_TIMING } from "@/features/ev-voice/protocols/liveVoiceProtocol";

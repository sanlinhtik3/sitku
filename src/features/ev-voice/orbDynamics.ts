export function audioRms(samples: ArrayLike<number>, scale = 1): number {
  if (!samples.length || scale <= 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const sample = Number(samples[i]) / scale;
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples.length);
}

export function normalizeVoiceLevel(rms: number, noiseFloor = 0.008): number {
  const signal = Math.max(0, rms - noiseFloor * 1.25);
  return Math.min(1, Math.sqrt(signal / 0.16));
}

export function smoothVoiceLevel(current: number, target: number): number {
  const response = target > current ? 0.34 : 0.075;
  return current + (target - current) * response;
}

const REFERENCE_BAND_EDGES = [2, 5, 9, 16, 28, 52] as const;
const REFERENCE_BIN_COUNT = 128;

/**
 * Five low-frequency bands inspired by the speech-to-speech demo orb. The
 * reference demo uses a 256-point FFT (128 bins); scaling the edges keeps the
 * same frequency proportions when E.V's shared analyser uses a larger FFT.
 */
export function orbSpectrumBands(samples: ArrayLike<number>): number[] {
  if (!samples.length) return [0, 0, 0, 0, 0];
  const scale = samples.length / REFERENCE_BIN_COUNT;
  return REFERENCE_BAND_EDGES.slice(0, -1).map((edge, band) => {
    const lo = Math.max(0, Math.floor(edge * scale));
    const hi = Math.max(lo + 1, Math.min(samples.length, Math.ceil(REFERENCE_BAND_EDGES[band + 1] * scale)));
    let sum = 0;
    for (let index = lo; index < hi; index++) sum += Number(samples[index]) || 0;
    return Math.max(0, Math.min(1, sum / ((hi - lo) * 255)));
  });
}

export type EvOrbVisualState =
  | "ready"
  | "connecting"
  | "listening"
  | "user-speaking"
  | "processing"
  | "confirming"
  | "ai-speaking";

export function evOrbVisualState(phase: string, heardVoice: boolean): EvOrbVisualState {
  if (phase === "connecting" || phase === "resuming") return "connecting";
  if (phase === "recording" || phase === "listening") return heardVoice ? "user-speaking" : "listening";
  if (phase === "thinking" || phase === "running_skill") return "processing";
  if (phase === "confirm") return "confirming";
  if (phase === "speaking") return "ai-speaking";
  return "ready";
}

export function orbGeometry(size: number, level: number) {
  const clampedLevel = Math.max(0, Math.min(1, level));
  const radius = size * 0.15 * (1 + clampedLevel * 0.68);
  return {
    radius,
    ringGap: size * 0.035,
    maxDistortion: size * clampedLevel * 0.016,
    arcGap: size * 0.033,
    shadowBlur: size * (0.07 + clampedLevel * 0.12),
  };
}

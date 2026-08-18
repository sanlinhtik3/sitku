import { describe, expect, it } from "vitest";
import {
  audioRms,
  evOrbVisualState,
  normalizeVoiceLevel,
  orbGeometry,
  orbSpectrumBands,
  smoothVoiceLevel,
} from "@/features/ev-voice/orbDynamics";

describe("E.V audio-reactive orb dynamics", () => {
  it("maps louder real PCM to a larger normalized response", () => {
    const quiet = normalizeVoiceLevel(audioRms(new Int16Array([200, -200]), 32768), 0.002);
    const loud = normalizeVoiceLevel(audioRms(new Int16Array([12_000, -12_000]), 32768), 0.002);
    expect(loud).toBeGreaterThan(quiet);
    expect(loud).toBeLessThanOrEqual(1);
  });

  it("ignores the measured noise floor", () => {
    expect(normalizeVoiceLevel(0.006, 0.008)).toBe(0);
  });

  it("attacks faster than it releases to feel responsive without flicker", () => {
    const attack = smoothVoiceLevel(0, 1);
    const release = 1 - smoothVoiceLevel(1, 0);
    expect(attack).toBeGreaterThan(release);
  });

  it.each([138, 320, 420])("keeps the loudest orb inside a %ipx canvas", (size) => {
    const geometry = orbGeometry(size, 1);
    const outerRing = geometry.radius
      + 3 * geometry.ringGap * 1.72
      + geometry.maxDistortion;
    const glow = geometry.radius + geometry.shadowBlur;
    expect(Math.max(outerRing, glow)).toBeLessThan(size / 2);
  });

  it("maps analyser bins into five speech bands", () => {
    const samples = new Uint8Array(128);
    samples.fill(255, 2, 5);
    samples.fill(128, 5, 9);
    const bands = orbSpectrumBands(samples);
    expect(bands).toHaveLength(5);
    expect(bands[0]).toBe(1);
    expect(bands[1]).toBeCloseTo(128 / 255, 4);
    expect(bands.slice(2)).toEqual([0, 0, 0]);

    const scaled = new Uint8Array(512);
    scaled.fill(255, 8, 20);
    expect(orbSpectrumBands(scaled)[0]).toBe(1);
  });

  it("derives deterministic visual states from the engine phase", () => {
    expect(evOrbVisualState("idle", false)).toBe("ready");
    expect(evOrbVisualState("recording", false)).toBe("listening");
    expect(evOrbVisualState("recording", true)).toBe("user-speaking");
    expect(evOrbVisualState("thinking", false)).toBe("processing");
    expect(evOrbVisualState("confirm", false)).toBe("confirming");
    expect(evOrbVisualState("speaking", false)).toBe("ai-speaking");
  });
});

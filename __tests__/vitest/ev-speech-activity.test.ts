import { describe, expect, it } from "vitest";
import { createSpeechActivityDetector } from "@/features/ev-voice/input/speechActivity";

describe("E.V client speech activity", () => {
  it("surfaces speech before a server transcript without committing a turn", () => {
    const detector = createSpeechActivityDetector();
    const speech = new Float32Array(2_048).fill(0.08);

    expect(detector.push(speech, 48_000).started).toBe(false);
    expect(detector.push(speech, 48_000)).toEqual(expect.objectContaining({
      state: "speech",
      started: true,
    }));
  });

  it("settles only after a bounded trailing pause", () => {
    const detector = createSpeechActivityDetector();
    const speech = new Float32Array(2_048).fill(0.08);
    const silence = new Float32Array(2_048);
    detector.push(speech, 48_000);
    detector.push(speech, 48_000);

    for (let i = 0; i < 13; i += 1) {
      expect(detector.push(silence, 48_000).settled).toBe(false);
    }
    expect(detector.push(silence, 48_000)).toEqual(expect.objectContaining({
      state: "settling",
      settled: true,
    }));
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const AFFECTIVE = "models/gemini-2.5-flash-native-audio-preview-12-2025";
const ANALYTICAL = "models/gemini-3.1-flash-live-preview";

function storage(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string): void => { values.set(key, String(value)); }),
    removeItem: vi.fn((key: string): void => { values.delete(key); }),
    clear: vi.fn((): void => { values.clear(); }),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    get length() { return values.size; },
  } satisfies Storage;
}

describe("E.V Live voice profiles", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("migrates the old analytical default once to adaptive native audio", async () => {
    const localStorage = storage({ "beebot-ev-live-model": ANALYTICAL });
    vi.stubGlobal("localStorage", localStorage);
    const { evModels } = await import("@/features/jarvis/services/settings");

    expect(evModels.brain()).toBe(AFFECTIVE);
    expect(localStorage.getItem("beebot-ev-adaptive-voice-v1")).toBe("1");
    expect(localStorage.getItem("beebot-ev-live-model")).toBe(AFFECTIVE);

    evModels.setBrain(ANALYTICAL);
    expect(evModels.brain()).toBe(ANALYTICAL);
  });

  it("keeps an explicit supported profile and safely falls back for an invalid model", async () => {
    const localStorage = storage({
      "beebot-ev-adaptive-voice-v1": "1",
      "beebot-ev-live-model": ANALYTICAL,
    });
    vi.stubGlobal("localStorage", localStorage);
    const { evModels } = await import("@/features/jarvis/services/settings");

    expect(evModels.brain()).toBe(ANALYTICAL);
    evModels.setBrain("models/not-a-live-model");
    expect(evModels.brain()).toBe(AFFECTIVE);
  });
});

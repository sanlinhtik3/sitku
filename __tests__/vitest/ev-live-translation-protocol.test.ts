import { describe, expect, it } from "vitest";
import {
  normalizeEvTranslationLanguage,
  parseEvLiveTranslationCommand,
} from "@/features/ev-voice/protocols";

describe("E.V Live Translation protocol", () => {
  it("requires an explicit live-translation request", () => {
    expect(parseEvLiveTranslationCommand("What does translate mean?", false)).toBeNull();
    expect(parseEvLiveTranslationCommand("Translate this sentence later", false)).toBeNull();
    expect(parseEvLiveTranslationCommand("Start live translate to Japanese", false)).toEqual({
      kind: "start",
      config: { targetLanguageCode: "ja", echoTargetLanguage: false },
      targetLanguageName: "Japanese",
    });
  });

  it("supports explicit Burmese commands and Myanmar output", () => {
    expect(parseEvLiveTranslationCommand("မြန်မာလို တိုက်ရိုက်ဘာသာပြန်ပေး", false)).toEqual({
      kind: "start",
      config: { targetLanguageCode: "my", echoTargetLanguage: false },
      targetLanguageName: "Burmese",
    });
    expect(parseEvLiveTranslationCommand("ဘာသာပြန်တာကို ရပ်လိုက်", true)).toEqual({ kind: "stop" });
  });

  it("uses the requested target when source and target languages are both named", () => {
    expect(parseEvLiveTranslationCommand("Start live translate from Japanese to English", false)).toEqual({
      kind: "start",
      config: { targetLanguageCode: "en", echoTargetLanguage: false },
      targetLanguageName: "English",
    });
  });

  it("normalizes only supported target languages", () => {
    expect(normalizeEvTranslationLanguage("zh-Hans")).toEqual({
      code: "zh-Hans",
      name: expect.stringMatching(/Chinese/i),
    });
    expect(normalizeEvTranslationLanguage("not-a-language")).toBeNull();
  });
});

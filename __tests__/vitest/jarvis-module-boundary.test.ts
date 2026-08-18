import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("E.V feature boundary", () => {
  it("keeps app consumers on the public feature API", () => {
    expect(read("src/layouts/BeeBotLayout.tsx")).toContain('from "@/features/ev-voice"');
    expect(read("src/pages/KnowledgeWorkspacePage.tsx")).toContain('from "@/features/ev-voice"');
  });

  it("does not restore the abandoned live transport", () => {
    const ports = read("src/features/jarvis/audio/ports.ts");
    expect(ports).not.toContain("RealtimeTransportPort");
    expect(ports).not.toContain("JarvisLiveHandle");
  });

  it("keeps the voice engine provider-neutral", () => {
    const engine = read("src/features/jarvis/core/engine.ts");
    expect(engine).toContain('from "@/features/ev-voice/protocols"');
    expect(engine).not.toContain("GeminiLiveClient");
    expect(engine).not.toContain("services/geminiLive");
    expect(engine).not.toContain("services/liveModelProfiles");
    expect(engine).not.toContain("services/settings");
  });

  it("keeps Gemini Cloud as the only TTS owner", () => {
    const voice = read("src/features/jarvis/ui/useJarvisVoice.ts");
    expect(voice).not.toContain("SpeechSynthesisUtterance");
    expect(voice).not.toContain("speechSynthesis");
    expect(voice).not.toContain("browserSpeak");
  });
});

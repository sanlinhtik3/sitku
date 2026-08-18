import { describe, expect, it, vi } from "vitest";
import { jarvisModels, makeJarvisBrain, resetConversation } from "@/features/jarvis/services/brain";
import {
  JARVIS_RUNTIME_POLICY,
  audioRoutingModel,
  reasoningModeForText,
  reasoningPolicyForTurn,
  operatorThinkingConfig,
  supportsStreamingTts,
  thinkingConfig,
} from "@/features/jarvis/core/latencyPolicy";

describe("Jarvis resilience policy", () => {
  it("uses generous inactivity recovery instead of a response SLA", () => {
    expect(JARVIS_RUNTIME_POLICY.transcriptionInactivityMs).toBeLessThanOrEqual(10000);
    expect(JARVIS_RUNTIME_POLICY.providerInactivityMs).toBeGreaterThanOrEqual(30000);
    expect(JARVIS_RUNTIME_POLICY.ttsInactivityMs).toBeGreaterThanOrEqual(20000);
    expect(JARVIS_RUNTIME_POLICY.speakSafetyCeilingMs).toBeGreaterThan(JARVIS_RUNTIME_POLICY.ttsInactivityMs);
  });

  it("keeps greetings fast and restores model reasoning for non-live work", () => {
    expect(thinkingConfig("gemini-2.5-flash", reasoningModeForText("hello"))).toEqual({ thinkingBudget: 0 });
    expect(thinkingConfig("gemini-3.5-flash", reasoningModeForText("hi"))).toEqual({ thinkingLevel: "minimal" });
    expect(reasoningModeForText("Audit this architecture layer by layer and propose a resilient implementation plan")).toBe("deep");
    expect(thinkingConfig("gemini-3.5-flash", "deep")).toEqual({ thinkingLevel: "high" });
  });

  it("selects the cheapest safe route from turn demand", () => {
    expect(reasoningPolicyForTurn("Hey")).toEqual(expect.objectContaining({ level: "minimal", route: "local" }));
    expect(reasoningPolicyForTurn("Open the budget note", { action: "open_note" })).toEqual(expect.objectContaining({ level: "low", route: "live" }));
    expect(reasoningPolicyForTurn("Audit this architecture layer by layer, compare the trade-offs, and propose a production plan")).toEqual(expect.objectContaining({ level: "high", route: "live" }));
    expect(reasoningPolicyForTurn("Delete this note", { action: "delete_note", requiresConfirmation: true })).toEqual(expect.objectContaining({ level: "high", route: "live", risk: "high" }));
    expect(reasoningPolicyForTurn("Audit this architecture layer by layer", { liveForeground: true })).toEqual(expect.objectContaining({ level: "minimal", route: "live" }));
    expect(reasoningPolicyForTurn("Delegate this audit", { action: "delegate_operator_task" })).toEqual(expect.objectContaining({ level: "high", route: "operator" }));
  });

  it("maps each policy level to explicit provider thinking configuration", () => {
    expect(thinkingConfig("gemini-2.5-flash", "light")).toEqual({ thinkingBudget: 1024 });
    expect(thinkingConfig("gemini-2.5-flash", "balanced")).toEqual({ thinkingBudget: -1 });
    expect(thinkingConfig("gemini-3.1-flash", "light")).toEqual({ thinkingLevel: "low" });
    expect(thinkingConfig("gemini-3.1-flash", "balanced")).toEqual({ thinkingLevel: "medium" });
  });

  it("only treats 3.1+ TTS models as true streaming models", () => {
    expect(supportsStreamingTts("gemini-2.5-flash-tts")).toBe(false);
    expect(supportsStreamingTts("gemini-3.1-flash-tts-preview")).toBe(true);
  });

  it("reserves deep adaptive reasoning for delegated operator work", () => {
    expect(operatorThinkingConfig("gemini-2.5-flash")).toEqual({ thinkingBudget: -1 });
    expect(operatorThinkingConfig("gemini-3.1-flash")).toEqual({ thinkingLevel: "high" });
  });

  it("does not use a slow user-selected conversation model for audio routing", () => {
    expect(audioRoutingModel("gemini-3.5-flash")).toBe("gemini-2.5-flash");
    expect(JARVIS_RUNTIME_POLICY.providerInactivityMs).toBeGreaterThanOrEqual(30000);
  });

  it("inherits the Apex Gemini preference unless Jarvis has an explicit model", () => {
    const values = new Map([["apex_preferred_model", "gemini-3.5-flash"]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    try {
      expect(jarvisModels.brain()).toBe("gemini-3.5-flash");
      values.set("beebot-jarvis-brain-model", "gemini-3.1-flash-lite");
      expect(jarvisModels.brain()).toBe("gemini-3.1-flash-lite");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("transcribes desktop audio first, then routes a known command locally", async () => {
    const values = new Map([["beebot-gemini-key", "test-key"]]);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ transcript: "ဒီနေ့ task တွေပြ" }) }] } }] }),
    } as Response));
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal("fetch", fetchMock);
    resetConversation();
    try {
      const brain = makeJarvisBrain({} as Parameters<typeof makeJarvisBrain>[0]);
      const intent = await brain.understandAudio(new Blob([new Uint8Array(32044)], { type: "audio/wav" }));
      expect(intent.action).toBe("list_today_tasks");
      expect(intent.transcript).toBe("ဒီနေ့ task တွေပြ");
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(String(fetchMock.mock.calls[0][1]?.body)).toContain("transcript");
    } finally {
      resetConversation();
      vi.unstubAllGlobals();
    }
  });

  it("answers a greeting locally after transcription without a second model call", async () => {
    const values = new Map([["beebot-gemini-key", "test-key"]]);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ transcript: "Hey" }) }] } }] }),
    } as Response));
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal("fetch", fetchMock);
    resetConversation();
    try {
      const brain = makeJarvisBrain({} as Parameters<typeof makeJarvisBrain>[0]);
      const intent = await brain.understandAudio(new Blob([new Uint8Array(32044)], { type: "audio/wav" }));
      expect(intent).toEqual(expect.objectContaining({ action: "none", reply: "Yes, I'm listening.", transcript: "Hey" }));
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      resetConversation();
      vi.unstubAllGlobals();
    }
  });

  it("recovers once when Gemini truncates structured conversation JSON", async () => {
    const values = new Map([
      ["beebot-gemini-key", "test-key"],
      ["beebot-jarvis-brain-model", "gemini-2.5-flash"],
    ]);
    const validIntent = {
      action: "none",
      mode: "conversation",
      skill: "conversation_skill",
      confidence: 0.95,
      requiresConfirmation: false,
      reply: "Try one small task first.",
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"action":"none","reply":"cut' }] } }] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(validIntent) }] } }] }),
      } as Response);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal("fetch", fetchMock);
    resetConversation();
    try {
      const brain = makeJarvisBrain({} as Parameters<typeof makeJarvisBrain>[0]);
      const intent = await brain.understandText("What should I cook tonight?");
      expect(intent.reply).toBe("Try one small task first.");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(String(fetchMock.mock.calls[1][1]?.body)).toContain('"maxOutputTokens":2048');
    } finally {
      resetConversation();
      vi.unstubAllGlobals();
    }
  });

  it("escalates reasoning exactly once when the first intent is low confidence", async () => {
    const values = new Map([
      ["beebot-gemini-key", "test-key"],
      ["beebot-jarvis-brain-model", "gemini-2.5-flash"],
    ]);
    const lowConfidence = {
      action: "none",
      mode: "conversation",
      skill: "conversation_skill",
      confidence: 0.4,
      requiresConfirmation: false,
      reply: "Maybe start somewhere.",
    };
    const resolved = {
      ...lowConfidence,
      confidence: 0.92,
      reply: "Start with the highest-impact task.",
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(lowConfidence) }] } }] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(resolved) }] } }] }),
      } as Response);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal("fetch", fetchMock);
    resetConversation();
    try {
      const brain = makeJarvisBrain({} as Parameters<typeof makeJarvisBrain>[0]);
      const intent = await brain.understandText("What should I work on next?");
      expect(intent.reply).toBe("Start with the highest-impact task.");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('"thinkingBudget":1024');
      expect(String(fetchMock.mock.calls[1][1]?.body)).toContain('"thinkingBudget":-1');
    } finally {
      resetConversation();
      vi.unstubAllGlobals();
    }
  });

  it("uses stable Flash for ordinary conversation even when Apex prefers a deep model", async () => {
    const values = new Map([
      ["beebot-gemini-key", "test-key"],
      ["beebot-jarvis-brain-model", "gemini-3.5-flash"],
    ]);
    const response = {
      action: "none",
      mode: "conversation",
      skill: "conversation_skill",
      confidence: 0.95,
      requiresConfirmation: false,
      reply: "Start with one focused task.",
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(response) }] } }] }),
    } as Response));
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal("fetch", fetchMock);
    resetConversation();
    try {
      const brain = makeJarvisBrain({} as Parameters<typeof makeJarvisBrain>[0]);
      await brain.understandText("What should I work on this afternoon?");
      expect(String(fetchMock.mock.calls[0][0])).toContain("gemini-2.5-flash:generateContent");
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      resetConversation();
      vi.unstubAllGlobals();
    }
  });

  it("falls back once from a high-demand deep model instead of retrying it", async () => {
    const values = new Map([
      ["beebot-gemini-key", "test-key"],
      ["beebot-jarvis-brain-model", "gemini-3.5-flash"],
    ]);
    const response = {
      action: "none",
      mode: "conversation",
      skill: "conversation_skill",
      confidence: 0.95,
      requiresConfirmation: false,
      reply: "The fallback completed the analysis.",
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: "This model is currently experiencing high demand." } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(response) }] } }] }),
      } as Response);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal("fetch", fetchMock);
    resetConversation();
    try {
      const brain = makeJarvisBrain({} as Parameters<typeof makeJarvisBrain>[0]);
      const intent = await brain.understandText("Audit this architecture deeply and recommend a resilient production plan");
      expect(intent.reply).toBe("The fallback completed the analysis.");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(String(fetchMock.mock.calls[0][0])).toContain("gemini-3.5-flash:generateContent");
      expect(String(fetchMock.mock.calls[1][0])).toContain("gemini-2.5-flash:generateContent");
    } finally {
      resetConversation();
      vi.unstubAllGlobals();
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiLiveClient } from "@/features/jarvis/services/geminiLive";

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  throwOnSend = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  constructor(readonly url: string) { FakeWebSocket.instances.push(this); }
  send(value: string) { if (this.throwOnSend) throw new Error("socket closing"); this.sent.push(value); }
  close() { this.readyState = 3; }
  open() { this.onopen?.(); }
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}

describe("Gemini Live v1beta client", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("window", { beebotDesktop: undefined });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => key === "beebot-gemini-key" ? "local-test-key" : null,
      setItem: vi.fn(), removeItem: vi.fn(),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("uses the current endpoint/model and non-deprecated realtime audio envelope", async () => {
    const audio = vi.fn();
    const client = new GeminiLiveClient({
      onAudio: audio,
      onInputTranscript: vi.fn(),
      onOutputTranscript: vi.fn(),
      onToolCall: vi.fn(),
      onTurnComplete: vi.fn(),
      onError: vi.fn(),
    });
    const connected = client.connect(
      "models/gemini-3.1-flash-live-preview",
      "You are E.V",
      { type: "object" },
      [{ name: "workspace_get_state", description: "Read workspace state", parameters: { type: "object" } }],
    );
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toContain("v1beta.GenerativeService.BidiGenerateContent");
    expect(ws.url).not.toContain("v1alpha");
    ws.open();
    const setup = JSON.parse(ws.sent[0]);
    expect(setup.setup).toEqual(expect.objectContaining({
      model: "models/gemini-3.1-flash-live-preview",
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      sessionResumption: {},
    }));
    expect(setup.setup.realtimeInputConfig.activityHandling).toBe("START_OF_ACTIVITY_INTERRUPTS");
    expect(setup.setup.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "minimal" });
    expect(setup.setup.realtimeInputConfig.automaticActivityDetection).toEqual(expect.objectContaining({
      endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
      prefixPaddingMs: 60,
      silenceDurationMs: 560,
    }));
    expect(setup.setup.enableAffectiveDialog).toBeUndefined();
    expect(setup.setup.proactivity).toBeUndefined();
    expect(setup.setup.tools[0].functionDeclarations).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "execute_action" }),
      expect.objectContaining({ name: "workspace_get_state" }),
    ]));
    ws.receive({ setupComplete: {} });
    await connected;

    client.sendAudio(new Float32Array([0, 0.5, -0.5]), 16_000);
    const input = JSON.parse(ws.sent[1]);
    expect(input.realtimeInput.audio.mimeType).toBe("audio/pcm;rate=16000");
    expect(input.realtimeInput.mediaChunks).toBeUndefined();

    const bytes = new Int16Array([10, -10]);
    const base64 = Buffer.from(bytes.buffer).toString("base64");
    ws.receive({ serverContent: { modelTurn: { parts: [{ inlineData: { data: base64 } }] } } });
    await vi.waitFor(() => expect(audio).toHaveBeenCalledWith(expect.any(Int16Array), 24_000));
  });

  it("removes MCP-only additionalProperties from Live tool schemas without mutating the registry", async () => {
    const parameters = {
      type: "object",
      properties: {
        arguments: {
          type: "object",
          additionalProperties: true,
          properties: {
            nested: { type: "object", additionalProperties: { type: "string" } },
          },
        },
      },
    };
    const client = new GeminiLiveClient({
      onAudio: vi.fn(), onInputTranscript: vi.fn(), onOutputTranscript: vi.fn(),
      onToolCall: vi.fn(), onTurnComplete: vi.fn(), onError: vi.fn(),
    });
    const connected = client.connect(
      "models/gemini-3.1-flash-live-preview",
      "You are E.V",
      { type: "object", additionalProperties: false },
      [{ name: "notion_create_comment", description: "Create a Notion comment", parameters }],
    );
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const ws = FakeWebSocket.instances[0];
    ws.open();
    const declarations = JSON.parse(ws.sent[0]).setup.tools[0].functionDeclarations;
    expect(JSON.stringify(declarations)).not.toContain("additionalProperties");
    expect(declarations[1].parameters.properties.arguments.properties.nested).toEqual({ type: "object" });
    expect(parameters.properties.arguments.additionalProperties).toBe(true);
    ws.receive({ setupComplete: {} });
    await connected;
    client.disconnect();
  });

  it("uses the dedicated audio-only setup for Gemini 3.5 Live Translate", async () => {
    const client = new GeminiLiveClient({
      onAudio: vi.fn(), onInputTranscript: vi.fn(), onOutputTranscript: vi.fn(),
      onToolCall: vi.fn(), onTurnComplete: vi.fn(), onError: vi.fn(),
    });
    const connected = client.connectTranslation({ targetLanguageCode: "my", echoTargetLanguage: false });
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const ws = FakeWebSocket.instances[0];
    ws.open();
    const setup = JSON.parse(ws.sent[0]).setup;
    expect(setup).toEqual({
      model: "models/gemini-3.5-live-translate-preview",
      generationConfig: {
        responseModalities: ["AUDIO"],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        translationConfig: { targetLanguageCode: "my", echoTargetLanguage: false },
      },
    });
    expect(setup.tools).toBeUndefined();
    expect(setup.systemInstruction).toBeUndefined();
    ws.receive({ setupComplete: {} });
    await connected;
    client.disconnect();
  });

  it("keeps internal model text out of the visible spoken transcript", async () => {
    const output = vi.fn();
    const audio = vi.fn();
    const client = new GeminiLiveClient({
      onAudio: audio,
      onInputTranscript: vi.fn(),
      onOutputTranscript: output,
      onToolCall: vi.fn(),
      onTurnComplete: vi.fn(),
      onError: vi.fn(),
    });
    const connected = client.connect("models/gemini-3.1-flash-live-preview", "You are E.V", { type: "object" });
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.receive({ setupComplete: {} });
    await connected;

    const bytes = new Int16Array([10, -10]);
    const base64 = Buffer.from(bytes.buffer).toString("base64");
    ws.receive({
      serverContent: {
        outputTranscription: { text: "မိန့်ခွန်းပြောဖို့ ခဏစောင့်နေတာပါရှင့်။" },
        modelTurn: {
          parts: [
            { text: "**Clarifying Conversational Context**", thought: true },
            { text: "I was waiting for your instruction." },
            { inlineData: { data: base64, mimeType: "audio/pcm;rate=24000" } },
          ],
        },
      },
    });

    await vi.waitFor(() => expect(audio).toHaveBeenCalledWith(expect.any(Int16Array), 24_000));
    expect(output).toHaveBeenCalledTimes(1);
    expect(output).toHaveBeenCalledWith("မိန့်ခွန်းပြောဖို့ ခဏစောင့်နေတာပါရှင့်။");
    client.disconnect();
  });

  it("enables affective dialog only for the supported 2.5 native-audio profile", async () => {
    const client = new GeminiLiveClient({
      onAudio: vi.fn(),
      onInputTranscript: vi.fn(),
      onOutputTranscript: vi.fn(),
      onToolCall: vi.fn(),
      onTurnComplete: vi.fn(),
      onError: vi.fn(),
    });
    const connected = client.connect(
      "models/gemini-2.5-flash-native-audio-preview-12-2025",
      "You are E.V",
      { type: "object" },
    );
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const ws = FakeWebSocket.instances[0];
    ws.open();
    const setup = JSON.parse(ws.sent[0]);
    expect(setup.setup.model).toBe("models/gemini-2.5-flash-native-audio-preview-12-2025");
    expect(setup.setup.enableAffectiveDialog).toBe(true);
    expect(setup.setup.proactivity).toBeUndefined();
    expect(setup.setup.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    ws.receive({ setupComplete: {} });
    await connected;
    client.disconnect();
  });

  it("keeps Electron constrained-token sessions schema-safe", async () => {
    const evLiveToken = vi.fn().mockResolvedValue({
      token: "ephemeral-token",
      model: "models/gemini-2.5-flash-native-audio-preview-12-2025",
    });
    vi.stubGlobal("window", { beebotDesktop: { evLiveToken } });
    const client = new GeminiLiveClient({
      onAudio: vi.fn(),
      onInputTranscript: vi.fn(),
      onOutputTranscript: vi.fn(),
      onToolCall: vi.fn(),
      onTurnComplete: vi.fn(),
      onError: vi.fn(),
    });
    const connected = client.connect(
      "models/gemini-2.5-flash-native-audio-preview-12-2025",
      "You are E.V",
      { type: "object" },
    );
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toContain("BidiGenerateContentConstrained");
    ws.open();
    const setup = JSON.parse(ws.sent[0]);
    expect(setup.setup.enableAffectiveDialog).toBeUndefined();
    expect(setup.setup.proactivity).toBeUndefined();
    expect(setup.setup.generationConfig.responseModalities).toEqual(["AUDIO"]);
    ws.receive({ setupComplete: {} });
    await connected;
    expect(evLiveToken).toHaveBeenCalledTimes(1);
    client.disconnect();
  });

  it("retries direct sessions without extended fields when the setup schema rejects them", async () => {
    const client = new GeminiLiveClient({
      onAudio: vi.fn(),
      onInputTranscript: vi.fn(),
      onOutputTranscript: vi.fn(),
      onToolCall: vi.fn(),
      onTurnComplete: vi.fn(),
      onError: vi.fn(),
    });
    const connected = client.connect(
      "models/gemini-2.5-flash-native-audio-preview-12-2025",
      "You are E.V",
      { type: "object" },
    );
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const first = FakeWebSocket.instances[0];
    first.open();
    expect(JSON.parse(first.sent[0]).setup.enableAffectiveDialog).toBe(true);
    first.receive({ error: { code: 400, message: 'Unknown name "enableAffectiveDialog" at setup' } });

    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    const retry = FakeWebSocket.instances[1];
    retry.open();
    const setup = JSON.parse(retry.sent[0]);
    expect(setup.setup.enableAffectiveDialog).toBeUndefined();
    expect(setup.setup.proactivity).toBeUndefined();
    retry.receive({ setupComplete: {} });
    await connected;
    client.disconnect();
  });

  it("retires a GoAway socket and resumes on one replacement connection", async () => {
    vi.useFakeTimers();
    const reconnecting = vi.fn();
    const connectedCallback = vi.fn();
    const client = new GeminiLiveClient({
      onAudio: vi.fn(),
      onInputTranscript: vi.fn(),
      onOutputTranscript: vi.fn(),
      onToolCall: vi.fn(),
      onTurnComplete: vi.fn(),
      onConnected: connectedCallback,
      onReconnecting: reconnecting,
      onError: vi.fn(),
    });
    const connected = client.connect("models/gemini-3.1-flash-live-preview", "You are E.V", { type: "object" });
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const first = FakeWebSocket.instances[0];
    first.open();
    first.receive({ setupComplete: {} });
    await connected;

    first.receive({
      sessionResumptionUpdate: { resumable: true, newHandle: "resume-1" },
      goAway: { timeLeft: "1s" },
    });
    await vi.waitFor(() => expect(first.readyState).toBe(3));
    expect(reconnecting).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeWebSocket.instances).toHaveLength(2);
    const replacement = FakeWebSocket.instances[1];
    replacement.open();
    const setup = JSON.parse(replacement.sent[0]);
    expect(setup.setup.sessionResumption).toEqual({ handle: "resume-1" });
    replacement.receive({ setupComplete: {} });
    await vi.waitFor(() => expect(connectedCallback).toHaveBeenCalledTimes(2));
    expect(FakeWebSocket.instances).toHaveLength(2);
    client.disconnect();
  });

  it("mints a fresh one-use desktop token while retaining the session resume handle", async () => {
    vi.useFakeTimers();
    const evLiveToken = vi.fn()
      .mockResolvedValueOnce({ token: "token-1", model: "models/gemini-3.1-flash-live-preview" })
      .mockResolvedValueOnce({ token: "token-2", model: "models/gemini-3.1-flash-live-preview" });
    vi.stubGlobal("window", { beebotDesktop: { evLiveToken } });
    const client = new GeminiLiveClient({
      onAudio: vi.fn(), onInputTranscript: vi.fn(), onOutputTranscript: vi.fn(),
      onToolCall: vi.fn(), onTurnComplete: vi.fn(), onError: vi.fn(),
    });
    const connected = client.connect("models/gemini-3.1-flash-live-preview", "You are E.V", { type: "object" });
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const first = FakeWebSocket.instances[0];
    expect(first.url).toContain("access_token=token-1");
    first.open();
    first.receive({ setupComplete: {}, sessionResumptionUpdate: { resumable: true, newHandle: "resume-2" } });
    await connected;

    first.receive({ goAway: { timeLeft: "1s" } });
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    const second = FakeWebSocket.instances[1];
    expect(second.url).toContain("access_token=token-2");
    second.open();
    expect(JSON.parse(second.sent[0]).setup.sessionResumption).toEqual({ handle: "resume-2" });
    second.receive({ setupComplete: {} });
    expect(evLiveToken).toHaveBeenCalledTimes(2);
    client.disconnect();
  });

  it("rejects a connection that never completes setup instead of hanging forever", async () => {
    vi.useFakeTimers();
    const client = new GeminiLiveClient({
      onAudio: vi.fn(), onInputTranscript: vi.fn(), onOutputTranscript: vi.fn(),
      onToolCall: vi.fn(), onTurnComplete: vi.fn(), onError: vi.fn(),
    });
    const connected = client.connect("models/gemini-3.1-flash-live-preview", "You are E.V", { type: "object" });
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    FakeWebSocket.instances[0].open();
    const rejection = expect(connected).rejects.toThrow("setup timed out");
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
    expect(FakeWebSocket.instances[0].readyState).toBe(3);
    client.disconnect();
  });

  it("contains send-close races and schedules one reconnect", async () => {
    vi.useFakeTimers();
    const reconnecting = vi.fn();
    const client = new GeminiLiveClient({
      onAudio: vi.fn(), onInputTranscript: vi.fn(), onOutputTranscript: vi.fn(),
      onToolCall: vi.fn(), onTurnComplete: vi.fn(), onReconnecting: reconnecting, onError: vi.fn(),
    });
    const connected = client.connect("models/gemini-3.1-flash-live-preview", "You are E.V", { type: "object" });
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const first = FakeWebSocket.instances[0];
    first.open();
    first.receive({ setupComplete: {} });
    await connected;
    first.throwOnSend = true;

    expect(() => client.sendAudio(new Float32Array([0.25]), 16_000)).not.toThrow();
    expect(client.sendAudio(new Float32Array([0.25]), 16_000)).toBe(true);
    expect(reconnecting).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(250);
    expect(FakeWebSocket.instances).toHaveLength(2);
    client.disconnect();
  });

  it("buffers reconnect audio for a resumable checkpoint and reports transport timing", async () => {
    vi.useFakeTimers();
    const outcome = vi.fn();
    const client = new GeminiLiveClient({
      onAudio: vi.fn(), onInputTranscript: vi.fn(), onOutputTranscript: vi.fn(),
      onToolCall: vi.fn(), onTurnComplete: vi.fn(), onReconnectOutcome: outcome, onError: vi.fn(),
    });
    const connected = client.connect("models/gemini-3.1-flash-live-preview", "You are E.V", { type: "object" });
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const first = FakeWebSocket.instances[0];
    first.open();
    first.receive({ setupComplete: {}, sessionResumptionUpdate: { resumable: true, newHandle: "resume-audio" } });
    await connected;

    first.throwOnSend = true;
    expect(client.sendAudio(new Float32Array(1_600).fill(0.25), 16_000)).toBe(true);
    await vi.advanceTimersByTimeAsync(250);
    const replacement = FakeWebSocket.instances[1];
    replacement.open();
    replacement.receive({ setupComplete: {} });
    await vi.waitFor(() => expect(outcome).toHaveBeenCalledOnce());
    expect(outcome).toHaveBeenCalledWith(expect.objectContaining({
      resumed: true,
      bufferedAudioMs: 100,
      droppedAudioMs: 0,
    }));
    expect(replacement.sent).toHaveLength(2);
    client.disconnect();
  });

  it("drops reconnect audio when no resumable checkpoint exists", async () => {
    vi.useFakeTimers();
    const outcome = vi.fn();
    const client = new GeminiLiveClient({
      onAudio: vi.fn(), onInputTranscript: vi.fn(), onOutputTranscript: vi.fn(),
      onToolCall: vi.fn(), onTurnComplete: vi.fn(), onReconnectOutcome: outcome, onError: vi.fn(),
    });
    const connected = client.connect("models/gemini-3.1-flash-live-preview", "You are E.V", { type: "object" });
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const first = FakeWebSocket.instances[0];
    first.open();
    first.receive({ setupComplete: {} });
    await connected;

    first.throwOnSend = true;
    expect(client.sendAudio(new Float32Array(1_600).fill(0.25), 16_000)).toBe(true);
    await vi.advanceTimersByTimeAsync(250);
    const replacement = FakeWebSocket.instances[1];
    replacement.open();
    replacement.receive({ setupComplete: {} });
    await vi.waitFor(() => expect(outcome).toHaveBeenCalledOnce());
    expect(outcome).toHaveBeenCalledWith(expect.objectContaining({
      resumed: false,
      bufferedAudioMs: 100,
      droppedAudioMs: 100,
      reason: "missing-checkpoint",
    }));
    expect(replacement.sent).toHaveLength(1);
    client.disconnect();
  });

  it("queues and deduplicates tool responses while reconnecting", async () => {
    vi.useFakeTimers();
    const client = new GeminiLiveClient({
      onAudio: vi.fn(), onInputTranscript: vi.fn(), onOutputTranscript: vi.fn(),
      onToolCall: vi.fn(), onTurnComplete: vi.fn(), onError: vi.fn(),
    });
    const connected = client.connect("models/gemini-3.1-flash-live-preview", "You are E.V", { type: "object" });
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const first = FakeWebSocket.instances[0];
    first.open();
    first.receive({ setupComplete: {}, sessionResumptionUpdate: { resumable: true, newHandle: "resume-tools" } });
    await connected;

    first.throwOnSend = true;
    expect(client.sendToolResponse("call-1", "workspace_get_state", { ok: true, value: 1 })).toBe(true);
    expect(client.sendToolResponse("call-1", "workspace_get_state", { ok: true, value: 2 })).toBe(true);
    await vi.advanceTimersByTimeAsync(250);
    expect(FakeWebSocket.instances).toHaveLength(2);

    const replacement = FakeWebSocket.instances[1];
    replacement.open();
    replacement.receive({ setupComplete: {} });
    await vi.waitFor(() => expect(replacement.sent).toHaveLength(2));
    const replayed = JSON.parse(replacement.sent[1]);
    expect(replayed.toolResponse.functionResponses).toEqual([
      expect.objectContaining({ id: "call-1", name: "workspace_get_state", response: { ok: true, value: 2 } }),
    ]);
    expect(replacement.sent).toHaveLength(2);
    client.disconnect();
  });

  it("does not carry a resume handle into a new explicit session", async () => {
    const client = new GeminiLiveClient({
      onAudio: vi.fn(), onInputTranscript: vi.fn(), onOutputTranscript: vi.fn(),
      onToolCall: vi.fn(), onTurnComplete: vi.fn(), onError: vi.fn(),
    });
    const firstConnect = client.connect("models/gemini-3.1-flash-live-preview", "First", { type: "object" });
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const first = FakeWebSocket.instances[0];
    first.open();
    first.receive({ setupComplete: {}, sessionResumptionUpdate: { resumable: true, newHandle: "old-session" } });
    await firstConnect;

    const secondConnect = client.connect("models/gemini-3.1-flash-live-preview", "Second", { type: "object" });
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    const second = FakeWebSocket.instances[1];
    second.open();
    expect(JSON.parse(second.sent[0]).setup.sessionResumption).toEqual({});
    second.receive({ setupComplete: {} });
    await secondConnect;
    client.disconnect();
  });

  it("refuses to replay a tool response without a resumable checkpoint", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const client = new GeminiLiveClient({
      onAudio: vi.fn(), onInputTranscript: vi.fn(), onOutputTranscript: vi.fn(),
      onToolCall: vi.fn(), onTurnComplete: vi.fn(), onError,
    });
    const connected = client.connect("models/gemini-3.1-flash-live-preview", "You are E.V", { type: "object" });
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const first = FakeWebSocket.instances[0];
    first.open();
    first.receive({ setupComplete: {} });
    await connected;

    first.throwOnSend = true;
    expect(client.sendToolResponse("call-no-checkpoint", "notes_read_file", { ok: true })).toBe(true);
    await vi.advanceTimersByTimeAsync(250);
    const replacement = FakeWebSocket.instances[1];
    replacement.open();
    replacement.receive({ setupComplete: {} });
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining("resumable checkpoint")));
    expect(replacement.sent).toHaveLength(1);
    client.disconnect();
  });

  it("reports reconnect exhaustion once", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const client = new GeminiLiveClient({
      onAudio: vi.fn(), onInputTranscript: vi.fn(), onOutputTranscript: vi.fn(),
      onToolCall: vi.fn(), onTurnComplete: vi.fn(), onError,
    });
    const connected = client.connect("models/gemini-3.1-flash-live-preview", "You are E.V", { type: "object" });
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const first = FakeWebSocket.instances[0];
    first.open();
    first.receive({ setupComplete: {}, sessionResumptionUpdate: { resumable: true, newHandle: "resume-fail" } });
    await connected;
    first.throwOnSend = true;
    client.sendAudio(new Float32Array([0.25]), 16_000);

    for (const wait of [250, 500, 1_000, 2_000]) {
      await vi.advanceTimersByTimeAsync(wait);
      const socket = FakeWebSocket.instances.at(-1)!;
      socket.open();
      socket.receive({ error: { code: 503, message: "temporary provider failure" } });
    }
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("could not restore"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onError).toHaveBeenCalledTimes(1);
    client.disconnect();
  });

  it("ignores messages from a retired socket after a new connect", async () => {
    const output = vi.fn();
    const client = new GeminiLiveClient({
      onAudio: vi.fn(), onInputTranscript: vi.fn(), onOutputTranscript: output,
      onToolCall: vi.fn(), onTurnComplete: vi.fn(), onError: vi.fn(),
    });
    const firstConnect = client.connect("models/gemini-3.1-flash-live-preview", "First", { type: "object" });
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const first = FakeWebSocket.instances[0];
    first.open();
    first.receive({ setupComplete: {} });
    await firstConnect;

    const secondConnect = client.connect("models/gemini-3.1-flash-live-preview", "Second", { type: "object" });
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    first.receive({ serverContent: { outputTranscription: { text: "stale" } } });
    expect(output).not.toHaveBeenCalled();
    const second = FakeWebSocket.instances[1];
    second.open();
    second.receive({ setupComplete: {} });
    await secondConnect;
    client.disconnect();
  });

  it("settles an in-flight connection when the client disconnects", async () => {
    const client = new GeminiLiveClient({
      onAudio: vi.fn(), onInputTranscript: vi.fn(), onOutputTranscript: vi.fn(),
      onToolCall: vi.fn(), onTurnComplete: vi.fn(), onError: vi.fn(),
    });
    const connected = client.connect("models/gemini-3.1-flash-live-preview", "You are E.V", { type: "object" });
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const rejection = expect(connected).rejects.toThrow("connection cancelled");
    client.disconnect();
    await rejection;
    expect(FakeWebSocket.instances[0].readyState).toBe(3);
  });
});

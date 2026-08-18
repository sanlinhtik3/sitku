import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiLiveClient } from "@/features/jarvis/services/geminiLive";

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => this.onopen?.());
  }

  send(data: string) {
    this.sent.push(data);
    if (JSON.parse(data).setup) {
      queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ setupComplete: {} }) }));
    }
  }

  close() {
    this.readyState = 3;
  }
}

afterEach(() => {
  FakeWebSocket.instances = [];
  vi.unstubAllGlobals();
});

describe("Gemini Live startup audio", () => {
  it("buffers speech immediately and flushes it after setup", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("localStorage", { getItem: () => "test-key", setItem: vi.fn() });
    const client = new GeminiLiveClient({
      onAudio: vi.fn(),
      onInputTranscript: vi.fn(),
      onOutputTranscript: vi.fn(),
      onToolCall: vi.fn(),
      onTurnComplete: vi.fn(),
      onError: vi.fn(),
    });

    const connecting = client.connect("gemini-2.5-flash-native-audio-preview-12-2025", "system", { type: "object" });
    expect(client.sendAudio(new Float32Array([0.25, -0.25]), 16_000)).toBe(true);
    await connecting;

    const sent = FakeWebSocket.instances[0].sent.map((item) => JSON.parse(item));
    expect(sent[0]).toHaveProperty("setup");
    expect(sent[1]).toHaveProperty("realtimeInput.audio.data");
    client.disconnect();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { createTurnAudioSession, LIVE_PCM_CHUNK_SAMPLES } from "@/features/jarvis/audio/capture";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function fakeStream() {
  const stop = vi.fn();
  return { stream: { getTracks: () => [{ stop }] } as unknown as MediaStream, stop };
}

class FakeAudioContext {
  static latest: FakeAudioContext | null = null;
  state = "suspended";
  sampleRate = 48_000;
  destination = {} as AudioDestinationNode;
  resume = vi.fn(async () => { this.state = "running"; });
  close = vi.fn(async () => { this.state = "closed"; });
  createMediaStreamSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
  createAnalyser = vi.fn(() => ({
    fftSize: 0,
    smoothingTimeConstant: 0,
    frequencyBinCount: 512,
    getByteFrequencyData: vi.fn(),
  }));
  processor = {
    onaudioprocess: null as ((event: { inputBuffer: { getChannelData: () => Float32Array } }) => void) | null,
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  createScriptProcessor = vi.fn(() => this.processor);
  createGain = vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }));

  constructor() { FakeAudioContext.latest = this; }
}

afterEach(() => vi.unstubAllGlobals());

describe("turn audio session lifecycle", () => {
  it("streams microphone input in low-latency Live chunks", () => {
    expect(LIVE_PCM_CHUNK_SAMPLES).toBe(1_024);
  });

  it("deduplicates concurrent mic acquisition and resumes the audio context", async () => {
    const request = deferred<MediaStream>();
    const getUserMedia = vi.fn(() => request.promise);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    const audio = createTurnAudioSession();
    const one = audio.acquire();
    const two = audio.acquire();
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    const { stream } = fakeStream();
    request.resolve(stream);
    await Promise.all([one, two]);

    expect(audio.ready()).toBe(true);
    expect(audio.sampleRate()).toBe(48_000);
  });

  it("discards a stale permission result after release without leaking the mic", async () => {
    const request = deferred<MediaStream>();
    const getUserMedia = vi.fn(() => request.promise);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    const audio = createTurnAudioSession();
    const pending = audio.acquire();
    audio.release();

    const { stream, stop } = fakeStream();
    request.resolve(stream);
    await pending;

    expect(stop).toHaveBeenCalledOnce();
    expect(audio.ready()).toBe(false);
  });

  it("warms capture during acquire so the first utterance is not lost", async () => {
    const { stream } = fakeStream();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn(async () => stream) } });
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    const audio = createTurnAudioSession();
    await audio.acquire();

    const first = vi.fn();
    audio.begin(first);
    FakeAudioContext.latest!.processor.onaudioprocess?.({
      inputBuffer: { getChannelData: () => new Float32Array([0.1, 0.2]) },
    });
    expect(first).toHaveBeenCalledOnce();

    audio.end();
    const second = vi.fn();
    audio.begin(second);
    FakeAudioContext.latest!.processor.onaudioprocess?.({
      inputBuffer: { getChannelData: () => new Float32Array([0.3]) },
    });
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(FakeAudioContext.latest!.createScriptProcessor).toHaveBeenCalledOnce();
  });
});

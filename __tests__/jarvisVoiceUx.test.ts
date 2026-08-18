import { afterEach, describe, expect, it, vi } from "vitest";
import { splitTtsSentenceChunks } from "@/features/jarvis/ui/useJarvisVoice";
import { createWebAudioPlaybackPort } from "@/features/jarvis/audio/playback";

afterEach(() => vi.unstubAllGlobals());

describe("Jarvis sentence-level TTS queue", () => {
  it("keeps Burmese and English sentences ordered with punctuation", () => {
    expect(splitTtsSentenceChunks("ပြီးပါပြီ။ နောက်တစ်ခု စလုပ်မယ်။ Ready? Go!"))
      .toEqual(["ပြီးပါပြီ။", "နောက်တစ်ခု စလုပ်မယ်။", "Ready?", "Go!"]);
  });

  it("does not split decimal values", () => {
    expect(splitTtsSentenceChunks("Revenue is 10.5 USDT. Net is 8.2 USDT."))
      .toEqual(["Revenue is 10.5 USDT.", "Net is 8.2 USDT."]);
  });

  it("turns line-based command output into short speakable chunks", () => {
    expect(splitTtsSentenceChunks("ဒီနေ့ task တွေ:\n1. Build Sitku\n2. Test voice"))
      .toEqual(["ဒီနေ့ task တွေ:", "1. Build Sitku", "2. Test voice"]);
  });

  it("caps unpunctuated text so synthesis can start early", () => {
    const chunks = splitTtsSentenceChunks("word ".repeat(100));
    expect(chunks.length).toBeGreaterThan(1);
    expect(Math.max(...chunks.map((chunk) => chunk.length))).toBeLessThanOrEqual(220);
    expect(chunks.join(" ").split(/\s+/)).toHaveLength(100);
  });

});

describe("Jarvis Web Audio completion", () => {
  it("signals idle only after the final scheduled source actually ends", async () => {
    const sources: Array<{ onended: (() => void) | null }> = [];
    class FakeAudioContext {
      state = "running";
      currentTime = 0;
      destination = {};
      createBuffer(_channels: number, length: number, rate: number) {
        return { duration: length / rate, getChannelData: () => new Float32Array(length) };
      }
      createBufferSource() {
        const source = {
          buffer: null,
          onended: null as (() => void) | null,
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
        sources.push(source);
        return source;
      }
      resume = vi.fn(async () => {});
      close = vi.fn(async () => {});
    }
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    const port = createWebAudioPlaybackPort();
    const onIdle = vi.fn();
    port.playChunk(new Int16Array(240), 24000);
    port.whenIdle(onIdle);
    await Promise.resolve();
    expect(onIdle).not.toHaveBeenCalled();

    sources[0].onended?.();
    expect(onIdle).toHaveBeenCalledOnce();
    port.dispose();
  });

  it("rejects PCM scheduling while the audio context is not actually running", () => {
    class SuspendedAudioContext {
      state = "suspended";
      currentTime = 0;
      destination = {};
      resume = vi.fn(async () => {});
      close = vi.fn(async () => {});
    }
    vi.stubGlobal("window", { AudioContext: SuspendedAudioContext });
    const port = createWebAudioPlaybackPort();
    expect(() => port.playChunk(new Int16Array(240), 24000)).toThrow("Web Audio is not running");
    port.dispose();
  });

  it("does not hide a failed audio-context resume", async () => {
    class BlockedAudioContext {
      state = "suspended";
      currentTime = 0;
      destination = {};
      resume = vi.fn(async () => { throw new Error("autoplay blocked"); });
      close = vi.fn(async () => {});
    }
    vi.stubGlobal("window", { AudioContext: BlockedAudioContext });
    const port = createWebAudioPlaybackPort();
    await expect(port.resume()).rejects.toThrow("autoplay blocked");
    port.dispose();
  });
});

import { useCallback, useEffect, useRef, useState } from "react";
import { createWebAudioPlaybackPort } from "../audio/playback";
import type { SpeechCallbacks } from "../core/engine";
import { audioRms, normalizeVoiceLevel } from "@/features/ev-voice/orbDynamics";

export function splitTtsSentenceChunks(text: string): string[] {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const chunks: string[] = [];
  for (const line of lines) {
    const sentences = /^\d+\.\s/.test(line)
      ? [line]
      : (line.match(/(?:\d+\.\d+|[^.!?။])+[.!?။]?/g) || [line]);
    for (const sentence of sentences) {
      const clean = sentence.trim();
      if (!clean) continue;
      if (clean.length <= 180) { chunks.push(clean); continue; }
      const words = clean.split(/\s+/);
      let current = "";
      for (const word of words) {
        if (current && `${current} ${word}`.length > 180) { chunks.push(current); current = word; }
        else current = current ? `${current} ${word}` : word;
      }
      if (current) chunks.push(current);
    }
  }
  return chunks;
}

export function useEvVoice() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const portRef = useRef<ReturnType<typeof createWebAudioPlaybackPort> | null>(null);
  const playbackChainRef = useRef(Promise.resolve());
  const failureReportedRef = useRef(false);

  const getPort = () => (portRef.current ??= createWebAudioPlaybackPort());

  useEffect(() => {
    const handleLiveAudio = (e: Event) => {
      const customEvent = e as CustomEvent<{ pcm: Int16Array, rate: number }>;
      // Live audio arrives as many small events. Serialize resume + scheduling so
      // the first suspended-context recovery cannot reorder or drop early chunks.
      playbackChainRef.current = playbackChainRef.current.then(async () => {
        const port = getPort();
        if (!port.isRunning?.()) await port.resume();
        port.playChunk(customEvent.detail.pcm, customEvent.detail.rate);
        failureReportedRef.current = false;
        window.dispatchEvent(new CustomEvent("beebot:ev-output-level", {
          detail: normalizeVoiceLevel(audioRms(customEvent.detail.pcm, 32768), 0.002),
        }));
        setIsSpeaking(true);

        port.whenIdle(() => {
          setIsSpeaking(false);
          window.dispatchEvent(new CustomEvent("beebot:ev-output-level", { detail: 0 }));
          window.dispatchEvent(new CustomEvent("beebot:ev-playback-idle"));
        });
      }).catch((error) => {
        setIsSpeaking(false);
        window.dispatchEvent(new CustomEvent("beebot:ev-output-level", { detail: 0 }));
        if (failureReportedRef.current) return;
        failureReportedRef.current = true;
        window.dispatchEvent(new CustomEvent("beebot:ev-playback-error", {
          detail: { message: error instanceof Error ? error.message : String(error) },
        }));
      });
    };
    
    window.addEventListener("beebot:ev-live-audio", handleLiveAudio);
    return () => {
      window.removeEventListener("beebot:ev-live-audio", handleLiveAudio);
      portRef.current?.dispose();
      portRef.current = null;
    };
  }, []);

  const unlock = useCallback(async () => {
    const port = getPort();
    await port.resume();
    failureReportedRef.current = false;
  }, []);

  const stop = useCallback(() => {
    portRef.current?.stopAll();
    playbackChainRef.current = Promise.resolve();
    failureReportedRef.current = false;
    setIsSpeaking(false);
    window.dispatchEvent(new CustomEvent("beebot:ev-output-level", { detail: 0 }));
  }, []);

  const speak = useCallback((text: string, cb?: SpeechCallbacks) => {
    cb?.onStart?.();
    cb?.onEnd?.();
  }, []);

  return { speak, stop, unlock, isSpeaking };
}

export const useJarvisVoice = useEvVoice;

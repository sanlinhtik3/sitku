import { useCallback, useEffect, useRef, useState } from "react";
import { synthesize, synthesizeStream } from "@/components/jarvis/jarvisBrain";

// JARVIS text-to-speech, three tiers, each a fallback for the one before:
//   1. STREAMING Gemini TTS → Web Audio — plays audio as it arrives (first sound in ~0.5s, not the
//      whole clip). This is the fast path.
//   2. Non-streaming Gemini TTS → one persistent <audio> blob (autoplay-robust) — if streaming isn't
//      supported by the chosen model/tier or the AudioContext can't run.
//   3. Browser speechSynthesis — last resort (mangles Burmese; better than silence).
// isSpeaking flips true only when audio ACTUALLY starts (mirrors the real start→end edge the orb's
// resume logic depends on); a token guard makes a newer reply abandon any in-flight one.
export function useJarvisVoice() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<AudioBufferSourceNode[]>([]);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const tokenRef = useRef(0);

  useEffect(() => {
    const el = new Audio();
    el.preload = "auto";
    audioElRef.current = el;
    return () => {
      el.pause(); el.src = "";
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
      void ctxRef.current?.close();
    };
  }, []);

  const getCtx = () => {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return ctxRef.current;
  };

  const stop = useCallback(() => {
    tokenRef.current++;
    if (endTimerRef.current) { clearTimeout(endTimerRef.current); endTimerRef.current = null; }
    nodesRef.current.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } });
    nodesRef.current = [];
    const el = audioElRef.current;
    if (el) { el.pause(); el.onended = null; el.onerror = null; }
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const speak = useCallback((text: string) => {
    stop();
    const clean = text.replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim();
    if (!clean) return;
    const myToken = ++tokenRef.current;

    void (async () => {
      const ctx = getCtx();
      await ctx.resume().catch(() => {});
      // If the context can't run (no user-activation), skip streaming — the blob <audio> path is
      // autoplay-robust and will handle it.
      if (ctx.state === "running") {
        let nextTime = 0, started = false;
        const scheduleEnd = () => {
          if (endTimerRef.current) clearTimeout(endTimerRef.current);
          endTimerRef.current = setTimeout(() => {
            if (tokenRef.current === myToken) setIsSpeaking(false);
          }, Math.max(0, (nextTime - ctx.currentTime) * 1000) + 150);
        };
        try {
          await synthesizeStream(clean, (pcm, rate) => {
            if (tokenRef.current !== myToken || pcm.length === 0) return;
            const buf = ctx.createBuffer(1, pcm.length, rate);
            const ch = buf.getChannelData(0);
            for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(ctx.destination);
            const at = Math.max(ctx.currentTime + 0.03, nextTime); // small lead avoids underrun clicks
            src.start(at);
            nextTime = at + buf.duration;
            nodesRef.current.push(src);
            if (!started) { started = true; setIsSpeaking(true); }
            scheduleEnd();
          });
          if (started) return; // streamed OK
        } catch {
          if (tokenRef.current !== myToken) return;
          // fall through to blob
        }
      }
      if (tokenRef.current !== myToken) return;
      blobFallback(clean, myToken);
    })();

    // Tier 2 + 3.
    function blobFallback(t: string, token: number) {
      synthesize(t)
        .then((blob) => {
          if (tokenRef.current !== token) return;
          const el = audioElRef.current;
          if (!el) { browserSpeak(t, setIsSpeaking); return; }
          const url = URL.createObjectURL(blob);
          urlRef.current = url;
          el.src = url;
          el.onended = () => { if (tokenRef.current === token) setIsSpeaking(false); if (urlRef.current === url) { URL.revokeObjectURL(url); urlRef.current = null; } };
          el.onerror = () => { if (tokenRef.current === token) { setIsSpeaking(false); browserSpeak(t, setIsSpeaking); } };
          el.play()
            .then(() => { if (tokenRef.current === token) setIsSpeaking(true); })
            .catch(() => { if (tokenRef.current === token) { setIsSpeaking(false); browserSpeak(t, setIsSpeaking); } });
        })
        .catch(() => { if (tokenRef.current === token) browserSpeak(t, setIsSpeaking); });
    }
  }, [stop]);

  return { speak, stop, isSpeaking };
}

// Last resort only. Speaks Burmese poorly (no my-MM voice on most systems) but better than silence.
function browserSpeak(text: string, setSpeaking: (v: boolean) => void) {
  if (!("speechSynthesis" in window)) { setSpeaking(false); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "my-MM";
  const my = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("my"));
  if (my) u.voice = my;
  u.onstart = () => setSpeaking(true);
  u.onend = () => setSpeaking(false);
  u.onerror = () => setSpeaking(false);
  window.speechSynthesis.speak(u);
}

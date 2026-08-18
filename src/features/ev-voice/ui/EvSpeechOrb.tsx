import { useEffect, useMemo, useRef } from "react";
import type { EnginePhase } from "@/features/jarvis/core/engine";
import { evOrbVisualState, orbSpectrumBands, smoothVoiceLevel } from "../orbDynamics";

const BAND_COUNT = 5;

interface EvSpeechOrbProps {
  phase: EnginePhase;
  heardVoice: boolean;
  getAnalyser: () => AnalyserNode | null;
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
}

/**
 * Visual adapter for the speech-to-speech orb. Capture, playback, VAD and the
 * Gemini Live transport remain owned by E.V's existing ports.
 */
export function EvSpeechOrb({
  phase,
  heardVoice,
  getAnalyser,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
}: EvSpeechOrbProps) {
  const orbRef = useRef<HTMLButtonElement | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const visualState = useMemo(() => evOrbVisualState(phase, heardVoice), [phase, heardVoice]);

  useEffect(() => {
    const orb = orbRef.current;
    if (!orb) return;

    let frame = 0;
    let outputLevel = 0;
    let frequencyData = new Uint8Array(0);
    const bands = new Float32Array(BAND_COUNT);
    let level = 0;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const onOutputLevel = (event: Event) => {
      const next = Number((event as CustomEvent<number>).detail);
      outputLevel = Number.isFinite(next) ? Math.max(0, Math.min(1, next)) : 0;
    };
    window.addEventListener("beebot:ev-output-level", onOutputLevel);

    const tick = () => {
      const currentPhase = phaseRef.current;
      const analyser = currentPhase === "recording" || currentPhase === "listening" ? getAnalyser() : null;
      let targets = [0, 0, 0, 0, 0];
      let targetLevel = 0.08;

      if (analyser) {
        if (frequencyData.length !== analyser.frequencyBinCount) {
          frequencyData = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(frequencyData);
        targets = orbSpectrumBands(frequencyData);
        targetLevel = Math.max(...targets);
      } else if (currentPhase === "speaking") {
        targetLevel = outputLevel;
        targets = [0.72, 1, 0.84, 0.62, 0.44].map((weight) => outputLevel * weight);
        outputLevel *= 0.92;
      } else if (currentPhase === "thinking" || currentPhase === "running_skill" || currentPhase === "resuming") {
        targetLevel = 0.18;
      }

      if (reducedMotion) targetLevel = Math.min(targetLevel, 0.22);
      level = smoothVoiceLevel(level, targetLevel);
      for (let index = 0; index < BAND_COUNT; index++) {
        const target = reducedMotion ? Math.min(targets[index], 0.22) : targets[index];
        bands[index] = smoothVoiceLevel(bands[index], target);
        orb.style.setProperty(`--ev-orb-bar-${index}`, bands[index].toFixed(3));
      }
      orb.style.setProperty("--ev-orb-input-level", level.toFixed(3));
      orb.style.setProperty("--ev-orb-output-level", (currentPhase === "speaking" ? level : 0).toFixed(3));
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("beebot:ev-output-level", onOutputLevel);
      for (let index = 0; index < BAND_COUNT; index++) orb.style.removeProperty(`--ev-orb-bar-${index}`);
      orb.style.removeProperty("--ev-orb-input-level");
      orb.style.removeProperty("--ev-orb-output-level");
    };
  }, [getAnalyser]);

  return (
    <button
      ref={orbRef}
      type="button"
      className="ev-speech-orb touch-none select-none"
      data-orb-state={visualState}
      aria-label="Control E.V voice conversation"
      onPointerDown={(event) => { event.stopPropagation(); onPointerDown(); }}
      onPointerUp={(event) => { event.stopPropagation(); onPointerUp(); }}
      onPointerLeave={onPointerLeave}
    >
      <span className="ev-speech-orb-glow" aria-hidden="true" />
      <span className="ev-speech-orb-ring" aria-hidden="true" />
      <span className="ev-speech-orb-ring-outer" aria-hidden="true" />
      <span className="ev-speech-orb-core">
        <span className="ev-speech-orb-indicator" aria-hidden="true">
          <svg className="ev-speech-orb-icon ev-speech-orb-mic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" stroke="none" />
            <path d="M5 10a7 7 0 0 0 14 0" />
            <path d="M12 19v3M8 22h8" />
          </svg>
          <span className="ev-speech-orb-spinner" />
          <span className="ev-speech-orb-thinking"><i /><i /><i /></span>
          <span className="ev-speech-orb-bars">
            {Array.from({ length: BAND_COUNT }, (_, index) => <i key={index} />)}
          </span>
          <svg className="ev-speech-orb-icon ev-speech-orb-voice" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 10v4a1 1 0 0 0 1 1h3l5 4V5L7 9H4a1 1 0 0 0-1 1z" fill="currentColor" stroke="none" />
            <path className="wave wave-1" d="M16 8a5 5 0 0 1 0 8" />
            <path className="wave wave-2" d="M19 5a9 9 0 0 1 0 14" />
          </svg>
          <svg className="ev-speech-orb-icon ev-speech-orb-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12 4 4L19 6" />
          </svg>
        </span>
      </span>
    </button>
  );
}

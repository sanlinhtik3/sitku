# Domain Vocabulary — Sitku BeeBot

This document defines the ubiquitous language and architectural terms used across the codebase.
When designing modules or discussing architecture, always use these exact terms.

## JARVIS Voice Pipeline & Realtime Architecture

- **`AudioCapturePort`**: Seam interface for acquiring audio input chunks from a microphone or synthetic test source at native sample rate (`onChunk(chunk: Float32Array, sampleRate: number)`). Decouples voice activity detection from browser hardware APIs.
- **`AudioPlaybackPort`**: Seam interface for scheduling and playing back PCM audio chunks with gapless timing (`playChunk(pcm, rate)`, `stopAll()`). Operates independently of microphone acquisition.
- **`RealtimeTransportPort`**: *(RETIRED 2026-07-09)* — was the Gemini Live duplex WebSocket seam. The Live path was deleted (never connected on-device; its fallback toast only added a mode choice). JARVIS is now one turn-based engine; this term is kept only to explain older commits.
- **`VoicePipelineEngine`**: Deep module coordinating the single turn-based conversation loop — state (`idle`, `recording`, `thinking`, `confirm`, `speaking`, `resuming`), Voice Activity Detection (VAD), and echo-guard cooldown — without leaking presentation concerns into UI components. Lives in `voicePipelineEngine.ts`; its behavior contract is `__tests__/voicePipelineEngine.test.ts` (fake deps + fake timers) — change behavior there first.
- **`TurnAudioSession`**: The turn-based (walkie-talkie) mic session adapter in `pcmCapture.ts` — owns getUserMedia (via the shared `MIC_CONSTRAINTS` policy), the audio graph, the analyser, and speech-band `energy()` sampling. Two-phase lifecycle: `acquire()` once per orb-open (permission prompt), `begin()/end()` per utterance. Structurally satisfies the engine's capture dependency; the VAD *policy* stays in the engine.

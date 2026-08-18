# ADR 0003: E.V Gemini Live Runtime

## Status

Accepted.

## Decision

E.V is Sitku's active voice runtime. It uses one duplex Gemini Live session for
microphone audio, native model audio, input/output transcripts, tool calls,
session resumption, and explicit interruption.

The old Jarvis module names remain only as compatibility adapters for existing
encrypted keys, action history, SQLite journal rows, and internal imports. New
application code must import the public `features/ev-voice` boundary.

## Runtime boundaries

1. `audio/capture` streams 16-bit PCM at 16 kHz to Gemini Live.
2. `GeminiLiveClient` owns the v1beta WebSocket, setup contract, reconnect, and
   resumable session handle.
3. Gemini returns native 24 kHz PCM audio and input/output transcripts.
4. `audio/playback` queues PCM chunks. Microphone forwarding is suspended while
   E.V audio is playing so speaker echo cannot cancel the response.
5. The engine validates tool calls, applies confirmation policy, claims an
   idempotency key, executes the existing Sitku action, and journals the result.
6. The UI renders engine state only; it does not run a second STT or TTS system.

## Security

Electron keeps the Gemini key encrypted with OS secure storage. The main process
mints a one-use, short-lived, model-constrained Live token for the renderer. The
saved API key is never returned to the renderer. Browser mode retains direct-key
support for local development because it has no trusted native process.

The provider first requests a model-constrained token. If a Gemini v1beta
provisioning rollout explicitly rejects only the `liveConnectConstraints` field,
it retries once with Google's documented basic one-use token schema. Other HTTP
errors are surfaced unchanged and never trigger a weaker or repeated fallback.

## Reliability rules

- One active WebSocket and one playback queue per assistant instance.
- Server GoAway retires the old socket before a resumed socket opens.
- UI exits `resuming` only after the replacement setup completes.
- Important writes require confirmation and an idempotency claim.
- Only final transcripts, intent, approval, action result, and errors are
  journaled; raw microphone and model audio are not persisted.
- No browser speech synthesis fallback is allowed in the active E.V path.

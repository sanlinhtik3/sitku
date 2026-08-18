# E.V Voice Architecture

E.V uses explicit ports so fixes stay inside the owning layer.

| Concern | Owner |
| --- | --- |
| Live voice and narrative conversation contracts | `protocols/` |
| Gemini Live transport adapter | `../jarvis/services/geminiLive.ts` |
| Capability metadata and dispatch | `capabilities/` |
| Workspace and note tools | `workspace/` |
| Terminal policy and execution | `terminal/` |
| Conversation memory | `memory/` |
| Delegated agent work | `operator/` |
| Voice state machine | `../jarvis/core/engine.ts` |
| Browser audio and UI composition | `../jarvis/audio/`, `../jarvis/ui/` |

The `jarvis` path remains as a compatibility namespace for persisted settings,
history, and Electron APIs. New provider code must implement `EvLiveProtocol` and
be injected at the UI composition root. Core engine code must not import a
provider client, provider settings, or provider model profiles directly.

New tools must be registered through `EvCapabilityRegistry`; the model receives
only the declarations published by that registry. The registry is also the
execution gateway: it applies metadata policy, requires an adapter preview for
dynamic risk, blocks unapproved writes, verifies required evidence, contains
adapter errors, publishes lifecycle events, and fans out cancellation. Tool
adapters own domain validation and execution; the voice UI never decides safety.

Capability execution order:

1. Resolve the immutable descriptor and adapter.
2. Preview dynamic risk and build the visible approval request.
3. Enforce approval from descriptor metadata.
4. Execute through the owning adapter with cancellation and idempotency context.
5. Reject unverifiable success when the descriptor requires evidence.
6. Emit a bounded lifecycle event for terminal diagnostics and the turn journal.

Conversation delivery is owned by `EvNarrativeConversationProtocol`, not by the
provider adapter or UI. It keeps commands, failures, approvals, and grounded
facts result-first. Explanation, coaching, and creative turns may use a compact
context-to-insight spoken arc when it improves understanding. Gemini Native
Audio remains responsible for acoustic delivery; the protocol controls response
shape and prevents storytelling from weakening evidence or action accuracy.

Live transport recovery is bounded by `EvLiveReliabilityProtocol`. A replacement
WebSocket resumes only from Google's latest session checkpoint. Tool responses
are kept in a small in-memory, ID-deduplicated queue and replayed once after a
verified resume; raw microphone audio is never replayed. A new explicit session
always clears credentials, resume handles, and pending controls.
